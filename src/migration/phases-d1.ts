/**
 * PHASE 4 — part D1 (verify). Keeps INT id; validates user linkage.
 */
import { PrismaClient } from '@prisma/client';
import { DbExecutor, esc, inTx, isUuid, qi, qtable, timestampForWrite } from './db';
import { quarantineDryAware } from './state';
import { Counters } from './types';

export async function phaseVerify(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  const rows = (await prisma.$queryRawUnsafe(`SELECT * FROM ${qtable(db, 'verify')}`)) as Array<Record<string, unknown>>;
  const run = async (exec: DbExecutor): Promise<Counters> => {
    const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
    for (const r of rows) {
      const id = String(r['_id'] ?? '');
      const uid = String(r['userId'] ?? '');
      if (!isUuid(uid)) { if (await quarantineDryAware(exec, db, dryRun, runId, 'Verify', id, 'INVALID_USER', 'verify.userId is not a canonical UUID.', { userId: r['userId'] })) c.quarantined++; continue; }
      const ok = (await exec.$queryRawUnsafe(
        `SELECT 1 AS ok FROM ${qtable(db, 'users')} WHERE ${qi('_id')} = '${esc(uid)}' LIMIT 1`,
      )) as Array<{ ok: number }>;
      if (ok.length === 0) { if (await quarantineDryAware(exec, db, dryRun, runId, 'Verify', id, 'ORPHAN_USER', 'No surviving user for verify row.', { userId: uid })) c.quarantined++; continue; }
      const created = timestampForWrite(r['timeVerifyToken'] ?? r['timeVerifyTokenForgotPassword']);
      if (dryRun) { c.migrated++; continue; }
      // verify._id is ALREADY INT AUTO_INCREMENT in the live schema and in
      // the target schema (Verify.id @map("_id")) — no UUID→INT swap here.
      // Guard the numeric cast: a non-numeric key would otherwise produce
      // `WHERE _id = NaN`, which MySQL rejects / silently matches nothing.
      const numericId = Number(id);
      if (!Number.isInteger(numericId)) {
        if (await quarantineDryAware(exec, db, dryRun, runId, 'Verify', id, 'INVALID_ID', 'verify._id is not an integer.', { _id: r['_id'] })) c.quarantined++;
        continue;
      }
      await exec.$executeRawUnsafe(
        `UPDATE ${qtable(db, 'verify')} SET ${qi('createdAt')} = ${created ? `'${created}'` : 'NULL'} WHERE ${qi('_id')} = ${numericId}`,
      );
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
