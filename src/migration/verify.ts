/**
 * Reconciliation (`lines`) + final-structure report (`finalization`).
 * Read-only; probes degrade instead of throwing (objects may be missing
 * before ddl and after activate). Preflight gates runnability.
 */
import { PrismaClient } from '@prisma/client';
import {
  TARGET_TYPE,
  columnDefault,
  esc,
  legacyGroupColumn,
  legacyKeyColumn,
  ownerColumn,
  qi,
  qtable,
  splitList,
  tableExists,
  toCount,
  userKeyColumn,
} from './db';
import { FKS } from './phases-e5';
import { QUARANTINE_TABLE, RUN_TABLE, STATE_TABLE } from './state';

export interface VerifyLine { entity: string; source: number; mapped: number; quarantined: number; }

export interface FinalCheck { check: string; ok: boolean; detail: string; }

async function columnType(exec: { $queryRawUnsafe: PrismaClient['$queryRawUnsafe'] }, db: string, table: string, column: string): Promise<string> {
  try {
    const rows = (await exec.$queryRawUnsafe(
      `SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = '${esc(table)}' AND COLUMN_NAME = '${esc(column)}'`,
    )) as Array<{ t: string }>;
    return rows.length > 0 ? String(rows[0].t) : '';
  } catch {
    return '';
  }
}

async function columnKey(exec: { $queryRawUnsafe: PrismaClient['$queryRawUnsafe'] }, db: string, table: string, column: string): Promise<string> {
  try {
    const rows = (await exec.$queryRawUnsafe(
      `SELECT COLUMN_KEY AS k FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = '${esc(table)}' AND COLUMN_NAME = '${esc(column)}'`,
    )) as Array<{ k: string }>;
    return rows.length > 0 ? String(rows[0].k) : '';
  } catch {
    return '';
  }
}

/** Final table that holds an entity once its legacy source is retired. */
const FINAL_TABLE: Record<string, string> = {
  TripGroup: 'trip_groups',
  Like: 'likes',
  Favorite: 'favorites',
  Report: 'reports',
  Image: 'images',
};

/** Longest target `users.status` value (`PENDING_VERIFICATION`). */
const PENDING_STATUS_LENGTH = 'PENDING_VERIFICATION'.length;

/** Target auth token tables of the user/security contract. */
const TOKEN_TABLES = ['email_verification_tokens', 'password_reset_tokens', 'refresh_tokens'];

/** Polymorphic `targetTypeId` -> the table its bare `targetId` points at. */
const POLYMORPHIC_PARENT: Record<number, string> = {
  [TARGET_TYPE.tripGroup]: 'trip_groups',
  [TARGET_TYPE.trip]: 'trips',
  [TARGET_TYPE.point]: 'points',
  [TARGET_TYPE.image]: 'images',
  [TARGET_TYPE.comment]: 'comments',
};

/** INT-keyed entities whose 0 placeholder must be promoted by the pkswap. */
const INT_KEYED = ['Trip', 'Point', 'Comment', 'FailedLog', 'RouteNotFoundLog'];

