/**
 * User/Auth security data for the target contract.
 *
 * The legacy `verify` table stores the raw verification/reset tokens in one
 * mixed row, so nothing there can be carried into `email_verification_tokens` /
 * `password_reset_tokens` (the target keeps hashes only) — those rows are simply
 * re-issued by the application. What IS carried over is the user's verified
 * state: `verifyEmail = 1` becomes `emailVerifiedAt`, so existing accounts stay
 * verified across the cutover.
 *
 * Idempotent: rows are only touched while `emailVerifiedAt` is still NULL, and a
 * rerun after the legacy flag disappears is a no-op. Nothing is dropped: the
 * legacy `verify` table stays until the verified cleanup step after cutover.
 */
import { PrismaClient } from '@prisma/client';
import { DbExecutor, columnExists, inTx, qi, qtable, tableExists, toCount } from './db';
import { Counters } from './types';

async function countUsers(exec: DbExecutor, db: string): Promise<number> {
  if (!(await tableExists(exec, db, 'users'))) return 0;
  return toCount((await exec.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM ${qtable(db, 'users')}`,
  )) as Array<Record<string, unknown>>);
}

async function countWith(exec: DbExecutor, db: string, where: string): Promise<number> {
  return toCount((await exec.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM ${qtable(db, 'users')} WHERE ${where}`,
  )) as Array<Record<string, unknown>>);
}

export async function phaseSecurity(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  const hasFlag = await columnExists(prisma, db, 'users', 'verifyEmail');
  const hasTarget = await columnExists(prisma, db, 'users', 'emailVerifiedAt');
  // No legacy flag or no target column (ddl not applied / already cleaned):
  // nothing to carry over, and the rerun must stay a no-op.
  if (!hasFlag || !hasTarget) {
    return { migrated: 0, skipped: await countUsers(prisma, db), quarantined: 0 };
  }

  // The legacy flag is a boolean, so the exact verification moment was never
  // stored: the last known user change is the closest available timestamp.
  const where =
    `${qi('verifyEmail')} = 1 AND ${qi('emailVerifiedAt')} IS NULL`;
  const pending = await countWith(prisma, db, where);
  if (dryRun) return { migrated: pending, skipped: 0, quarantined: 0 };

  let migrated = 0;
  await inTx(prisma, async (tx) => {
    const res = (await tx.$executeRawUnsafe(
      `UPDATE ${qtable(db, 'users')} SET ${qi('emailVerifiedAt')} = COALESCE(${qi('updatedAt')}, ${qi('createdAt')}, NOW(3)) WHERE ${where}`,
    )) as unknown as { affectedRows?: number };
    migrated = Number(res?.affectedRows ?? 0);
  });

  const alreadyVerified = await countWith(
    prisma, db, `${qi('verifyEmail')} = 1 AND ${qi('emailVerifiedAt')} IS NOT NULL`,
  );
  return { migrated, skipped: alreadyVerified, quarantined: 0 };
}
