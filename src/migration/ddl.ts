/**
 * PHASE 4 — schema transition DDL (idempotent, additive only).
 * Adds new tables + transitional columns. Never drops/renames/updates data.
 */
import { PrismaClient } from '@prisma/client';
import { TARGET_TYPES, columnExists, dbCollation, esc, qi, qtable, tableExists } from './db';
import { ensureControlTables } from './state';

async function addColumn(
  prisma: PrismaClient, db: string, table: string, column: string, definition: string,
): Promise<boolean> {
  if (await columnExists(prisma, db, table, column)) return false;
  await prisma.$executeRawUnsafe(
    `ALTER TABLE ${qtable(db, table)} ADD COLUMN ${qi(column)} ${definition}`,
  );
  return true;
}

async function indexExists(
  prisma: PrismaClient, db: string, table: string, name: string,
): Promise<boolean> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT 1 AS ok FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = '${esc(table)}' AND INDEX_NAME = '${esc(name)}' LIMIT 1`,
  )) as Array<{ ok: number }>;
  return rows.length > 0;
}

async function ensureUniqueKey(
  prisma: PrismaClient, db: string, table: string, column: string, keyName: string, dryRun: boolean,
): Promise<boolean> {
  if (await indexExists(prisma, db, table, keyName)) return false;
  // Column must exist before the key can be added (rerun where column exists
  // but a previous crash happened between ADD COLUMN and ADD UNIQUE KEY).
  if (!(await columnExists(prisma, db, table, column))) return false;
  if (!dryRun) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${qtable(db, table)} ADD UNIQUE KEY ${qi(keyName)} (${qi(column)})`,
    );
  }
  return true;
}

export interface DdlReport {
  createdTables: string[];
  addedColumns: string[];
  seededTargetTypes: string[];
  skipped: string[];
}

