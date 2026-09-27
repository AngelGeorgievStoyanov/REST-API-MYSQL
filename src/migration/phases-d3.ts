/**
 * PHASE 4 — part D3 (final-structure readiness report).
 * FK/UNIQUE activation is the NEXT step (activate phase); this report lists the
 * exact blockers per statement so nothing is enabled while the data cannot
 * satisfy the final constraints. Every check is read-only.
 *
 * The checks cover the FINAL structure only:
 *   - mandatory user references (RESTRICT/CASCADE/SET NULL FKs)
 *   - trips.tripGroupId must be the finalized INT (groupfinalize applied)
 *   - points.tripId / comments.targetTypeId+targetId resolvable
 *   - likes/favorites/reports targets resolvable + user references valid
 *   - target_types seeded with its five fixed rows
 *   - UNIQUE users.email and UNIQUE trips(tripGroupId, dayNumber)
 *   - VARCHAR(36) owner columns can hold their values (no narrowing failure)
 * There is deliberately NO check for a verify.userId FK: the final database has
 * none, and `reports.targetId` / `comments.targetId` are polymorphic (no FK).
 */
import { PrismaClient } from '@prisma/client';
import { columnExists, columnType, qi, qtable, toCount, userKeyColumn } from './db';

export interface ConstraintCheck { statement: string; ok: boolean; detail: string; }

/** Checks of the form { stmt, n } plus pending-ddl states for missing objects. */
type CheckInput = { stmt: string; n: number } | { stmt: string; pending: string };

function pushCheck(checks: ConstraintCheck[], input: CheckInput): void {
  if ('pending' in input) {
    checks.push({ statement: input.stmt, ok: false, detail: `pending — ${input.pending}` });
    return;
  }
  checks.push({
    statement: input.stmt,
    ok: input.n === 0,
    detail: input.n === 0 ? 'no blockers' : `${input.n} blocking row(s) — constraint must NOT be enabled yet`,
  });
}

