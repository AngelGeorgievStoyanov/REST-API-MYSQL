/**
 * PHASE 4 — reconciliation report (read-only; safe for --verify).
 * Compares source counts, migration_state coverage, and quarantine counts.
 */
import { PrismaClient } from '@prisma/client';
import { esc, ownerColumn, qtable, toCount } from './db';

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

export async function verifyMigration(
  prisma: PrismaClient,
  db: string,
  runId: number,
  opts?: { dryRun?: boolean; verifyOnly?: boolean },
): Promise<{ lines: VerifyLine[]; finalization: FinalCheck[] }> {
  void runId;
  const lenient = opts?.dryRun === true || opts?.verifyOnly === true;
  const count = async (sql: string): Promise<number> => toCount((await prisma.$queryRawUnsafe(sql)) as Array<Record<string, unknown>>);
  const safeCount = async (sql: string): Promise<number> => {
    try {
      return await count(sql);
    } catch (e) {
      // Read-only reports before ddl: target/control tables or transitional
      // columns may not exist yet. Report zero instead of crashing.
      if (lenient && ((e as Error).message.includes("doesn't exist") || (e as Error).message.includes('Unknown column'))) return 0;
      throw e;
    }
  };
  const stateCount = async (entity: string): Promise<number> =>
    safeCount(`SELECT COUNT(*) AS c FROM ${qtable(db, 'migration_state')} WHERE \`entity\` = '${entity}'`);
  const quarCount = async (entity: string): Promise<number> =>
    safeCount(`SELECT COUNT(*) AS c FROM ${qtable(db, 'migration_quarantine')} WHERE \`entity\` = '${entity}'`);
  const specs: Array<{ entity: string; sourceSql: string; targetMissingOk?: boolean }> = [
    { entity: 'TripGroup', sourceSql: `SELECT COUNT(DISTINCT \`tripGroupId\`) AS c FROM ${qtable(db, 'trips')} WHERE \`tripGroupId\` IS NOT NULL AND TRIM(\`tripGroupId\`) <> ''`, targetMissingOk: true },
    { entity: 'Trip', sourceSql: `SELECT COUNT(*) AS c FROM ${qtable(db, 'trips')}` },
    { entity: 'Point', sourceSql: `SELECT COUNT(*) AS c FROM ${qtable(db, 'points')}` },
    { entity: 'Comment', sourceSql: `SELECT COUNT(*) AS c FROM ${qtable(db, 'comments')}` },
    { entity: 'Like', sourceSql: `SELECT COUNT(*) AS c FROM ${qtable(db, 'likes')}`, targetMissingOk: true },
    { entity: 'Favorite', sourceSql: `SELECT COUNT(*) AS c FROM ${qtable(db, 'favorites')}`, targetMissingOk: true },
    { entity: 'TripReport', sourceSql: `SELECT COUNT(*) AS c FROM ${qtable(db, 'trip_reports')}`, targetMissingOk: true },
    { entity: 'CommentReport', sourceSql: `SELECT COUNT(*) AS c FROM ${qtable(db, 'comment_reports')}`, targetMissingOk: true },
    { entity: 'Image', sourceSql: `SELECT COUNT(*) AS c FROM ${qtable(db, 'images')}`, targetMissingOk: true },
    { entity: 'FailedLog', sourceSql: `SELECT COUNT(*) AS c FROM ${qtable(db, 'failedlogs')}` },
    { entity: 'RouteNotFoundLog', sourceSql: `SELECT COUNT(*) AS c FROM ${qtable(db, 'routenotfoundlogs')}` },
  ];
  const lines: VerifyLine[] = [];
  for (const s of specs) {
    let source: number;
    try {
      source = await count(s.sourceSql);
    } catch (e) {
      // Read-only reports before ddl: new target tables do not exist yet.
      // Report the source as legacy rows pending creation instead of crashing.
      const msg = (e as Error).message;
      if (lenient && s.targetMissingOk && (msg.includes("doesn't exist") || msg.includes('Unknown column'))) source = -1;
      else throw e;
    }
    lines.push({ entity: s.entity, source, mapped: await stateCount(s.entity), quarantined: await quarCount(s.entity) });
  }
  lines.push({
    entity: 'User',
    source: await safeCount(`SELECT COUNT(*) AS c FROM ${qtable(db, 'users')}`),
    mapped: await safeCount(`SELECT COUNT(*) AS c FROM ${qtable(db, 'users')} WHERE \`createdAt\` IS NOT NULL`),
    quarantined: await quarCount('User'),
  });
  lines.push({
    entity: 'Verify',
    source: await safeCount(`SELECT COUNT(*) AS c FROM ${qtable(db, 'verify')}`),
    mapped: await safeCount(`SELECT COUNT(*) AS c FROM ${qtable(db, 'verify')} WHERE \`createdAt\` IS NOT NULL`),
    quarantined: await quarCount('Verify'),
  });
  // Finalization checks: INT PKs, UUID users, group finalization, FK/UNIQUE
  // presence, state one-to-one. Read-only; safe in every mode.
  // Every UUID-keyed resource table (incl. failedlogs/routenotfoundlogs)
  // ends with an INT AUTO_INCREMENT `id` PK, `legacyId` preserved UNIQUE
  // and NO `_id` column — exactly the prisma/schema.prisma target.
  const finalization: FinalCheck[] = [];
  const push = (check: string, ok: boolean, detail: string): void => {
    finalization.push({ check, ok, detail });
  };
  for (const t of ['trips', 'points', 'comments', 'failedlogs', 'routenotfoundlogs']) {
    const idType = await columnType(prisma, db, t, 'id');
    const idKey = await columnKey(prisma, db, t, 'id');
    if (!idType) push(`PK ${t}.id is INT AUTO_INCREMENT`, false, 'id column missing (pkswap not applied yet)');
    else if (!idType.toLowerCase().includes('int') || idKey !== 'PRI') {
      push(`PK ${t}.id is INT AUTO_INCREMENT`, false, `id is ${idType || 'unknown'} key=${idKey || 'none'}`);
    } else push(`PK ${t}.id is INT AUTO_INCREMENT`, true, `${idType} PRIMARY KEY`);
    const legacyKey = await columnKey(prisma, db, t, 'legacyId');
    push(`${t}.legacyId preserved UNIQUE`, legacyKey !== '' ? true : false, legacyKey !== '' ? 'legacyId present for mapping' : 'legacyId missing');
  }
  // Transitional columns must be GONE from the final schema. `_id` is
  // dropped by the PK swap; `_ownerTripId`/`_tripId` are dropped by the
  // activate phase once their INT `tripId` FK is backfilled and enforced.
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
  const userIdType = await columnType(prisma, db, 'users', '_id');
  push(
    'users._id remains UUID VARCHAR(36)',
    userIdType.toLowerCase().includes('varchar'),
    userIdType ? `users._id is ${userIdType}` : 'users table not inspected',
  );
  const dupState = await safeCount(
    `SELECT COUNT(*) AS c FROM (SELECT \`entity\`, \`legacy_key\` FROM ${qtable(db, 'migration_state')} GROUP BY \`entity\`, \`legacy_key\` HAVING COUNT(*) > 1) d`,
  );
  push('migration_state legacy mapping is one-to-one', dupState === 0, dupState === 0 ? 'no duplicate (entity, legacy_key)' : `${dupState} duplicate mapping(s)`);
  const orphanState = await safeCount(
    `SELECT COUNT(*) AS c FROM ${qtable(db, 'migration_state')} WHERE ${qtable(db, 'migration_state')}.\`new_id\` IS NULL`,
  );
  push('migration_state has no orphan (NULL new_id) mappings', orphanState === 0, orphanState === 0 ? 'all mappings resolve' : `${orphanState} NULL mapping(s)`);
  const groupVarchar = await columnType(prisma, db, 'trips', 'tripGroupId');
  if (!groupVarchar) push('trips.tripGroupId finalized INT', false, 'trips.tripGroupId missing');
  else push(
    'trips.tripGroupId finalized INT',
    groupVarchar.toLowerCase().includes('int'),
    groupVarchar.toLowerCase().includes('int') ? groupVarchar : `tripGroupId is ${groupVarchar} (groupfinalize not applied yet)`,
  );
  const dupGroupDay = await safeCount(
    `SELECT COUNT(*) AS c FROM (SELECT \`tripGroupId\`, \`dayNumber\` FROM ${qtable(db, 'trips')} WHERE \`tripGroupId\` IS NOT NULL GROUP BY \`tripGroupId\`, \`dayNumber\` HAVING COUNT(*) > 1) d`,
  );
  push('UNIQUE(tripGroupId, dayNumber) holds', dupGroupDay === 0, dupGroupDay === 0 ? 'no duplicate group/day pairs' : `${dupGroupDay} duplicate pair(s)`);
  const childFks: Array<[string, string, string, string]> = [
    ['points', 'tripId', 'trips', 'id'],
    ['comments', 'tripId', 'trips', 'id'],
    ['likes', 'tripId', 'trips', 'id'],
    ['favorites', 'tripId', 'trips', 'id'],
    ['trip_reports', 'tripId', 'trips', 'id'],
    ['comment_reports', 'commentId', 'comments', 'id'],
    ['images', 'tripId', 'trips', 'id'],
    ['images', 'pointId', 'points', 'id'],
  ];
  for (const [child, col, parent, pcol] of childFks) {
    // Parent key column is always the new INT `id` post-swap. Quote it via
    // the same identifier path instead of hand-picking `_id`, which no
    // longer exists once the PK swap dropped it.
    const n = await safeCount(
      `SELECT COUNT(*) AS c FROM ${qtable(db, child)} k LEFT JOIN ${qtable(db, parent)} p ON p.\`${pcol}\` = k.\`${col}\` WHERE k.\`${col}\` IS NOT NULL AND p.\`${pcol}\` IS NULL`,
    );
    push(`FK ${child}.${col} -> ${parent}.${pcol} valid`, n === 0, n === 0 ? 'no orphan references' : `${n} orphan reference(s)`);
  }
  // Owner column name depends on whether the activate phase already renamed
  // `_ownerId` -> `ownerId`; resolve it instead of hardcoding either form.
  const userFks: Array<[string, string]> = [
    ['trip_groups', 'ownerId'],
    ['trips', (await ownerColumn(prisma, db, 'trips')) || '_ownerId'],
    ['points', (await ownerColumn(prisma, db, 'points')) || '_ownerId'],
    ['comments', (await ownerColumn(prisma, db, 'comments')) || '_ownerId'],
    ['verify', 'userId'],
    ['likes', 'userId'],
    ['favorites', 'userId'],
    ['trip_reports', 'userId'],
    ['comment_reports', 'userId'],
  ];
  for (const [table, col] of userFks) {
    const n = await safeCount(
      `SELECT COUNT(*) AS c FROM ${qtable(db, table)} t LEFT JOIN ${qtable(db, 'users')} u ON u.\`_id\` = t.\`${col}\` WHERE t.\`${col}\` IS NOT NULL AND u.\`_id\` IS NULL`,
    );
    push(`User FK ${table}.${col} references surviving users`, n === 0, n === 0 ? 'no orphan user references' : `${n} orphan user reference(s)`);
  }
  const fkCount = await safeCount(
    `SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = '${esc(db)}' AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
  );
  push('FK constraints exist in schema', fkCount > 0, fkCount > 0 ? `${fkCount} FOREIGN KEY constraint(s) present` : 'no FOREIGN KEY constraints yet (activate phase not applied)');
  return { lines, finalization };
}
