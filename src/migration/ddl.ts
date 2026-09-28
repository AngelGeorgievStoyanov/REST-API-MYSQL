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

export interface DdlReport {
  createdTables: string[];
  addedColumns: string[];
  seededTargetTypes: string[];
  skipped: string[];
}

export async function runDdlPhase(prisma: PrismaClient, db: string, dryRun: boolean): Promise<DdlReport> {
  const report: DdlReport = { createdTables: [], addedColumns: [], seededTargetTypes: [], skipped: [] };
  const co = await dbCollation(prisma, db);
  // Legacy VARCHARs have no explicit charset and inherit utf8mb4/utf8mb4_0900_ai_ci;
  // new objects declare it explicitly to avoid ER-1267. failedlogs/routenotfoundlogs
  // `_id` is NULL in the live schema, so the PK swap must not require NOT NULL.
  const vc = (len: number, nullable: boolean): string =>
    `VARCHAR(${len}) CHARACTER SET utf8mb4 COLLATE ${co}${nullable ? ' NULL DEFAULT NULL' : ' NOT NULL'}`;
  const tables: Array<{ name: string; ddl: () => string }> = [
    // Polymorphic targets: 1 tripGroup, 2 trip, 3 point, 4 image, 5 comment.
    { name: 'target_types', ddl: () => `(\`id\` INT NOT NULL PRIMARY KEY AUTO_INCREMENT, \`name\` ${vc(30, false)}, UNIQUE KEY \`uq_target_types_name\` (\`name\`)) ENGINE=InnoDB` },
    { name: 'trip_groups', ddl: () => `(\`id\` INT NOT NULL PRIMARY KEY AUTO_INCREMENT, \`ownerId\` ${vc(36, false)}, \`createdAt\` DATETIME(3) NULL DEFAULT NULL, \`updatedAt\` DATETIME(3) NULL DEFAULT NULL, KEY \`ix_tg_owner\` (\`ownerId\`)) ENGINE=InnoDB` },
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
    // Transitional INT `id` for the PK swap: created here so partial reruns
    // never depend on it; stays NULL until pkswap (legacyId gate) promotes it.
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
    // Polymorphic (targetTypeId + bare targetId); narrowed to NOT NULL by activate.
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
