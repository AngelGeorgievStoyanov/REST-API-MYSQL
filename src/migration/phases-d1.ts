/**
 * verify: keeps its INT key; validates user linkage. The PK column is
 * `_id` before the finalization rename and `id` after — resolved at runtime.
 */
import { type PrismaClient } from '@prisma/client';
import { type DbExecutor, columnExists, inTx, isUuid, keepOrFill, qi, qtable, timestampFallback, userExistsById } from './db';
import { quarantineDryAware } from './state';
import { type Counters } from './types';

export async function phaseVerify(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  const keyCol = (await columnExists(prisma, db, 'verify', '_id')) ? '_id' : 'id';
  const rows = (await prisma.$queryRawUnsafe(`SELECT * FROM ${qtable(db, 'verify')}`)) as Array<Record<string, unknown>>;
  const run = async (exec: DbExecutor): Promise<Counters> => {
    const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
    for (const r of rows) {
      const id = String(r[keyCol] ?? '');
      const uid = String(r['userId'] ?? '');
      if (!isUuid(uid)) { if (await quarantineDryAware(exec, db, dryRun, runId, 'Verify', id, 'INVALID_USER', 'verify.userId is not a canonical UUID.', { userId: r['userId'] })) c.quarantined++; continue; }
      if (!(await userExistsById(exec, db, uid))) { if (await quarantineDryAware(exec, db, dryRun, runId, 'Verify', id, 'ORPHAN_USER', 'No surviving user for verify row.', { userId: uid })) c.quarantined++; continue; }
      // The token timestamp is the only legacy date; the target table also has
      // updatedAt (never written before), which falls back to createdAt and then
      // to the migration clock. A missing legacy date must not become NULL.
      const { createdAt, updatedAt } = timestampFallback(r['timeVerifyToken'] ?? r['timeVerifyTokenForgotPassword'], null);
      if (dryRun) { c.migrated++; continue; }
      // verify._id is already INT AUTO_INCREMENT (only the name changes at
      // finalize). Guard the cast: a non-numeric key would write WHERE _id = NaN.
      const numericId = Number(id);
      if (!Number.isInteger(numericId)) {
        if (await quarantineDryAware(exec, db, dryRun, runId, 'Verify', id, 'INVALID_ID', 'verify key is not an integer.', { key: r[keyCol] })) c.quarantined++;
        continue;
      }
      await exec.$executeRawUnsafe(
        `UPDATE ${qtable(db, 'verify')} SET ${keepOrFill('createdAt', createdAt)}, ${keepOrFill('updatedAt', updatedAt)} WHERE ${qi(keyCol)} = ${numericId}`,
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
