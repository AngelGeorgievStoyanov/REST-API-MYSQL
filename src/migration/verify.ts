/**
 * PHASE 4 — reconciliation + final-structure report (read-only; safe for --verify).
 *
 * Two report sections:
 *  - `lines`: source vs mapped vs quarantined per entity. `source` counts what
 *    the data phases actually read — live row counts for the in-place entities
 *    and the legacy blob-of-tokens columns (split with the SAME splitter the
 *    phases use) for likes / favorites / reports / images. When the activate
 *    step has already retired a legacy column, the final table count is used
 *    instead, so a finished database reports real numbers instead of zeros.
 *  - `finalization`: structural checks against prisma/schema.prisma — INT PKs,
 *    removed transitional columns, the finalized INT group key,
 *    UNIQUE(tripGroupId, dayNumber), the exact final FK set (FKS of
 *    ./phases-e5), polymorphic targetTypeId/targetId resolution, the
 *    target_types seed and the migration control tables.
 *
 * Everything here is read-only and every probe degrades instead of throwing:
 * legacy token columns and the migration control tables are gone AFTER a
 * completed migration and not created yet BEFORE the ddl phase. Preflight
 * stays the gate for "is this database runnable at all".
 */
import { PrismaClient } from '@prisma/client';
import {
  TARGET_TYPE,
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
  // A missing object is the NORMAL state at both ends of the lifecycle (not
  // created yet before ddl, retired by activate after a completed migration),
  // so only that case degrades; every other error still fails the report.
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

  /**
   * Tokens held in legacy blob-of-tokens columns (`trips.likes` style), split
   * with the exact splitter the data phases use, so source == migrated +
   * skipped + quarantined by construction. Returns null when NONE of the
   * columns still exists: not created yet (pre-ddl) or retired by activate.
   */
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

  /**
   * Legacy group keys live in the VARCHAR `trips.tripGroupId`; groupfinalize
   * drops that column, so a finished database has no legacy group list left to
   * count and the `trip_groups` rows become the source of truth (null here).
   */
  const tripGroupSource = async (): Promise<number | null> => {
    if ((await legacyGroupColumn(prisma, db)) !== 'tripGroupId') return null;
    return safeCount(
      `SELECT COUNT(DISTINCT ${qi('tripGroupId')}) AS c FROM ${qtable(db, 'trips')} ` +
        `WHERE ${qi('tripGroupId')} IS NOT NULL AND TRIM(${qi('tripGroupId')}) <> ''`,
    );
  };

  // --- reconciliation: source vs mapped vs quarantined ----------------------
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
  // In-place entities: the source rows ARE the target rows (nothing moves),
  // so `mapped` is the row marker the phase writes (`createdAt` backfilled).
  for (const [entity, table] of [['User', 'users'], ['Verify', 'verify']] as const) {
    lines.push({
      entity,
      source: (await rowCount(table)) ?? 0,
      mapped: await countOf(`SELECT COUNT(*) AS c FROM ${qtable(db, table)} WHERE ${qi('createdAt')} IS NOT NULL`),
      quarantined: await quarantinedOf(entity),
    });
  }

  // --- finalization checks --------------------------------------------------
  const finalization: FinalCheck[] = [];
  const push = (check: string, ok: boolean, detail: string): void => {
    finalization.push({ check, ok, detail });
  };

  // Every UUID-keyed resource table ends with an INT AUTO_INCREMENT `id` PK and
  // NO `_id`. `legacyId` (the UUID bridge) is UNIQUE while it exists and is
  // retired by the activate step — the final schema keeps no bridge at all.
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

  // Transitional columns must be GONE from the final schema: `_id` by the PK
  // swap, `_ownerTripId`/`_tripId` by activate, `tripGroupNewId` by
  // groupfinalize (activate retries it, see phases-e5 LEGACY_DROPS).
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

  // The user key stays a UUID forever: `users._id` before the activate rename,
  // `users.id` after it — resolved here instead of assumed.
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
    // Data phases park a 0 placeholder ("validated, INT id pending"); pkswap
    // promotes every retained row, so a surviving 0 after the swap is an
    // interrupted mapping. Before the swap the placeholder is expected.
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

  // MySQL UNIQUE never conflicts on NULL and parked (quarantined) trips hold
  // NULL by design, so only fully populated pairs are in scope — exactly what
  // the index itself enforces.
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

  // Control tables live while the migration runs and are dropped LAST by the
  // activate step, so "all present" and "all gone on a final structure" are
  // both legitimate; anything in between is a broken tooling state.
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

  // Exact final FK set (FKS of ./phases-e5). Reference integrity is proven on
  // the DATA before the constraint exists, so activation is never blind.
  const usersRef = (await userKeyColumn(prisma, db)) || '_id';
  for (const [, table, column, refTable, refColumn] of FKS) {
    // `_ownerId` is renamed to `ownerId` by the activate step: resolve the
    // child column instead of assuming either form.
    const child = column === 'ownerId' ? (await ownerColumn(prisma, db, table)) || 'ownerId' : column;
    const ref = refColumn === '' ? usersRef : refColumn;
    const check = `FK ${table}.${child} -> ${refTable}.${ref} valid`;
    const childReady = (await columnType(prisma, db, table, child)) !== '';
    const parentReady = (await columnType(prisma, db, refTable, ref)) !== '';
    if (!childReady || !parentReady) {
      push(check, false, `pending — ${childReady ? `${refTable}.${ref}` : `${table}.${child}`} not created yet (ddl phase not applied)`);
      continue;
    }
    // trips.tripGroupId still holds the legacy VARCHAR UUIDs until
    // groupfinalize: joining those against INT trip_groups.id would only
    // produce noise, so this check waits for the finalized shape.
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

  // Polymorphic target pointers carry NO FK in the final schema (Prisma cannot
  // express one), so their integrity is proven per target type instead:
  // comments / likes / reports all store targetTypeId + a bare targetId.
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

  push(
    'FK constraints exist in schema',
    fkCount > 0,
    fkCount > 0 ? `${fkCount} FOREIGN KEY constraint(s) present` : 'no FOREIGN KEY constraints yet (activate phase not applied)',
  );
  return { lines, finalization };
}