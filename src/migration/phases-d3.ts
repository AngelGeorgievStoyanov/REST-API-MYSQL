/**
 * PHASE 4 — part D3 (constraints verification report).
 * FK/UNIQUE activation is a LATER controlled step; this only reports
 * exact blockers per statement so nothing is enabled prematurely.
 */
import { PrismaClient } from '@prisma/client';
import { esc, ownerColumn, qi, qtable, toCount } from './db';

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
  // Dry-run before ddl: some tables/columns do not exist yet. Report them
  // as pending-ddl instead of crashing the read-only report.
  const isMissingObject = (e: unknown): boolean => {
    const msg = (e as Error).message;
    return msg.includes("doesn't exist") || msg.includes('Unknown column');
  };
  const safeOrphan = async (table: string, col: string): Promise<number | null> => {
    try {
      return await count(`SELECT COUNT(*) AS c FROM ${qtable(db, table)} t LEFT JOIN ${qtable(db, 'users')} u ON u.${qi('_id')} = t.${qi(col)} WHERE t.${qi(col)} IS NOT NULL AND u.${qi('_id')} IS NULL`);
    } catch (e) {
      if (dryRun && isMissingObject(e)) return null;
      throw e;
    }
  };
  const safeCount = async (sql: string): Promise<number | null> => {
    try {
      return await count(sql);
    } catch (e) {
      if (dryRun && isMissingObject(e)) return null;
      throw e;
    }
  };
  const orphanUser = async (table: string, col: string): Promise<number> => {
    const n = await safeOrphan(table, col);
    return n === null ? 0 : n;
  };
  // Owner column is `_ownerId` pre-activate and `ownerId` after the rename.
  // Resolve per table so reruns after activation do not hit Unknown column.
  const tripsOwner = (await ownerColumn(prisma, db, 'trips')) || '_ownerId';
  const pointsOwner = (await ownerColumn(prisma, db, 'points')) || '_ownerId';
  const commentsOwner = (await ownerColumn(prisma, db, 'comments')) || '_ownerId';
  const inputs: CheckInput[] = [
    { stmt: `FK trips.${tripsOwner} -> users._id`, n: await orphanUser('trips', tripsOwner) },
    { stmt: `FK points.${pointsOwner} -> users._id`, n: await orphanUser('points', pointsOwner) },
    { stmt: `FK comments.${commentsOwner} -> users._id`, n: await orphanUser('comments', commentsOwner) },
  ];
  const tgOrphans = await safeOrphan('trip_groups', 'ownerId');
  inputs.push(tgOrphans === null
    ? { stmt: 'FK trip_groups.ownerId -> users._id', pending: 'trip_groups table missing (ddl phase not applied yet)' }
    : { stmt: 'FK trip_groups.ownerId -> users._id', n: tgOrphans });
  // Post-groupfinalize trips has NO tripGroupNewId (renamed to tripGroupId).
  // Probe the live shape first: prefer the finalized column, fall back to
  // the transitional one, report pending only when neither exists.
  const groupColProbe = async (): Promise<'tripGroupId' | 'tripGroupNewId' | null> => {
    try {
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT COLUMN_NAME AS c, COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = 'trips' AND COLUMN_NAME IN ('tripGroupId', 'tripGroupNewId')`,
      )) as Array<{ c: string; t: string }>;
      const byName = new Map(rows.map((r) => [String(r.c), String(r.t)]));
      const finalized = byName.get('tripGroupId') ?? '';
      // Finalized shape: tripGroupId is INT *and* there is no transitional
      // column holding data (a ddl rerun may re-create the empty column —
      // check whether it holds any non-NULL value before trusting it).
      if (finalized.toLowerCase().includes('int')) {
        if (!byName.has('tripGroupNewId')) return 'tripGroupId';
        const filled = toCount((await prisma.$queryRawUnsafe(
          `SELECT COUNT(*) AS c FROM ${qtable(db, 'trips')} WHERE ${qi('tripGroupNewId')} IS NOT NULL`,
        )) as Array<Record<string, unknown>>);
        return filled > 0 ? 'tripGroupNewId' : 'tripGroupId';
      }
      if (byName.has('tripGroupNewId')) return 'tripGroupNewId';
      if (byName.has('tripGroupId')) return 'tripGroupId';
      return null;
    } catch (e) {
      if (dryRun && isMissingObject(e)) return null;
      throw e;
    }
  };
  const groupCol = await groupColProbe();
  const groupNull = groupCol === null
    ? null
    : await safeCount(`SELECT COUNT(*) AS c FROM ${qtable(db, 'trips')} WHERE ${qi(groupCol)} IS NULL`);
  inputs.push(groupNull === null
    ? { stmt: 'FK trips.tripGroupId -> trip_groups.id', pending: 'trips group column missing (ddl phase not applied yet)' }
    : { stmt: `FK trips.${groupCol} -> trip_groups.id (NULL blocks)`, n: groupNull });
  const pointsNull = await safeCount(`SELECT COUNT(*) AS c FROM ${qtable(db, 'points')} WHERE ${qi('tripId')} IS NULL`);
  inputs.push(pointsNull === null
    ? { stmt: 'FK points.tripId -> trips.id', pending: 'points.tripId column missing (ddl phase not applied yet)' }
    : { stmt: 'FK points.tripId -> trips.id (NULL blocks)', n: pointsNull });
  const commentsNull = await safeCount(`SELECT COUNT(*) AS c FROM ${qtable(db, 'comments')} WHERE ${qi('tripId')} IS NULL`);
  inputs.push(commentsNull === null
    ? { stmt: 'FK comments.tripId -> trips.id', pending: 'comments.tripId column missing (ddl phase not applied yet)' }
    : { stmt: 'FK comments.tripId -> trips.id (NULL blocks)', n: commentsNull });
  inputs.push(
    { stmt: 'FK verify.userId -> users._id', n: await orphanUser('verify', 'userId') },
  );
  const likesOrphans = await safeOrphan('likes', 'userId');
  const favOrphans = await safeOrphan('favorites', 'userId');
  const trOrphans = await safeOrphan('trip_reports', 'userId');
  const crOrphans = await safeOrphan('comment_reports', 'userId');
  inputs.push(
    likesOrphans === null
      ? { stmt: 'FK likes.userId -> users._id', pending: 'likes table missing (ddl phase not applied yet)' }
      : { stmt: 'FK likes.userId -> users._id', n: likesOrphans },
    favOrphans === null
      ? { stmt: 'FK favorites.userId -> users._id', pending: 'favorites table missing (ddl phase not applied yet)' }
      : { stmt: 'FK favorites.userId -> users._id', n: favOrphans },
    trOrphans === null
      ? { stmt: 'FK trip_reports.userId -> users._id', pending: 'trip_reports table missing (ddl phase not applied yet)' }
      : { stmt: 'FK trip_reports.userId -> users._id', n: trOrphans },
    crOrphans === null
      ? { stmt: 'FK comment_reports.userId -> users._id', pending: 'comment_reports table missing (ddl phase not applied yet)' }
      : { stmt: 'FK comment_reports.userId -> users._id', n: crOrphans },
    { stmt: 'UNIQUE users.email', n: await count(`SELECT COUNT(*) AS c FROM (SELECT LOWER(${qi('email')}) e FROM ${qtable(db, 'users')} GROUP BY e HAVING COUNT(*) > 1) d`) },
  );
  const dupGroups = groupCol === null
    ? null
    : await safeCount(`SELECT COUNT(*) AS c FROM (SELECT ${qi(groupCol)}, ${qi('dayNumber')} FROM ${qtable(db, 'trips')} WHERE ${qi(groupCol)} IS NOT NULL GROUP BY ${qi(groupCol)}, ${qi('dayNumber')} HAVING COUNT(*) > 1) d`);
  inputs.push(dupGroups === null
    ? { stmt: 'UNIQUE trips(tripGroupId, dayNumber)', pending: 'trips group column missing (ddl phase not applied yet)' }
    : { stmt: `UNIQUE trips(${groupCol}, dayNumber)`, n: dupGroups });
  for (const input of inputs) {
    pushCheck(checks, input);
  }
  return { checks };
}
