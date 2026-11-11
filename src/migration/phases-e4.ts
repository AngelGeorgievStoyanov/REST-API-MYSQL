/**
 * PENDING_INT_ID replay: reprocesses child rows parked while parent INT ids
 * were missing, now that pkswap assigned them. Idempotent via the canonical
 * phase handlers (existing rows are skipped).
 */
import { type PrismaClient } from '@prisma/client';
import { phaseFavorites, phaseLikes } from './phases-c1';
import { phaseReports } from './phases-c2';
import { phaseImages } from './phases-c3';
import { type Counters } from './types';

type ReplayPhase = 'likes' | 'favorites' | 'reports' | 'images';

async function runReplayPhase(
  name: ReplayPhase,
  run: () => Promise<Counters>,
): Promise<Counters> {
  try {
    return await run();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`[replay:${name}] ${detail}`);
  }
}

export async function phaseReplay(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  const parts = [
    await runReplayPhase('likes', () => phaseLikes(prisma, db, runId, dryRun)),
    await runReplayPhase('favorites', () => phaseFavorites(prisma, db, runId, dryRun)),
    await runReplayPhase('reports', () => phaseReports(prisma, db, runId, dryRun)),
    await runReplayPhase('images', () => phaseImages(prisma, db, runId, dryRun)),
  ];
  for (const p of parts) {
    c.migrated += p.migrated;
    c.skipped += p.skipped;
    c.quarantined += p.quarantined;
  }
  return c;
}
