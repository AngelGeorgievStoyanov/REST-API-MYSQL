/**
 * Structural finalization + FK/index activation: runs the readiness report
 * first (stops if any check is blocked), renames legacy keys, applies the
 * exact final FK/index set, drops legacy-only columns and finally the
 * migration control tables. Idempotent and shape-probed: reruns are no-ops.
 */
import { PrismaClient } from '@prisma/client';
import { TARGET_TYPES, columnExists, columnNullable, esc, qi, qtable, tableExists, userKeyColumn } from './db';
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


/** The exact final FK set: [name, table, column, refTable, refColumn, onDelete].
 *  Empty refColumn = the live `users` key column. ON UPDATE stays at the MySQL
 *  default (NO ACTION), like the live target. */
export const FKS: Array<[string, string, string, string, string, 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION']> = [
  ['fk_tg_owner', 'trip_groups', 'ownerId', 'users', '', 'RESTRICT'],
  ['fk_trips_owner', 'trips', 'ownerId', 'users', '', 'RESTRICT'],
  ['fk_trips_group', 'trips', 'tripGroupId', 'trip_groups', 'id', 'CASCADE'],
  ['fk_points_owner', 'points', 'ownerId', 'users', '', 'RESTRICT'],
  ['fk_points_trip', 'points', 'tripId', 'trips', 'id', 'CASCADE'],
  ['fk_comments_owner', 'comments', 'ownerId', 'users', '', 'RESTRICT'],
  ['fk_comments_target_type', 'comments', 'targetTypeId', 'target_types', 'id', 'NO ACTION'],
  ['fk_likes_user', 'likes', 'userId', 'users', '', 'CASCADE'],
  ['fk_likes_target_type', 'likes', 'targetTypeId', 'target_types', 'id', 'NO ACTION'],
  ['fk_fav_user', 'favorites', 'userId', 'users', '', 'CASCADE'],
  ['fk_fav_trip_group', 'favorites', 'tripGroupId', 'trip_groups', 'id', 'NO ACTION'],
  ['fk_reports_user', 'reports', 'userId', 'users', '', 'NO ACTION'],
  ['fk_reports_target_type', 'reports', 'targetTypeId', 'target_types', 'id', 'NO ACTION'],
  ['fk_img_owner', 'images', 'ownerId', 'users', '', 'SET NULL'],
  ['fk_img_trip', 'images', 'tripId', 'trips', 'id', 'CASCADE'],
  ['fk_img_point', 'images', 'pointId', 'points', 'id', 'CASCADE'],
  // User/auth tokens: a deleted user must not leave usable credentials behind,
  // so the token rows cascade with their user.
  ['fk_evt_user', 'email_verification_tokens', 'userId', 'users', '', 'CASCADE'],
  ['fk_prt_user', 'password_reset_tokens', 'userId', 'users', '', 'CASCADE'],
  ['fk_rt_user', 'refresh_tokens', 'userId', 'users', '', 'CASCADE'],
];