export async function verifyMigration(
  prisma: PrismaClient,
  db: string,
  runId: number,
  opts?: { dryRun?: boolean; verifyOnly?: boolean },
): Promise<{ lines: VerifyLine[]; finalization: FinalCheck[] }> {
  void runId;
  void opts;
  // Missing objects are normal at both ends of the lifecycle (pre-ddl,
  // post-activate); only that case degrades, other errors still fail the report.
  const safeRows = async <T>(sql: string): Promise<T[] | null> => {
    try {
      return (await prisma.$queryRawUnsafe(sql)) as T[];
    } catch (e) {
      const m = String((e as Error).message || '');
      if (m.includes("doesn't exist") || m.includes('Unknown column') || m.includes('Unknown table')) return null;
      throw e;
    }
  };
  const safeCount = async (sql: string): Promise<number | null> => {
    const rows = await safeRows<Record<string, unknown>>(sql);
    return rows === null ? null : toCount(rows);
  };
  const countOf = async (sql: string): Promise<number> => (await safeCount(sql)) ?? 0;

  const hasState = await tableExists(prisma, db, STATE_TABLE);
  const hasQuarantine = await tableExists(prisma, db, QUARANTINE_TABLE);
  const mappedOf = async (entity: string): Promise<number> =>
    hasState ? await countOf(`SELECT COUNT(*) AS c FROM ${qtable(db, STATE_TABLE)} WHERE ${qi('entity')} = '${esc(entity)}'`) : 0;
  const quarantinedOf = async (entity: string): Promise<number> =>
    hasQuarantine ? await countOf(`SELECT COUNT(*) AS c FROM ${qtable(db, QUARANTINE_TABLE)} WHERE ${qi('entity')} = '${esc(entity)}'`) : 0;

  /** Rows of a live table; null when the table itself does not exist. */
  const rowCount = async (table: string): Promise<number | null> =>
    (await tableExists(prisma, db, table)) ? await safeCount(`SELECT COUNT(*) AS c FROM ${qtable(db, table)}`) : null;

  /** Split legacy blob-of-tokens columns with the phases' splitter; null when
   *  none of the columns exists (pre-ddl or retired by activate). */
  const tokenSource = async (sources: Array<[string, string]>): Promise<number | null> => {
    let readable = false;
    let total = 0;
    for (const [table, column] of sources) {
      if (!(await tableExists(prisma, db, table))) continue;
      if ((await columnType(prisma, db, table, column)) === '') continue;
      const rows = await safeRows<{ raw: unknown }>(`SELECT ${qi(column)} AS raw FROM ${qtable(db, table)}`);
      if (rows === null) continue;
      readable = true;
      for (const r of rows) total += splitList(r.raw).length;
    }
    return readable ? total : null;
  };

  /** Distinct legacy VARCHAR group keys; null once groupfinalize drops the
   *  column (trip_groups rows become the source of truth). */
  const tripGroupSource = async (): Promise<number | null> => {
    if ((await legacyGroupColumn(prisma, db)) !== 'tripGroupId') return null;
    return safeCount(
      `SELECT COUNT(DISTINCT ${qi('tripGroupId')}) AS c FROM ${qtable(db, 'trips')} ` +
        `WHERE ${qi('tripGroupId')} IS NOT NULL AND TRIM(${qi('tripGroupId')}) <> ''`,
    );
  };

  const specs: Array<{ entity: string; source: () => Promise<number | null> }> = [
    { entity: 'TripGroup', source: tripGroupSource },
    { entity: 'Trip', source: () => rowCount('trips') },
    { entity: 'Point', source: () => rowCount('points') },
    { entity: 'Comment', source: () => rowCount('comments') },
    { entity: 'Like', source: () => tokenSource([['trips', 'likes']]) },
    { entity: 'Favorite', source: () => tokenSource([['trips', 'favorites']]) },
    { entity: 'Report', source: () => tokenSource([['trips', 'reportTrip'], ['comments', 'reportComment']]) },
    { entity: 'Image', source: () => tokenSource([['trips', 'imageFile'], ['points', 'imageFile'], ['users', 'imageFile']]) },
    { entity: 'FailedLog', source: () => rowCount('failedlogs') },
    { entity: 'RouteNotFoundLog', source: () => rowCount('routenotfoundlogs') },
  ];
  const lines: VerifyLine[] = [];
  for (const s of specs) {
    const legacy = await s.source();
    const finalTable = FINAL_TABLE[s.entity];
    const source = legacy ?? (finalTable ? ((await rowCount(finalTable)) ?? 0) : 0);
    lines.push({ entity: s.entity, source, mapped: await mappedOf(s.entity), quarantined: await quarantinedOf(s.entity) });
  }
  // In-place entities: source rows ARE the target rows; mapped = createdAt backfilled.
  for (const [entity, table] of [['User', 'users'], ['Verify', 'verify']] as const) {
    lines.push({
      entity,
      source: (await rowCount(table)) ?? 0,
      mapped: await countOf(`SELECT COUNT(*) AS c FROM ${qtable(db, table)} WHERE ${qi('createdAt')} IS NOT NULL`),
      quarantined: await quarantinedOf(entity),
    });
  }

  const finalization: FinalCheck[] = [];
  const push = (check: string, ok: boolean, detail: string): void => {
    finalization.push({ check, ok, detail });
  };

  // Final shape: INT AUTO_INCREMENT `id` PK, no `_id`; `legacyId` is UNIQUE
  // while present and retired by activate.
  for (const t of ['trips', 'points', 'comments', 'failedlogs', 'routenotfoundlogs']) {
    const idType = await columnType(prisma, db, t, 'id');
    const idKey = await columnKey(prisma, db, t, 'id');
    const idFinal = idType !== '' && idType.toLowerCase().includes('int') && idKey === 'PRI';
    if (!idType) push(`PK ${t}.id is INT AUTO_INCREMENT`, false, 'id column missing (pkswap not applied yet)');
    else if (!idFinal) push(`PK ${t}.id is INT AUTO_INCREMENT`, false, `id is ${idType} key=${idKey || 'none'}`);
    else push(`PK ${t}.id is INT AUTO_INCREMENT`, true, `${idType} PRIMARY KEY`);
    const legacyKey = await columnKey(prisma, db, t, 'legacyId');
    if (legacyKey === 'UNI') push(`${t}.legacyId preserved UNIQUE`, true, 'legacyId present for mapping');
    else if (legacyKey !== '') push(`${t}.legacyId preserved UNIQUE`, false, `legacyId key is ${legacyKey} (UNIQUE required)`);
    else {
      push(
        `${t}.legacyId preserved UNIQUE`,
        idFinal,
        idFinal ? 'UUID bridge retired by the activate step (final schema keeps none)' : 'legacyId missing (ddl phase not applied yet)',
      );
    }
  }

  // Transitional columns must be gone in the final schema: `_id` (pkswap),
  // `_ownerTripId`/`_tripId` (activate), `tripGroupNewId` (groupfinalize).
  const transitional: Array<[string, string]> = [
    ['trips', '_id'],
    ['points', '_id'],
    ['comments', '_id'],
    ['failedlogs', '_id'],
    ['routenotfoundlogs', '_id'],
    ['points', '_ownerTripId'],
    ['comments', '_tripId'],
    ['trips', 'tripGroupNewId'],
  ];
  for (const [t, col] of transitional) {
    const stillThere = (await columnType(prisma, db, t, col)) !== '';
    push(
      `transitional ${t}.${col} removed`,
      !stillThere,
      stillThere ? `${t}.${col} still present (phase not applied yet)` : 'removed',
    );
  }

  // The user key is `users._id` before the activate rename and `users.id` after.
  const userKey = (await userKeyColumn(prisma, db)) || '_id';
  const userType = await columnType(prisma, db, 'users', userKey);
  push(
    `users.${userKey} remains UUID VARCHAR(36)`,
    userType !== '' && userType.toLowerCase().includes('varchar(36)'),
    userType ? `users.${userKey} is ${userType}` : `users.${userKey} missing`,
  );

  if (hasState) {
    const dupState = await countOf(
      `SELECT COUNT(*) AS c FROM (SELECT ${qi('entity')}, ${qi('legacy_key')} FROM ${qtable(db, STATE_TABLE)} GROUP BY ${qi('entity')}, ${qi('legacy_key')} HAVING COUNT(*) > 1) d`,
    );
    push('migration_state legacy mapping is one-to-one', dupState === 0, dupState === 0 ? 'no duplicate (entity, legacy_key)' : `${dupState} duplicate mapping(s)`);
    const orphanState = await countOf(`SELECT COUNT(*) AS c FROM ${qtable(db, STATE_TABLE)} WHERE ${qi('new_id')} IS NULL`);
    push('migration_state has no orphan (NULL new_id) mappings', orphanState === 0, orphanState === 0 ? 'all mappings resolve' : `${orphanState} NULL mapping(s)`);
    // Data phases park a 0 placeholder (validated, INT pending); after pkswap
    // a surviving 0 means an interrupted mapping, before it it is expected.
    const swapped = (await legacyKeyColumn(prisma, db, 'trips')) === 'legacyId';
    if (!swapped) {
      push('no 0-placeholder mappings remain', false, 'pending — pkswap phase not applied yet (trips._id still present)');
    } else {
      const placeholders = await countOf(
        `SELECT COUNT(*) AS c FROM ${qtable(db, STATE_TABLE)} WHERE ${qi('entity')} IN ('${INT_KEYED.join("','")}') AND ${qi('new_id')} = 0`,
      );
      push(
        'no 0-placeholder mappings remain',
        placeholders === 0,
        placeholders === 0 ? 'every retained row has a real INT mapping' : `${placeholders} mapping(s) still at the 0 placeholder`,
      );
    }
  }

  const groupType = await columnType(prisma, db, 'trips', 'tripGroupId');
  const groupFinalized = groupType !== '' && groupType.toLowerCase().includes('int');
  push(
    'trips.tripGroupId finalized INT',
    groupFinalized,
    groupFinalized ? groupType : groupType === '' ? 'trips.tripGroupId missing (ddl phase pending)' : `${groupType} (groupfinalize not applied yet)`,
  );

  // MySQL UNIQUE never conflicts on NULL and parked trips hold NULL by design:
  // only fully populated pairs are in scope, exactly like the index itself.
  const dupGroupDay =
    groupType === ''
      ? null
      : await safeCount(
          `SELECT COUNT(*) AS c FROM (SELECT ${qi('tripGroupId')}, ${qi('dayNumber')} FROM ${qtable(db, 'trips')} ` +
            `WHERE ${qi('tripGroupId')} IS NOT NULL AND ${qi('dayNumber')} IS NOT NULL ` +
            `GROUP BY ${qi('tripGroupId')}, ${qi('dayNumber')} HAVING COUNT(*) > 1) d`,
        );
  push(
    'UNIQUE(tripGroupId, dayNumber) holds',
    dupGroupDay === 0,
    dupGroupDay === null
      ? 'pending — trips.tripGroupId not present yet'
      : dupGroupDay === 0
        ? 'no duplicate group/day pairs (NULL pairs exempt, like the index)'
        : `${dupGroupDay} duplicate pair(s)`,
  );

  const ttGood = await safeCount(
    `SELECT COUNT(*) AS c FROM ${qtable(db, 'target_types')} WHERE (${qi('id')}, ${qi('name')}) IN ((1,'tripGroup'),(2,'trip'),(3,'point'),(4,'image'),(5,'comment'))`,
  );
  push(
    'target_types seeded (1 tripGroup .. 5 comment)',
    ttGood === 5,
    ttGood === null
      ? 'pending — target_types missing (ddl phase not applied yet)'
      : ttGood === 5
        ? 'all five seed rows present'
        : `${5 - ttGood} of 5 seed row(s) missing`,
  );

  const fkCount =
    (await safeCount(
      `SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = '${esc(db)}' AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    )) ?? 0;
  const structureFinal = groupFinalized && fkCount > 0;

  // All present and all gone are both legitimate (activate drops the tables
  // last); anything in between is a broken tooling state.
  const missingControl: string[] = [];
  for (const t of [RUN_TABLE, STATE_TABLE, QUARANTINE_TABLE]) {
    if (!(await tableExists(prisma, db, t))) missingControl.push(t);
  }
  if (missingControl.length === 0) {
    push('migration control tables present', true, 'mapping + quarantine evidence available');
  } else {
    const retired = missingControl.length === 3 && structureFinal;
    push(
      'migration control tables present',
      retired,
      retired
        ? 'dropped by the activate step — the final database holds no migration machinery'
        : `missing: ${missingControl.join(', ')} — run the ddl phase before data migration`,
    );
  }

  // Exact final FK set (phases-e5); integrity is proven on the data before
  // the constraint exists, so activation is never blind.
  const usersRef = (await userKeyColumn(prisma, db)) || '_id';
  for (const [, table, column, refTable, refColumn] of FKS) {
    // `_ownerId` becomes `ownerId` after activate: resolve, don't assume.
    const child = column === 'ownerId' ? (await ownerColumn(prisma, db, table)) || 'ownerId' : column;
    const ref = refColumn === '' ? usersRef : refColumn;
    const check = `FK ${table}.${child} -> ${refTable}.${ref} valid`;
    const childReady = (await columnType(prisma, db, table, child)) !== '';
    const parentReady = (await columnType(prisma, db, refTable, ref)) !== '';
    if (!childReady || !parentReady) {
      push(check, false, `pending — ${childReady ? `${refTable}.${ref}` : `${table}.${child}`} not created yet (ddl phase not applied)`);
      continue;
    }
    // Legacy VARCHAR group keys until groupfinalize: joining them against
    // INT trip_groups.id would only produce noise, so wait for the final shape.
    if (table === 'trips' && column === 'tripGroupId' && !groupFinalized) {
      push(check, false, `pending — trips.tripGroupId is ${groupType} (groupfinalize not applied yet)`);
      continue;
    }
    const orphans = await countOf(
      `SELECT COUNT(*) AS c FROM ${qtable(db, table)} k LEFT JOIN ${qtable(db, refTable)} p ON p.${qi(ref)} = k.${qi(child)} ` +
        `WHERE k.${qi(child)} IS NOT NULL AND p.${qi(ref)} IS NULL`,
    );
    push(check, orphans === 0, orphans === 0 ? 'no orphan references' : `${orphans} orphan reference(s)`);
  }

  // Polymorphic pointers carry no FK in the final schema; integrity is proven
  // per target type (targetTypeId + bare targetId) instead.
  const polymorphicBroken = async (table: string): Promise<number | null> => {
    if ((await columnType(prisma, db, table, 'targetTypeId')) === '') return null;
    if ((await columnType(prisma, db, table, 'targetId')) === '') return null;
    const untyped = await safeCount(`SELECT COUNT(*) AS c FROM ${qtable(db, table)} WHERE ${qi('targetTypeId')} IS NULL`);
    const types = await safeRows<{ t: unknown }>(
      `SELECT DISTINCT ${qi('targetTypeId')} AS t FROM ${qtable(db, table)} WHERE ${qi('targetTypeId')} IS NOT NULL`,
    );
    if (untyped === null || types === null) return null;
    let broken = untyped;
    for (const row of types) {
      const type = Number(row.t);
      if (!Number.isFinite(type)) continue; // INT column: unreachable, kept for safety.
      const parent = POLYMORPHIC_PARENT[type];
      if (parent === undefined) {
        // Unknown / never-seeded target type: those rows can never resolve.
        broken += await countOf(`SELECT COUNT(*) AS c FROM ${qtable(db, table)} WHERE ${qi('targetTypeId')} = ${Math.trunc(type)}`);
        continue;
      }
      if ((await columnType(prisma, db, parent, 'id')) === '') return null;
      broken += await countOf(
        `SELECT COUNT(*) AS c FROM ${qtable(db, table)} t LEFT JOIN ${qtable(db, parent)} p ON p.${qi('id')} = t.${qi('targetId')} ` +
          `WHERE t.${qi('targetTypeId')} = ${Math.trunc(type)} AND (t.${qi('targetId')} IS NULL OR p.${qi('id')} IS NULL)`,
      );
    }
    return broken;
  };
  for (const table of ['comments', 'likes', 'reports']) {
    const broken = await polymorphicBroken(table);
    push(
      `${table}.targetTypeId/targetId resolve`,
      broken === 0,
      broken === null
        ? `pending — ${table}.targetTypeId/targetId not created yet (ddl phase not applied)`
        : broken === 0
          ? 'every typed target resolves'
          : `${broken} untyped/unresolvable row(s) — constraint must NOT be enabled yet`,
    );
  }

  // User/security contract: the verified-at column, a status column that accepts
  // PENDING_VERIFICATION without defaulting to ACTIVE, and the three token tables
  // that keep only a hash. Their FKs/indexes are reported by the FK block below.
  const emailVerifiedAt = await columnType(prisma, db, 'users', 'emailVerifiedAt');
  push(
    'users.emailVerifiedAt present',
    emailVerifiedAt !== '',
    emailVerifiedAt !== ''
      ? `column type ${emailVerifiedAt}`
      : 'pending — users.emailVerifiedAt not created yet (ddl phase not applied)',
  );

  const statusType = (await columnType(prisma, db, 'users', 'status')).toLowerCase();
  const statusLength = /^varchar\((\d+)\)/.exec(statusType);
  const statusFits = statusType.startsWith('enum(')
    ? statusType.includes('pending_verification')
    : statusLength !== null && Number(statusLength[1]) >= PENDING_STATUS_LENGTH;
  push(
    'users.status accepts PENDING_VERIFICATION',
    statusFits,
    statusType === ''
      ? 'pending — users.status not readable'
      : statusFits
        ? `column type ${statusType}`
        : `column type ${statusType} cannot hold a ${PENDING_STATUS_LENGTH}-char status`,
  );

  const statusDefault = await columnDefault(prisma, db, 'users', 'status');
  push(
    "users.status does not default to 'ACTIVE'",
    statusDefault !== undefined && statusDefault !== 'ACTIVE',
    statusDefault === undefined
      ? 'pending — users.status not readable'
      : statusDefault === null
        ? 'no column default, the application must set the status'
        : `default ${statusDefault}`,
  );

  const missingTokenTables: string[] = [];
  for (const table of TOKEN_TABLES) {
    if (!(await tableExists(prisma, db, table))) missingTokenTables.push(table);
  }
  push(
    'auth token tables present',
    missingTokenTables.length === 0,
    missingTokenTables.length === 0
      ? TOKEN_TABLES.join(', ')
      : `pending — missing: ${missingTokenTables.join(', ')} (ddl phase not applied)`,
  );

  const missingHashes: string[] = [];
  for (const table of TOKEN_TABLES) {
    if ((await columnType(prisma, db, table, 'tokenHash')) === '') missingHashes.push(table);
  }
  push(
    'token tables store a token hash, never the raw token',
    missingHashes.length === 0,
    missingHashes.length === 0
      ? 'tokenHash present on every token table'
      : `pending — tokenHash missing on: ${missingHashes.join(', ')}`,
  );


  push(
    'FK constraints exist in schema',
    fkCount > 0,
    fkCount > 0 ? `${fkCount} FOREIGN KEY constraint(s) present` : 'no FOREIGN KEY constraints yet (activate phase not applied)',
  );
  // Timestamp completeness: the target columns are NULL-able with no DB default,
  // so a migrated row must always carry a date (legacy value, else the migration
  // clock). Rows a phase refused (quarantine) are never written and stay NULL.
  const stampTables: Array<{ table: string; cols: string[] }> = [
    { table: 'users', cols: ['createdAt', 'updatedAt'] },
    { table: 'trip_groups', cols: ['createdAt', 'updatedAt'] },
    { table: 'trips', cols: ['createdAt', 'updatedAt'] },
    { table: 'points', cols: ['createdAt', 'updatedAt'] },
    { table: 'comments', cols: ['createdAt', 'updatedAt'] },
    { table: 'images', cols: ['createdAt', 'updatedAt'] },
    { table: 'verify', cols: ['createdAt', 'updatedAt'] },
    { table: 'failedlogs', cols: ['createdAt'] },
    { table: 'routenotfoundlogs', cols: ['createdAt'] },
    { table: 'likes', cols: ['createdAt'] },
    { table: 'favorites', cols: ['createdAt'] },
    { table: 'reports', cols: ['createdAt'] },
    { table: 'email_verification_tokens', cols: ['createdAt'] },
    { table: 'password_reset_tokens', cols: ['createdAt'] },
    { table: 'refresh_tokens', cols: ['createdAt'] },
    // Legacy lookup/config tables carried over unchanged: they have no legacy
    // timestamp field at all, so the migration clock is the only date they carry.
    { table: 'select_types', cols: ['createdAt', 'updatedAt'] },
    { table: 'select_options', cols: ['createdAt', 'updatedAt'] },
    { table: 'service_types', cols: ['createdAt', 'updatedAt'] },
    { table: 'service_configs', cols: ['createdAt', 'updatedAt'] },
  ];
  for (const t of stampTables) {
    if (!(await tableExists(prisma, db, t.table)) || (await columnType(prisma, db, t.table, t.cols[0])) === '') {
      push(`${t.table} timestamps populated`, false, `pending — ${t.table}.${t.cols[0]} not created yet (ddl phase not applied)`);
      continue;
    }
    const nullStamps = await safeCount(
      `SELECT COUNT(*) AS c FROM ${qtable(db, t.table)} WHERE ${t.cols.map((c) => `${qi(c)} IS NULL`).join(' OR ')}`,
    );
    push(
      `${t.table} timestamps populated`,
      nullStamps === 0,
      nullStamps === null
        ? `pending — ${t.table} not readable`
        : nullStamps === 0
          ? `no NULL ${t.cols.join('/')}`
          : `${nullStamps} row(s) with NULL ${t.cols.join('/')} (rows refused by the phases keep their NULL marker)`,
    );
  }


  return { lines, finalization };
}