export async function phaseConstraints(prisma: PrismaClient, db: string, dryRun = false): Promise<{ checks: ConstraintCheck[] }> {
  const checks: ConstraintCheck[] = [];
  const count = async (sql: string): Promise<number> => toCount((await prisma.$queryRawUnsafe(sql)) as Array<Record<string, unknown>>);
  const isMissingObject = (e: unknown): boolean => {
    const msg = (e as Error).message;
    return msg.includes("doesn't exist") || msg.includes('Unknown column');
  };
  const safeCount = async (sql: string): Promise<number | null> => {
    try {
      return await count(sql);
    } catch (e) {
      // This function only ever reads: a missing table/column must degrade to
      // a `pending` check (never a crash), in dry-run AND in live runs.
      if (isMissingObject(e)) return null;
      throw e;
    }
  };
  /** Rows of `table` whose `col` is set but has no surviving user. */
  const orphanUser = async (table: string, col: string): Promise<number | null> => {
    const userKey = (await userKeyColumn(prisma, db)) || '_id';
    try {
      return await count(
        `SELECT COUNT(*) AS c FROM ${qtable(db, table)} t LEFT JOIN ${qtable(db, 'users')} u ON u.${qi(userKey)} = t.${qi(col)} WHERE t.${qi(col)} IS NOT NULL AND u.${qi(userKey)} IS NULL`,
      );
    } catch (e) {
      if (isMissingObject(e)) return null;
      throw e;
    }
  };
  /** Rows of a child table whose INT parent pointer has no parent row. */
  const orphanInt = async (table: string, col: string, parentTable: string): Promise<number | null> =>
    safeCount(
      `SELECT COUNT(*) AS c FROM ${qtable(db, table)} t LEFT JOIN ${qtable(db, parentTable)} p ON p.${qi('id')} = t.${qi(col)} WHERE t.${qi(col)} IS NOT NULL AND p.${qi('id')} IS NULL`,
    );
  const inputs: CheckInput[] = [];

  // --- mandatory user references (final FK set) -----------------------------
  const ownerTables: Array<[string, string]> = [];
  for (const table of ['trips', 'points', 'comments']) {
    const col = await columnExists(prisma, db, table, 'ownerId')
      ? 'ownerId'
      : (await columnExists(prisma, db, table, '_ownerId') ? '_ownerId' : '');
    if (col === '') inputs.push({ stmt: `FK ${table}.ownerId -> users.id`, pending: `${table}.ownerId column missing (ddl phase not applied yet)` });
    else ownerTables.push([table, col]);
  }
  for (const [table, col] of ownerTables) {
    const n = await orphanUser(table, col);
    inputs.push(n === null
      ? { stmt: `FK ${table}.${col} -> users.id`, pending: `${table} table missing (ddl phase not applied yet)` }
      : { stmt: `FK ${table}.${col} -> users.id`, n });
    // The owner column is narrowed to VARCHAR(36) before the FK is added; a
    // longer value would make that ALTER fail, so it is a hard blocker.
    if (n !== null) {
      const tooLong = await safeCount(`SELECT COUNT(*) AS c FROM ${qtable(db, table)} WHERE LENGTH(${qi(col)}) > 36`);
      if (tooLong !== null) inputs.push({ stmt: `${table}.${col} fits VARCHAR(36)`, n: tooLong });
    }
  }
  const tgOwner = await orphanUser('trip_groups', 'ownerId');
  inputs.push(tgOwner === null
    ? { stmt: 'FK trip_groups.ownerId -> users.id', pending: 'trip_groups table missing (ddl phase not applied yet)' }
    : { stmt: 'FK trip_groups.ownerId -> users.id', n: tgOwner });

  // --- final polymorphism / group references -------------------------------
  const groupType = await columnType(prisma, db, 'trips', 'tripGroupId');
  if (groupType === '') {
    inputs.push({ stmt: 'FK trips.tripGroupId -> trip_groups.id', pending: 'trips.tripGroupId missing (ddl phase not applied yet)' });
  } else if (!groupType.toLowerCase().includes('int')) {
    inputs.push({ stmt: 'trips.tripGroupId finalized INT (groupfinalize applied)', n: 1 });
  } else {
    const n = await safeCount(`SELECT COUNT(*) AS c FROM ${qtable(db, 'trips')} WHERE ${qi('tripGroupId')} IS NULL`);
    inputs.push(n === null
      ? { stmt: 'FK trips.tripGroupId -> trip_groups.id', pending: 'trips.tripGroupId missing (ddl phase not applied yet)' }
      : { stmt: 'FK trips.tripGroupId -> trip_groups.id (NULL blocks)', n });
    const orphanGroups = await orphanInt('trips', 'tripGroupId', 'trip_groups');
    if (orphanGroups !== null) inputs.push({ stmt: 'FK trips.tripGroupId -> trip_groups.id (orphan refs)', n: orphanGroups });
    const dupGroupDay = await safeCount(
      `SELECT COUNT(*) AS c FROM (SELECT ${qi('tripGroupId')}, ${qi('dayNumber')} FROM ${qtable(db, 'trips')} WHERE ${qi('tripGroupId')} IS NOT NULL GROUP BY ${qi('tripGroupId')}, ${qi('dayNumber')} HAVING COUNT(*) > 1) d`,
    );
    if (dupGroupDay !== null) inputs.push({ stmt: 'UNIQUE trips(tripGroupId, dayNumber)', n: dupGroupDay });
  }
  const pointsNull = await safeCount(`SELECT COUNT(*) AS c FROM ${qtable(db, 'points')} WHERE ${qi('tripId')} IS NULL`);
  inputs.push(pointsNull === null
    ? { stmt: 'FK points.tripId -> trips.id', pending: 'points.tripId column missing (ddl phase not applied yet)' }
    : { stmt: 'FK points.tripId -> trips.id (NULL blocks)', n: pointsNull });
  const pointsOrphans = await orphanInt('points', 'tripId', 'trips');
  if (pointsOrphans !== null) inputs.push({ stmt: 'FK points.tripId -> trips.id (orphan refs)', n: pointsOrphans });

  // comments: targetTypeId (2 = trip) + bare targetId. No FK on targetId.
  if (!(await columnExists(prisma, db, 'comments', 'targetId'))) {
    inputs.push({ stmt: 'comments.targetTypeId/targetId populated', pending: 'comments.targetId column missing (ddl phase not applied yet)' });
  } else {
    const nullTarget = await safeCount(
      `SELECT COUNT(*) AS c FROM ${qtable(db, 'comments')} WHERE ${qi('targetTypeId')} IS NULL OR ${qi('targetId')} IS NULL`,
    );
    if (nullTarget !== null) inputs.push({ stmt: 'comments.targetTypeId/targetId NOT NULL ready', n: nullTarget });
    const badType = await safeCount(
      `SELECT COUNT(*) AS c FROM ${qtable(db, 'comments')} WHERE ${qi('targetTypeId')} IS NOT NULL AND ${qi('targetTypeId')} <> 2`,
    );
    if (badType !== null) inputs.push({ stmt: 'comments.targetTypeId = 2 (trip) only', n: badType });
    const badRefs = await safeCount(
      `SELECT COUNT(*) AS c FROM ${qtable(db, 'comments')} t LEFT JOIN ${qtable(db, 'trips')} p ON p.${qi('id')} = t.${qi('targetId')} WHERE t.${qi('targetId')} IS NOT NULL AND p.${qi('id')} IS NULL`,
    );
    if (badRefs !== null) inputs.push({ stmt: 'comments.targetId resolves to a trips row', n: badRefs });
  }




  // likes / favorites / reports: final tables + their user references.
  const userRefs: Array<[string, string, string]> = [
    ['likes', 'userId', 'FK likes.userId -> users.id'],
    ['favorites', 'userId', 'FK favorites.userId -> users.id'],
    ['reports', 'userId', 'FK reports.userId -> users.id'],
    ['images', 'ownerId', 'FK images.ownerId -> users.id'],
  ];
  for (const [table, col, stmt] of userRefs) {
    const n = await orphanUser(table, col);
    inputs.push(n === null
      ? { stmt, pending: `${table} table missing (ddl phase not applied yet)` }
      : { stmt, n });
  }
  const tokenChecks: Array<[string, string, string]> = [
    ['likes', 'targetTypeId', 'likes.targetTypeId populated'],
    ['likes', 'targetId', 'likes.targetId populated'],
    ['reports', 'targetTypeId', 'reports.targetTypeId populated'],
    ['reports', 'targetId', 'reports.targetId populated'],
    ['favorites', 'tripGroupId', 'favorites.tripGroupId populated'],
  ];
  for (const [table, col, stmt] of tokenChecks) {
    const n = await safeCount(`SELECT COUNT(*) AS c FROM ${qtable(db, table)} WHERE ${qi(col)} IS NULL OR ${qi(col)} = 0`);
    inputs.push(n === null
      ? { stmt, pending: `${table} table missing (ddl phase not applied yet)` }
      : { stmt, n });
  }
  const favOrphanGroups = await orphanInt('favorites', 'tripGroupId', 'trip_groups');
  if (favOrphanGroups !== null) inputs.push({ stmt: 'favorites.tripGroupId resolves to a trip_groups row', n: favOrphanGroups });
  const likesOrphanTrips = await safeCount(
    `SELECT COUNT(*) AS c FROM ${qtable(db, 'likes')} k LEFT JOIN ${qtable(db, 'trips')} p ON p.${qi('id')} = k.${qi('targetId')} WHERE k.${qi('targetTypeId')} = 2 AND p.${qi('id')} IS NULL`,
  );
  if (likesOrphanTrips !== null) inputs.push({ stmt: 'likes.targetId resolves to a trips row (targetTypeId 2)', n: likesOrphanTrips });


  // target_types seed: the polymorphic FKs require its five fixed rows.
  const ttGood = await safeCount(
    `SELECT COUNT(*) AS c FROM ${qtable(db, 'target_types')} WHERE (${qi('id')}, ${qi('name')}) IN ((1,'tripGroup'),(2,'trip'),(3,'point'),(4,'image'),(5,'comment'))`,
  );
  if (ttGood === null) {
    inputs.push({ stmt: 'target_types seeded (1 tripGroup, 2 trip, 3 point, 4 image, 5 comment)', n: 5 });
  } else {
    inputs.push({ stmt: 'target_types seeded (1 tripGroup, 2 trip, 3 point, 4 image, 5 comment)', n: 5 - ttGood });
    const ttTypeRefs: Array<[string, string]> = [
      ['comments', 'targetTypeId'],
      ['likes', 'targetTypeId'],
      ['reports', 'targetTypeId'],
    ];
    for (const [table, col] of ttTypeRefs) {
      const n = await safeCount(
        `SELECT COUNT(*) AS c FROM ${qtable(db, table)} t LEFT JOIN ${qtable(db, 'target_types')} tt ON tt.${qi('id')} = t.${qi(col)} WHERE t.${qi(col)} IS NOT NULL AND tt.${qi('id')} IS NULL`,
      );
      if (n !== null) inputs.push({ stmt: `${table}.${col} resolves to a target_types row`, n });
    }
  }

  // users.email UNIQUE (final index uq_users_email).
  const dupEmail = await safeCount(`SELECT COUNT(*) AS c FROM (SELECT LOWER(${qi('email')}) e FROM ${qtable(db, 'users')} GROUP BY e HAVING COUNT(*) > 1) d`);
  inputs.push(dupEmail === null
    ? { stmt: 'UNIQUE users.email', pending: 'users table missing (ddl phase not applied yet)' }
    : { stmt: 'UNIQUE users.email', n: dupEmail });

  for (const input of inputs) {
    pushCheck(checks, input);
  }
  return { checks };
}