const INDEXES: Array<[string, string, string[], boolean]> = [
  ['uq_users_email', 'users', ['email'], true],
  ['ix_users_role', 'users', ['role'], false],
  ['ix_users_status', 'users', ['status'], false],
  ['ix_tg_owner', 'trip_groups', ['ownerId'], false],
  ['ix_trips_owner', 'trips', ['ownerId'], false],
  ['ix_trips_group', 'trips', ['tripGroupId'], false],
  ['ix_trips_day', 'trips', ['dayNumber'], false],
  ['uq_trips_group_day', 'trips', ['tripGroupId', 'dayNumber'], true],
  ['ix_points_trip', 'points', ['tripId'], false],
  ['ix_points_owner', 'points', ['ownerId'], false],
  ['ix_comments_owner', 'comments', ['ownerId'], false],
  ['ix_comments_target', 'comments', ['targetTypeId', 'targetId'], false],
  ['uq_likes_user_target', 'likes', ['userId', 'targetTypeId', 'targetId'], true],
  ['ix_likes_u', 'likes', ['userId'], false],
  ['ix_likes_target', 'likes', ['targetTypeId', 'targetId'], false],
  ['uq_fav_user_group', 'favorites', ['userId', 'tripGroupId'], true],
  ['ix_fav_u', 'favorites', ['userId'], false],
  ['ix_fav_tg', 'favorites', ['tripGroupId'], false],
  ['uq_reports_user_target', 'reports', ['userId', 'targetTypeId', 'targetId'], true],
  ['ix_reports_user', 'reports', ['userId'], false],
  ['ix_reports_target', 'reports', ['targetId'], false],
  ['ix_reports_target_type', 'reports', ['targetTypeId'], false],
  ['ix_img_o', 'images', ['ownerId'], false],
  ['ix_img_t', 'images', ['tripId'], false],
  ['ix_img_p', 'images', ['pointId'], false],
  ['ix_verify_user', 'verify', ['userId'], false],
  ['ix_verify_token', 'verify', ['verifyToken'], false],
  ['ix_failed_email', 'failedlogs', ['email'], false],
  ['ix_rnf_user', 'routenotfoundlogs', ['reqUserId'], false],
  // One-time auth tokens: the hash is the only lookup key of the flow, and
  // UNIQUE makes a replay impossible. The user index serves the FK and the
  // "invalidate all tokens of this user" sweep, the expiry index the cleanup.
  ['uq_evt_token', 'email_verification_tokens', ['tokenHash'], true],
  ['ix_evt_user', 'email_verification_tokens', ['userId'], false],
  ['ix_evt_expires', 'email_verification_tokens', ['expiresAt'], false],
  ['uq_prt_token', 'password_reset_tokens', ['tokenHash'], true],
  ['ix_prt_user', 'password_reset_tokens', ['userId'], false],
  ['ix_prt_expires', 'password_reset_tokens', ['expiresAt'], false],
  ['uq_rt_token', 'refresh_tokens', ['tokenHash'], true],
  ['ix_rt_user', 'refresh_tokens', ['userId'], false],
  ['ix_rt_expires', 'refresh_tokens', ['expiresAt'], false],
];

/** Legacy-only columns the final schema does not have. `failedlogs.date` /
 *  `routenotfoundlogs.date` are deliberately absent: the final schema keeps them. */
export const LEGACY_DROPS: Array<[string, string]> = [
  ['trips', 'coments'],
  ['trips', 'likes'],
  ['trips', 'favorites'],
  ['trips', 'reportTrip'],
  ['trips', 'imageFile'],
  ['trips', 'timeCreated'],
  ['trips', 'timeEdited'],
  ['trips', 'legacyId'],
  ['trips', 'tripGroupNewId'],
  ['users', 'timeCreated'],
  ['users', 'timeEdited'],
  ['users', 'imageFile'],
  ['points', 'timeCreated'],
  ['points', 'timeEdited'],
  ['points', 'imageFile'],
  ['points', 'legacyId'],
  ['points', '_ownerTripId'],
  ['comments', 'timeCreated'],
  ['comments', 'timeEdited'],
  ['comments', 'reportComment'],
  ['comments', 'legacyId'],
  ['comments', '_tripId'],
  ['failedlogs', 'legacyId'],
  ['routenotfoundlogs', 'legacyId'],
];

const CONTROL_TABLES = ['migration_runs', 'migration_state', 'migration_quarantine'];

