/**
 * Reports from both legacy sources into the single polymorphic `reports`
 * table: trips.reportTrip -> targetTypeId=2 + trips.id, comments.reportComment
 * -> targetTypeId=5 + comments.id. Tokens are per-user; `reason` stays NULL
 * (the legacy source has none). `reports.targetId` carries no FK, like all
 * polymorphic target columns.
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