export async function runDdlPhase(prisma: PrismaClient, db: string, dryRun: boolean): Promise<DdlReport> {
  const report: DdlReport = { createdTables: [], addedColumns: [], seededTargetTypes: [], skipped: [] };
  const co = await dbCollation(prisma, db);
  // NOTE: live legacy tables were created WITHOUT explicit charset/collation
  // on VARCHAR columns, so they inherit utf8mb4/utf8mb4_0900_ai_ci. New
  // tables/columns declare it explicitly (same values) to avoid ER-1267.
  // The `_id` column on failedlogs/routenotfoundlogs is nullable in the
  // live schema (verified), so the PK swap cannot assume NOT NULL there.
  const vc = (len: number, nullable: boolean): string =>
    `VARCHAR(${len}) CHARACTER SET utf8mb4 COLLATE ${co}${nullable ? ' NULL DEFAULT NULL' : ' NOT NULL'}`;
  const tables: Array<{ name: string; ddl: () => string }> = [
    // Polymorphic target lookup table: 1 tripGroup, 2 trip, 3 point, 4 image,
    // 5 comment. Seeded below (idempotent) with exactly those rows.
    { name: 'target_types', ddl: () => `(\`id\` INT NOT NULL PRIMARY KEY AUTO_INCREMENT, \`name\` ${vc(30, false)}, UNIQUE KEY \`uq_target_types_name\` (\`name\`)) ENGINE=InnoDB` },
    { name: 'trip_groups', ddl: () => `(\`id\` INT NOT NULL PRIMARY KEY AUTO_INCREMENT, \`ownerId\` ${vc(36, false)}, \`createdAt\` DATETIME(3) NULL DEFAULT NULL, \`updatedAt\` DATETIME(3) NULL DEFAULT NULL, KEY \`ix_tg_owner\` (\`ownerId\`)) ENGINE=InnoDB` },
    // Final likes/favorites/reports shapes (polymorphic targets + group-scoped
    // favorites). There is NO likes.tripId / favorites.tripId / trip_reports /
    // comment_reports in the final schema.
    { name: 'likes', ddl: () => `(\`id\` INT NOT NULL PRIMARY KEY AUTO_INCREMENT, \`userId\` ${vc(36, false)}, \`targetTypeId\` INT NOT NULL, \`targetId\` INT NOT NULL, \`createdAt\` DATETIME(3) NULL DEFAULT NULL, UNIQUE KEY \`uq_likes_user_target\` (\`userId\`, \`targetTypeId\`, \`targetId\`), KEY \`ix_likes_u\` (\`userId\`), KEY \`ix_likes_target\` (\`targetTypeId\`, \`targetId\`)) ENGINE=InnoDB` },
    { name: 'favorites', ddl: () => `(\`id\` INT NOT NULL PRIMARY KEY AUTO_INCREMENT, \`userId\` ${vc(36, false)}, \`tripGroupId\` INT NOT NULL, \`createdAt\` DATETIME(3) NULL DEFAULT NULL, UNIQUE KEY \`uq_fav_user_group\` (\`userId\`, \`tripGroupId\`), KEY \`ix_fav_u\` (\`userId\`), KEY \`ix_fav_tg\` (\`tripGroupId\`)) ENGINE=InnoDB` },
    { name: 'reports', ddl: () => `(\`id\` INT NOT NULL PRIMARY KEY AUTO_INCREMENT, \`userId\` ${vc(36, false)}, \`targetTypeId\` INT NOT NULL, \`targetId\` INT NOT NULL, \`reason\` ${vc(1000, true)}, \`createdAt\` DATETIME(3) NULL DEFAULT NULL, UNIQUE KEY \`uq_reports_user_target\` (\`userId\`, \`targetTypeId\`, \`targetId\`), KEY \`ix_reports_user\` (\`userId\`), KEY \`ix_reports_target\` (\`targetId\`), KEY \`ix_reports_target_type\` (\`targetTypeId\`)) ENGINE=InnoDB` },
    { name: 'images', ddl: () => `(\`id\` INT NOT NULL PRIMARY KEY AUTO_INCREMENT, \`ownerId\` ${vc(36, true)}, \`tripId\` INT NULL DEFAULT NULL, \`pointId\` INT NULL DEFAULT NULL, \`filePath\` ${vc(1000, false)}, \`createdAt\` DATETIME(3) NULL DEFAULT NULL, \`updatedAt\` DATETIME(3) NULL DEFAULT NULL, KEY \`ix_img_o\` (\`ownerId\`), KEY \`ix_img_t\` (\`tripId\`), KEY \`ix_img_p\` (\`pointId\`)) ENGINE=InnoDB` },
  ];
  for (const t of tables) {
    if (await tableExists(prisma, db, t.name)) report.skipped.push('table ' + t.name + ' exists');
    else {
      if (!dryRun) await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${qtable(db, t.name)} ${t.ddl()}`);
      report.createdTables.push(t.name);
    }
  }
  // Seed the polymorphic lookup table with its five fixed rows. Explicit ids
  // on purpose: likes/reports/Comments.targetTypeId values are seed ids, so
  // the ids themselves are part of the final contract (never auto-allocated).
  if (!(await tableExists(prisma, db, 'target_types'))) {
    report.skipped.push('target_types seed (table not created in this dry-run)');
  } else {
    for (const [id, name] of TARGET_TYPES) {
      if (dryRun) {
        report.skipped.push(`target_types seed ${id}=${name} (dry-run: not written)`);
        continue;
      }
      const res = (await prisma.$executeRawUnsafe(
        `INSERT IGNORE INTO ${qtable(db, 'target_types')} (${qi('id')}, ${qi('name')}) VALUES (${id}, '${esc(name)}')`,
      )) as unknown as { affectedRows?: number };
      const created = Number(res?.affectedRows ?? 0) === 1;
      if (created) report.seededTargetTypes.push(`${id}=${name}`);
      else report.skipped.push(`target_types ${id}=${name} already present`);
    }
  }
  const columns: Array<{ table: string; column: string; definition: () => string }> = [
    // Transitional INT `id` columns for the PK swap. Added here (not in the
    // pkswap phase) so reruns and resume paths never depend on a column
    // that a previous partial run may not have created. NULL-able until
    // the swap promotes them; rows that never pass validation keep them NULL
    // and are excluded from the swap by the legacyId IS NOT NULL gate.
    // Every UUID-keyed resource table — including failedlogs and
    // routenotfoundlogs — gets an `id` here. pkswap promotes it to
    // INT AUTO_INCREMENT PRIMARY KEY and drops `_id`, matching
    // prisma/schema.prisma (FailedLog.id / RouteNotFoundLog.id).
    { table: 'trips', column: 'id', definition: () => 'INT NULL DEFAULT NULL' },
    { table: 'points', column: 'id', definition: () => 'INT NULL DEFAULT NULL' },
    { table: 'comments', column: 'id', definition: () => 'INT NULL DEFAULT NULL' },
    { table: 'trips', column: 'legacyId', definition: () => `${vc(36, true)}, ADD UNIQUE KEY \`uq_trips_legacyId\` (\`legacyId\`)` },
    { table: 'trips', column: 'tripGroupNewId', definition: () => 'INT NULL DEFAULT NULL' },
    { table: 'trips', column: 'createdAt', definition: () => 'DATETIME(3) NULL DEFAULT NULL' },
    { table: 'trips', column: 'updatedAt', definition: () => 'DATETIME(3) NULL DEFAULT NULL' },
    { table: 'points', column: 'legacyId', definition: () => `${vc(36, true)}, ADD UNIQUE KEY \`uq_points_legacyId\` (\`legacyId\`)` },
    { table: 'points', column: 'tripId', definition: () => 'INT NULL DEFAULT NULL' },
    { table: 'points', column: 'createdAt', definition: () => 'DATETIME(3) NULL DEFAULT NULL' },
    { table: 'points', column: 'updatedAt', definition: () => 'DATETIME(3) NULL DEFAULT NULL' },
    { table: 'comments', column: 'legacyId', definition: () => `${vc(36, true)}, ADD UNIQUE KEY \`uq_comments_legacyId\` (\`legacyId\`)` },
    // Comments are polymorphic in the final schema: targetTypeId + a bare
    // targetId (no comments.tripId exists in the final DB). Both are NULL-able
    // while they are backfilled and are narrowed to NOT NULL by the activate
    // step once the readiness report is clean.
    { table: 'comments', column: 'targetTypeId', definition: () => 'INT NULL DEFAULT NULL' },
    { table: 'comments', column: 'targetId', definition: () => 'INT NULL DEFAULT NULL' },
    { table: 'comments', column: 'createdAt', definition: () => 'DATETIME(3) NULL DEFAULT NULL' },
    { table: 'comments', column: 'updatedAt', definition: () => 'DATETIME(3) NULL DEFAULT NULL' },
    { table: 'users', column: 'createdAt', definition: () => 'DATETIME(3) NULL DEFAULT NULL' },
    { table: 'users', column: 'updatedAt', definition: () => 'DATETIME(3) NULL DEFAULT NULL' },
    { table: 'verify', column: 'createdAt', definition: () => 'DATETIME(3) NULL DEFAULT NULL' },
    { table: 'verify', column: 'updatedAt', definition: () => 'DATETIME(3) NULL DEFAULT NULL' },
    { table: 'failedlogs', column: 'id', definition: () => 'INT NULL DEFAULT NULL' },
    { table: 'failedlogs', column: 'legacyId', definition: () => `${vc(36, true)}, ADD UNIQUE KEY \`uq_failed_legacyId\` (\`legacyId\`)` },
    { table: 'failedlogs', column: 'createdAt', definition: () => 'DATETIME(3) NULL DEFAULT NULL' },
    { table: 'routenotfoundlogs', column: 'id', definition: () => 'INT NULL DEFAULT NULL' },
    { table: 'routenotfoundlogs', column: 'legacyId', definition: () => `${vc(36, true)}, ADD UNIQUE KEY \`uq_rnf_legacyId\` (\`legacyId\`)` },
    { table: 'routenotfoundlogs', column: 'createdAt', definition: () => 'DATETIME(3) NULL DEFAULT NULL' },
  ];
  for (const c of columns) {
    if (await columnExists(prisma, db, c.table, c.column)) report.skipped.push('column ' + c.table + '.' + c.column + ' exists');
    else {
      if (!dryRun) await addColumn(prisma, db, c.table, c.column, c.definition());
      report.addedColumns.push(c.table + '.' + c.column);
    }
  }
  if (!dryRun) await ensureControlTables(prisma, db);
  else report.skipped.push('control tables (dry-run: not created)');
  return report;
}