export async function phaseActivate(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  const report = await phaseConstraints(prisma, db);
  const blocked = report.checks.filter((k) => !k.ok);
  if (dryRun) {
    // Read-only: report what WOULD be done; a missing INT column/table is
    // pending DDL, not a quarantine.
    const realBlocked = blocked.filter((k) => !k.detail.startsWith('pending'));
    c.migrated = FKS.length + INDEXES.length + LEGACY_DROPS.length + CONTROL_TABLES.length;
    c.skipped = blocked.length - realBlocked.length;
    c.quarantined = realBlocked.length;
    return c;
  }
  // Dirty-data rule: readiness blockers refuse activation but the run must
  // still COMPLETE — each blocked check is recorded as quarantine evidence
  // and a later run on clean data activates for real.
  if (blocked.length > 0) {
    for (const b of blocked) {
      await quarantineDryAware(prisma, db, false, runId, 'Constraint', b.statement, 'BLOCKED', `Constraint not activated: ${b.detail}.`, {});
      c.quarantined++;
    }
    return c;
  }

  // 2. target_types seed (defensive: the ddl phase normally seeded it already).
  if (await tableExists(prisma, db, 'target_types')) {
    for (const [id, name] of TARGET_TYPES) {
      await prisma.$executeRawUnsafe(
        `INSERT IGNORE INTO ${qtable(db, 'target_types')} (${qi('id')}, ${qi('name')}) VALUES (${id}, '${esc(name)}')`,
      );
    }
  }


  // 3. Rename legacy keys to their final names; no final column starts with `_`.
  const usersKey = await userKeyColumn(prisma, db);
  if (usersKey === '_id') {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${qtable(db, 'users')} CHANGE COLUMN ${qi('_id')} ${qi('id')} VARCHAR(36) NOT NULL`,
    );
    c.migrated++;
  } else if (usersKey === 'id') {
    c.skipped++;
  } else {
    throw new Error('users key column missing; refusing to finalize.');
  }
  if (await columnExists(prisma, db, 'verify', '_id')) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${qtable(db, 'verify')} CHANGE COLUMN ${qi('_id')} ${qi('id')} INT NOT NULL AUTO_INCREMENT`,
    );
    c.migrated++;
  } else {
    c.skipped++;
  }
  // `_ownerId VARCHAR(45)` -> `ownerId VARCHAR(36)` before the FKs: an FK to
  // users.id VARCHAR(36) needs identical type/collation. NOT NULL only where
  // the live column was NOT NULL (trips._ownerId stays nullable).
  for (const table of ['trips', 'points', 'comments']) {
    const nullable = table === 'trips' ? 'NULL DEFAULT NULL' : 'NOT NULL';
    if (!(await columnExists(prisma, db, table, '_ownerId'))) {
      c.skipped++;
      continue;
    }
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${qtable(db, table)} CHANGE COLUMN ${qi('_ownerId')} ${qi('ownerId')} VARCHAR(36) ${nullable}`,
    );
    c.migrated++;
  }

  // 4. Polymorphic comments: targetTypeId/targetId narrowed to NOT NULL once
  //    the data is complete.
  for (const column of ['targetTypeId', 'targetId']) {
    if ((await columnNullable(prisma, db, 'comments', column)) === true) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE ${qtable(db, 'comments')} MODIFY ${qi(column)} INT NOT NULL`,
      );
      c.migrated++;
    } else {
      c.skipped++;
    }
  }

  // 5a. Final indexes FIRST: MySQL reuses a suitable index for a FK, so no
  //     auto-created `fk_*` indexes appear (index set matches the live target).
  for (const [name, table, columns, unique] of INDEXES) {
    if (await indexExists(prisma, db, table, name)) {
      c.skipped++;
      continue;
    }
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${qtable(db, table)} ADD ${unique ? 'UNIQUE ' : ''}INDEX ${qi(name)} (${columns.map((col) => qi(col)).join(', ')})`,
    );
    c.migrated++;
  }

  // 5b. Exact final FK set; referenced users column resolved at runtime.
  //     ON UPDATE stays at the MySQL default (NO ACTION), like the live target.
  const usersKeyNow = (await userKeyColumn(prisma, db)) || '_id';
  for (const [name, table, column, refTable, refColumn, action] of FKS) {
    if (await fkExists(prisma, db, name)) {
      c.skipped++;
      continue;
    }
    const ref = refColumn === '' ? usersKeyNow : refColumn;
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${qtable(db, table)} ADD CONSTRAINT ${qi(name)} FOREIGN KEY (${qi(column)}) REFERENCES ${qtable(db, refTable)} (${qi(ref)}) ON DELETE ${action}`,
    );
    c.migrated++;
  }

  // 6. Retire every legacy-only column; all consumer phases already ran, so
  //    nothing is lost (UUID bridge, VARCHAR pointers, blob-of-tokens).
  for (const [table, column] of LEGACY_DROPS) {
    if (!(await columnExists(prisma, db, table, column))) {
      c.skipped++;
      continue;
    }
    await prisma.$executeRawUnsafe(`ALTER TABLE ${qtable(db, table)} DROP COLUMN ${qi(column)}`);
    c.migrated++;
  }

  // 7. Drop the migration machinery itself; this run reports the evidence
  //    before the tables disappear.
  const dropped: string[] = [];
  for (const table of CONTROL_TABLES) {
    if (!(await tableExists(prisma, db, table))) {
      c.skipped++;
      continue;
    }
    await prisma.$executeRawUnsafe(`DROP TABLE ${qtable(db, table)}`);
    dropped.push(table);
    c.migrated++;
  }
  if (dropped.length > 0) {
    console.log(`[activate] control tables removed from the final database: ${dropped.join(', ')}`);
  }
  return c;
}
