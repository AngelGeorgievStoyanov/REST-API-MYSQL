/**
 * Legacy lookup/config tables carried over unchanged: the target contract
 * declares `createdAt`/`updatedAt` (DATETIME(3), NULL, no DB default) but the
 * legacy schema has no timestamp field at all for them, so there is nothing to
 * transfer. Every existing row is therefore stamped with the migration clock:
 *
 *   createdAt = NOW(3)
 *   updatedAt = NOW(3)          (or the row's createdAt when only it is missing)
 *
 * The stamping reuses the shared fallback helper, which fills NULL columns only:
 * an existing valid value is never overwritten and a rerun is a no-op. Nothing
 * else changes — no column is added, dropped or retyped.
 */
import { type PrismaClient } from '@prisma/client';
import { backfillTimestamps, inTx, qi, qtable, tableExists, toCount } from './db';
import { type Counters } from './types';

/** The paired lookup tables, in the order reported by the doctor/docs. */
export const LOOKUP_TABLES = ['select_types', 'select_options', 'service_types', 'service_configs'] as const;

/** Rows that still miss at least one timestamp (the only rows a run writes). */
async function missingCount(prisma: PrismaClient, db: string, table: string): Promise<number> {
  return toCount((await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM ${qtable(db, table)} WHERE ${qi('createdAt')} IS NULL OR ${qi('updatedAt')} IS NULL`,
  )) as Array<Record<string, unknown>>);
}

async function totalCount(prisma: PrismaClient, db: string, table: string): Promise<number> {
  return toCount((await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM ${qtable(db, table)}`,
  )) as Array<Record<string, unknown>>);
}

export async function phaseLookups(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  runId;
  const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  const present: string[] = [];
  for (const table of LOOKUP_TABLES) {
    if (await tableExists(prisma, db, table)) present.push(table);
    else c.skipped++;
  }
  for (const table of present) {
    const total = await totalCount(prisma, db, table);
    const missing = await missingCount(prisma, db, table);
    c.migrated += missing;
    c.skipped += total - missing;
  }
  if (dryRun || c.migrated === 0) return c;
  await inTx(prisma, async (tx) => {
    for (const table of present) {
      await backfillTimestamps(tx, db, table, { updatedAt: true });
    }
  });
  return c;
}
