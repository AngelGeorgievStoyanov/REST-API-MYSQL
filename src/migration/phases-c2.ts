/**
 * PHASE 4 — per-phase migration, part C2 (reports).
 *
 * The final schema has ONE generic `reports` table
 * (userId, targetTypeId, targetId, reason) and NO trip_reports /
 * comment_reports tables. Both legacy report sources are migrated here:
 *
 *   trips.reportTrip       -> targetTypeId = 2 (trip)    + final trips.id
 *   comments.reportComment -> targetTypeId = 5 (comment) + final comments.id
 *
 * Legacy semantics (src/controllers): both columns hold per-user tokens, so a
 * token becomes a `reports` row with `userId` = the token. The legacy source has
 * no report reason text, so `reason` stays NULL — nothing is invented. Tokens
 * that are not canonical UUIDs (or have no surviving user) are quarantined and
 * never split.
 *
 * NOTE: `reports.targetId` is polymorphic, so the final database declares NO FK
 * on it — exactly like `comments.targetId` / `likes.targetId`.
 */
import { PrismaClient } from '@prisma/client';
import { TARGET_TYPE } from './db';
import { commentParentResolver, migrateUserTokenList, tripParentResolver } from './targets';
import { Counters } from './types';

export async function phaseReports(
  prisma: PrismaClient,
  db: string,
  runId: number,
  dryRun: boolean,
): Promise<Counters> {
  const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  const parts = [
    await migrateUserTokenList(prisma, db, runId, dryRun, {
      entity: 'Report',
      targetTable: 'reports',
      sourceTable: 'trips',
      sourceColumn: 'reportTrip',
      targetColumn: 'targetId',
      targetTypeId: TARGET_TYPE.trip,
      stateKey: (token, tripId) => `${token}|||${TARGET_TYPE.trip}:${tripId}`,
      malformedCode: 'MALFORMED_REPORT',
      orphanCode: 'ORPHAN_TRIP',
      parentLabel: 'Parent trip',
      resolve: tripParentResolver(db, dryRun),
    }),
    await migrateUserTokenList(prisma, db, runId, dryRun, {
      entity: 'Report',
      targetTable: 'reports',
      sourceTable: 'comments',
      sourceColumn: 'reportComment',
      targetColumn: 'targetId',
      targetTypeId: TARGET_TYPE.comment,
      stateKey: (token, commentId) => `${token}|||${TARGET_TYPE.comment}:${commentId}`,
      malformedCode: 'MALFORMED_REPORT',
      orphanCode: 'ORPHAN_COMMENT',
      parentLabel: 'Parent comment',
      resolve: commentParentResolver(db, dryRun),
    }),
  ];
  for (const p of parts) {
    c.migrated += p.migrated;
    c.skipped += p.skipped;
    c.quarantined += p.quarantined;
  }
  return c;
}
