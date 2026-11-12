import { type PrismaClient } from '@prisma/client';
import { type DbExecutor, createdNow, esc, inTx, isUuid, keepOrFill, legacyKeyColumn, qi, qtable } from './db';
import { lookupStateOrPending, quarantineDryAware, recordState } from './state';
import { type Counters } from './types';

export async function phaseLogs(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  const run = async (exec: DbExecutor): Promise<Counters> => {
    const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
    const flKey = (await legacyKeyColumn(exec, db, 'failedlogs')) || '_id';
    const fl = (await exec.$queryRawUnsafe(`SELECT ${qi(flKey)} AS id, ${qi('date')} AS d FROM ${qtable(db, 'failedlogs')}`)) as Array<{ id: unknown; d: unknown }>;
    for (const r of fl) {
      const legacy = String(r.id ?? '');
      const already = await lookupStateOrPending(exec, db, dryRun, 'FailedLog', legacy);
      if (already !== null) { c.skipped++; continue; }
      if (!isUuid(legacy)) { if (await quarantineDryAware(exec, db, dryRun, runId, 'FailedLog', legacy, 'INVALID_UUID', 'failedlogs._id is not a UUID.', {})) c.quarantined++; continue; }
      // A log row carries the legacy `date`; there is no updatedAt column, and a
      // missing date becomes the migration clock instead of NULL.
      const created = createdNow(r.d);
      if (dryRun) { c.migrated++; continue; }
      await exec.$executeRawUnsafe(
        `UPDATE ${qtable(db, 'failedlogs')} SET ${qi('legacyId')} = '${esc(legacy)}', ${keepOrFill('createdAt', created)} WHERE ${qi(flKey)} = '${esc(legacy)}'`,
      );
      // 0 = "validated, INT id pending"; pkswap promotes it (resolvePlaceholder).
      await recordState(exec, db, 'FailedLog', legacy, 0, runId);
      c.migrated++;
    }
    const rnKey = (await legacyKeyColumn(exec, db, 'routenotfoundlogs')) || '_id';
    const rn = (await exec.$queryRawUnsafe(`SELECT ${qi(rnKey)} AS id, ${qi('reqUserId')} AS u, ${qi('date')} AS d FROM ${qtable(db, 'routenotfoundlogs')}`)) as Array<{ id: unknown; u: unknown; d: unknown }>;
    for (const r of rn) {
      const legacy = String(r.id ?? '');
      const already = await lookupStateOrPending(exec, db, dryRun, 'RouteNotFoundLog', legacy);
      if (already !== null) { c.skipped++; continue; }
      if (!isUuid(legacy)) { if (await quarantineDryAware(exec, db, dryRun, runId, 'RouteNotFoundLog', legacy, 'INVALID_UUID', 'routenotfoundlogs._id is not a UUID.', {})) c.quarantined++; continue; }
      if (r.u !== null && r.u !== undefined && String(r.u).trim() !== '' && !isUuid(String(r.u))) {
        await quarantineDryAware(exec, db, dryRun, runId, 'RouteNotFoundLog', legacy, 'INVALID_USER', 'reqUserId malformed; left for review.', { reqUserId: r.u }); c.quarantined++; continue;
      }
      // Same rule as failedlogs: legacy `date`, else the migration clock.
      const created = createdNow(r.d);
      if (dryRun) { c.migrated++; continue; }
      await exec.$executeRawUnsafe(
        `UPDATE ${qtable(db, 'routenotfoundlogs')} SET ${qi('legacyId')} = '${esc(legacy)}', ${keepOrFill('createdAt', created)} WHERE ${qi(rnKey)} = '${esc(legacy)}'`,
      );
      // 0 placeholder → promoted by pkswap (see failedlogs above).
      await recordState(exec, db, 'RouteNotFoundLog', legacy, 0, runId);
      c.migrated++;
    }
    return c;
  };
  if (dryRun) return run(prisma);
  let out: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  await inTx(prisma, async (tx) => {
    out = await run(tx);
  });
  return out;
}
