/**
 * PENDING_INT_ID replay: reprocesses child rows parked while parent INT ids
 * were missing, now that pkswap assigned them. Idempotent via the canonical
 * phase handlers (existing rows are skipped).
 */
import { PrismaClient } from '@prisma/client';
import { phaseFavorites, phaseLikes } from './phases-c1';
import { phaseReports } from './phases-c2';
import { phaseImages } from './phases-c3';
import { Counters } from './types';

export async function phaseReplay(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  const parts = [
    await phaseLikes(prisma, db, runId, dryRun),
    await phaseFavorites(prisma, db, runId, dryRun),
    await phaseReports(prisma, db, runId, dryRun),
    await phaseImages(prisma, db, runId, dryRun),
  ];
  for (const p of parts) {
    c.migrated += p.migrated;
    c.skipped += p.skipped;
    c.quarantined += p.quarantined;
  }
  return c;
}
