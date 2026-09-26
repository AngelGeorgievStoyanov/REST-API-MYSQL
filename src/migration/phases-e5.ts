/**
 * PHASE 4 — finalization E5: FK/index/UNIQUE activation.
 * Runs the constraints readiness report first; if ANY check is not clean,
 * STOPS without enabling anything (no partial activation). Otherwise adds
 * every FK (approved onDelete behavior), UNIQUE, and supporting index
 * idempotently (IF NOT EXISTS semantics via information_schema guards).
 */
import { PrismaClient } from '@prisma/client';
import { columnExists, esc, ownerColumn, qi, qtable } from './db';
import { quarantineDryAware } from './state';
import { phaseConstraints } from './phases-d3';
import { Counters } from './types';

async function fkExists(prisma: PrismaClient, db: string, name: string): Promise<boolean> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT 1 AS ok FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = '${esc(db)}' AND CONSTRAINT_NAME = '${esc(name)}' LIMIT 1`,
  )) as Array<{ ok: number }>;
  return rows.length > 0;
}

async function indexExists(prisma: PrismaClient, db: string, table: string, name: string): Promise<boolean> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT 1 AS ok FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = '${esc(table)}' AND INDEX_NAME = '${esc(name)}' LIMIT 1`,
  )) as Array<{ ok: number }>;
  return rows.length > 0;
}

// [constraintName, table, column, refTable, refColumn, onDelete]
const FKS: Array<[string, string, string, string, string, 'CASCADE' | 'RESTRICT']> = [
  ['fk_tg_owner', 'trip_groups', 'ownerId', 'users', '_id', 'RESTRICT'],
  ['fk_trips_owner', 'trips', 'ownerId', 'users', '_id', 'RESTRICT'],
  ['fk_trips_group', 'trips', 'tripGroupId', 'trip_groups', 'id', 'CASCADE'],
  ['fk_points_owner', 'points', 'ownerId', 'users', '_id', 'RESTRICT'],
  ['fk_points_trip', 'points', 'tripId', 'trips', 'id', 'CASCADE'],
  ['fk_comments_owner', 'comments', 'ownerId', 'users', '_id', 'RESTRICT'],
  ['fk_comments_trip', 'comments', 'tripId', 'trips', 'id', 'CASCADE'],
  ['fk_likes_user', 'likes', 'userId', 'users', '_id', 'CASCADE'],
  ['fk_likes_trip', 'likes', 'tripId', 'trips', 'id', 'CASCADE'],
  ['fk_fav_user', 'favorites', 'userId', 'users', '_id', 'CASCADE'],
  ['fk_fav_trip', 'favorites', 'tripId', 'trips', 'id', 'CASCADE'],
  ['fk_tr_user', 'trip_reports', 'userId', 'users', '_id', 'CASCADE'],
  ['fk_tr_trip', 'trip_reports', 'tripId', 'trips', 'id', 'CASCADE'],
  ['fk_cr_user', 'comment_reports', 'userId', 'users', '_id', 'CASCADE'],
  ['fk_cr_comment', 'comment_reports', 'commentId', 'comments', 'id', 'CASCADE'],
  ['fk_img_owner', 'images', 'ownerId', 'users', '_id', 'CASCADE'],
  ['fk_img_trip', 'images', 'tripId', 'trips', 'id', 'CASCADE'],
  ['fk_img_point', 'images', 'pointId', 'points', 'id', 'CASCADE'],
];

// [indexName, table, columns] — UNIQUE ones carry a flag via leading '!'.
const INDEXES: Array<[string, string, string[]]> = [
  ['uq_users_email', 'users', ['email']],
  ['ix_users_role', 'users', ['role']],
  ['ix_users_status', 'users', ['status']],
  ['ix_trips_owner', 'trips', ['ownerId']],
  ['ix_trips_group', 'trips', ['tripGroupId']],
  ['ix_trips_day', 'trips', ['dayNumber']],
  ['uq_trips_group_day', 'trips', ['tripGroupId', 'dayNumber']],
  ['ix_points_trip', 'points', ['tripId']],
  ['ix_points_owner', 'points', ['ownerId']],
  ['ix_comments_trip', 'comments', ['tripId']],
  ['ix_comments_owner', 'comments', ['ownerId']],
  ['ix_verify_user', 'verify', ['userId']],
  ['ix_verify_token', 'verify', ['verifyToken']],
  ['ix_failed_email', 'failedlogs', ['email']],
  ['ix_rnf_user', 'routenotfoundlogs', ['reqUserId']],
];

