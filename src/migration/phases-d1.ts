/**
 * PHASE 4 — part D1 (verify). Keeps INT id; validates user linkage.
 *
 * The legacy source declares `verify._id INT AUTO_INCREMENT`; the final schema
 * declares `verify.id` (no `@map`), so the activate/finalize step renames the
 * PK column. This phase therefore resolves the key column at runtime and works
 * both before and after the rename.
 */
import { PrismaClient } from '@prisma/client';
import { DbExecutor, columnExists, inTx, isUuid, qi, qtable, timestampForWrite, userExistsById } from './db';
import { quarantineDryAware } from './state';
import { Counters } from './types';

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
      const created = timestampForWrite(r['timeVerifyToken'] ?? r['timeVerifyTokenForgotPassword']);
      if (dryRun) { c.migrated++; continue; }
      // verify._id is ALREADY INT AUTO_INCREMENT in the live schema and in
      // the target schema (Verify.id) — only the column NAME changes, and that
      // rename is part of finalization. Guard the numeric cast: a non-numeric
      // key would otherwise produce `WHERE _id = NaN`.
      const numericId = Number(id);
      if (!Number.isInteger(numericId)) {
        if (await quarantineDryAware(exec, db, dryRun, runId, 'Verify', id, 'INVALID_ID', 'verify key is not an integer.', { key: r[keyCol] })) c.quarantined++;
        continue;
      }
      await exec.$executeRawUnsafe(
        `UPDATE ${qtable(db, 'verify')} SET ${qi('createdAt')} = ${created ? `'${created}'` : 'NULL'} WHERE ${qi(keyCol)} = ${numericId}`,
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