const UNIQUE_INDEXES = new Set(['uq_users_email', 'uq_trips_group_day']);

export async function phaseActivate(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  void runId;
  const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  const report = await phaseConstraints(prisma, db, dryRun);
  const blocked = report.checks.filter((k) => !k.ok);
  if (dryRun) {
    // Read-only: report what WOULD be added. Checks that only say the
    // INT column/table is not created yet are pending DDL, not quarantines.
    const realBlocked = blocked.filter((k) => !k.detail.startsWith('pending'));
    c.migrated = FKS.length + INDEXES.length;
    c.skipped = blocked.length - realBlocked.length;
    c.quarantined = realBlocked.length;
    return c;
  }
  // DIRTY-SNAPSHOT RULE: the activate phase refuses while readiness checks
  // are blocked — BUT the run must still COMPLETE (not fail): parked
  // quarantined rows are the expected outcome on dirty data, and the
  // verify report below records exactly what is/isn't enforced. Throwing
  // here would mark the whole run FAILED even though every phase behaved
  // correctly. The refusal is therefore recorded as quarantine evidence
  // (one row per blocked check) and the run completes; a future run on
  // clean data activates for real.
  if (blocked.length > 0) {
    for (const b of blocked) {
      await quarantineDryAware(prisma, db, false, runId, 'Constraint', b.statement, 'BLOCKED', `Constraint not activated: ${b.detail}.`, {});
      c.quarantined++;
    }
    return c;
  }
  // Narrow + rename the owner columns BEFORE the FKs are added: the target
  // schema declares `ownerId VARCHAR(36)` while the live columns are
  // `_ownerId VARCHAR(45)`. A FK to users._id VARCHAR(36) requires matching
  // type/collation, so this must happen first. Idempotent: skipped when the
  // column is already named `ownerId`.
  for (const table of ['trips', 'points', 'comments']) {
    const current = await ownerColumn(prisma, db, table);
    if (current !== '_ownerId') { c.skipped++; continue; }
    // NOT NULL is preserved only where the live column already was NOT NULL;
    // trips._ownerId is nullable, so keep it nullable and let the readiness
    // report gate any future tightening. Never silently changes nullability.
    const nullable = table === 'trips' ? 'NULL DEFAULT NULL' : 'NOT NULL';
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${qtable(db, table)} CHANGE COLUMN ${qi('_ownerId')} ${qi('ownerId')} VARCHAR(36) ${nullable}`,
    );
    c.migrated++;
  }
  for (const [name, table, column, refTable, refColumn, action] of FKS) {
    if (await fkExists(prisma, db, name)) { c.skipped++; continue; }
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${qtable(db, table)} ADD CONSTRAINT ${qi(name)} FOREIGN KEY (${qi(column)}) REFERENCES ${qtable(db, refTable)} (${qi(refColumn)}) ON DELETE ${action}`,
    );
    c.migrated++;
  }
  for (const [name, table, columns] of INDEXES) {
    if (await indexExists(prisma, db, table, name)) { c.skipped++; continue; }
    const unique = UNIQUE_INDEXES.has(name) ? 'UNIQUE ' : '';
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${qtable(db, table)} ADD ${unique}INDEX ${qi(name)} (${columns.map((col) => qi(col)).join(', ')})`,
    );
    c.migrated++;
  }
  // FINAL CLEANUP — only reached when every readiness check was clean and
  // every FK/index above is in place. The legacy VARCHAR parent pointers
  // have now been fully superseded by the enforced INT `tripId` FKs, so
  // they are no longer needed by any phase and must not survive into the
  // final schema (prisma/schema.prisma has no `_ownerTripId`/`_tripId`).
  // Ordering matters: this runs AFTER fk_points_trip / fk_comments_trip
  // exist, so the INT path is proven before the legacy path disappears.
  const dropTransitional: Array<[string, string]> = [
    ['points', '_ownerTripId'],
    ['comments', '_tripId'],
  ];
  for (const [table, column] of dropTransitional) {
    if (!(await columnExists(prisma, db, table, column))) { c.skipped++; continue; }
    await prisma.$executeRawUnsafe(`ALTER TABLE ${qtable(db, table)} DROP COLUMN ${qi(column)}`);
    c.migrated++;
  }
  return c;
}
