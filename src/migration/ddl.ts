import { PrismaClient } from '@prisma/client';
import { TARGET_TYPES, columnDefault, columnExists, columnType, dbCollation, esc, qi, qtable, tableExists } from './db';
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
  alteredColumns: string[];
  seededTargetTypes: string[];
  skipped: string[];
}

/**
 * Target definition of `users.status`: it must hold PENDING_VERIFICATION (20
 * chars) and must not default to ACTIVE — a new user starts unverified.
 */
const STATUS_TYPE = 'varchar(20)';
const STATUS_DEFAULT = 'PENDING_VERIFICATION';
const STATUS_DEFINITION = `VARCHAR(20) NOT NULL DEFAULT '${STATUS_DEFAULT}'`;

/**
 * Target definition of `points.pointNumber`: a signed MySQL INT NOT NULL. The
 * column is signed deliberately — the reorder flow temporarily writes negative
 * markers (`-(index + 1)`) before assigning the final positions. The legacy
 * column is `VARCHAR(45)`; its values are always numeric.
 */
const POINT_NUMBER_TYPE = 'int';
const POINT_NUMBER_DEFINITION = 'INT NOT NULL';
export const SIGNED_INT_MIN = -2147483648;
export const SIGNED_INT_MAX = 2147483647;

/** Canonical integer string: optional sign, digits only — no decimals, blanks or gaps. */
const POINT_NUMBER_INTEGER_PATTERN = /^-?\d+$/;

export type PointNumberNormalization =
  | 'missing' // column does not exist (dry-run before the ddl phase ran)
  | 'already-int' // signed INT NOT NULL: idempotent no-op
  | 'normalizable' // legacy VARCHAR: validate, then convert
  | 'unsupported'; // any other type: refuse an unverified conversion

/**
 * Classifies the live `points.pointNumber` column type for the normalization
 * step. Only the legacy VARCHAR shapes are converted; everything else fails
 * safely instead of attempting an unverified conversion.
 */
export function pointNumberNormalization(rawType: string): PointNumberNormalization {
  const type = rawType.trim().toLowerCase();
  if (type === '') return 'missing';
  if (type === POINT_NUMBER_TYPE) return 'already-int';
  if (type.startsWith('varchar') || type === 'char' || type.startsWith('char(')) return 'normalizable';
  return 'unsupported';
}

/** Returns the rejection reason for one legacy `pointNumber` value, or null when convertible. */
export function pointNumberConversionError(value: unknown): string | null {
  if (value === null || value === undefined) return 'NULL value';
  if (typeof value !== 'string') return `non-string value of type ${typeof value}`;
  if (!POINT_NUMBER_INTEGER_PATTERN.test(value)) {
    return 'not a canonical integer (decimal, blank or malformed)';
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < SIGNED_INT_MIN || parsed > SIGNED_INT_MAX) {
    return `outside signed INT range [${SIGNED_INT_MIN}, ${SIGNED_INT_MAX}]`;
  }
  return null;
}

export interface PointNumberRow {
  id: unknown;
  pointNumber: unknown;
}

export interface PointNumberRejection {
  id: string;
  value: string;
  reason: string;
}

/**
 * Validates every legacy `pointNumber` value before the VARCHAR -> INT
 * conversion. Malformed values, decimals, NULLs and out-of-range numbers are
 * reported with their point ids; nothing is silently coerced.
 */
export function validatePointNumberRows(rows: PointNumberRow[]): PointNumberRejection[] {
  const rejections: PointNumberRejection[] = [];
  for (const row of rows) {
    const reason = pointNumberConversionError(row.pointNumber);
    if (reason !== null) {
      rejections.push({
        id: row.id === null || row.id === undefined ? '<null>' : String(row.id),
        value: row.pointNumber === null || row.pointNumber === undefined ? 'NULL' : String(row.pointNumber),
        reason,
      });
    }
  }
  return rejections;
}

export async function runDdlPhase(prisma: PrismaClient, db: string, dryRun: boolean): Promise<DdlReport> {
  const report: DdlReport = { createdTables: [], addedColumns: [], alteredColumns: [], seededTargetTypes: [], skipped: [] };
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
    // One-time email verification tokens: only the hash is stored, never the raw
    // token. `tokenHash` is the lookup key (sha256 hex, 64 chars) and is UNIQUE,
    // so a token can never be replayed into a second row.
    { name: 'email_verification_tokens', ddl: () => `(\`id\` INT NOT NULL PRIMARY KEY AUTO_INCREMENT, \`userId\` ${vc(36, false)}, \`tokenHash\` ${vc(64, false)}, \`expiresAt\` DATETIME(3) NOT NULL, \`usedAt\` DATETIME(3) NULL DEFAULT NULL, \`createdAt\` DATETIME(3) NULL DEFAULT NULL, UNIQUE KEY \`uq_evt_token\` (\`tokenHash\`), KEY \`ix_evt_user\` (\`userId\`), KEY \`ix_evt_expires\` (\`expiresAt\`)) ENGINE=InnoDB` },
    // Same shape for password resets; kept separate on purpose (different
    // lifetime and different verification rules than email confirmation).
    { name: 'password_reset_tokens', ddl: () => `(\`id\` INT NOT NULL PRIMARY KEY AUTO_INCREMENT, \`userId\` ${vc(36, false)}, \`tokenHash\` ${vc(64, false)}, \`expiresAt\` DATETIME(3) NOT NULL, \`usedAt\` DATETIME(3) NULL DEFAULT NULL, \`createdAt\` DATETIME(3) NULL DEFAULT NULL, UNIQUE KEY \`uq_prt_token\` (\`tokenHash\`), KEY \`ix_prt_user\` (\`userId\`), KEY \`ix_prt_expires\` (\`expiresAt\`)) ENGINE=InnoDB` },
    // Refresh tokens are revoked instead of consumed, so `revokedAt` replaces
    // `usedAt`; the hash is the single lookup key of the refresh flow.
    { name: 'refresh_tokens', ddl: () => `(\`id\` INT NOT NULL PRIMARY KEY AUTO_INCREMENT, \`userId\` ${vc(36, false)}, \`tokenHash\` ${vc(64, false)}, \`expiresAt\` DATETIME(3) NOT NULL, \`createdAt\` DATETIME(3) NULL DEFAULT NULL, \`revokedAt\` DATETIME(3) NULL DEFAULT NULL, UNIQUE KEY \`uq_rt_token\` (\`tokenHash\`), KEY \`ix_rt_user\` (\`userId\`), KEY \`ix_rt_expires\` (\`expiresAt\`)) ENGINE=InnoDB` },
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
    // NULL = email not verified yet; a timestamp = verified (the application
    // sets it together with status = ACTIVE). Replaces legacy `verifyEmail`.
    { table: 'users', column: 'emailVerifiedAt', definition: () => 'DATETIME(3) NULL DEFAULT NULL' },
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
  // `users.status` must be able to hold PENDING_VERIFICATION and must not default
  // to ACTIVE: a new user starts unverified until the email is confirmed.
  // Widening + changing the default keeps every existing value ('ACTIVE' rows
  // stay ACTIVE), and the check makes reruns no-ops.
  const statusType = (await columnType(prisma, db, 'users', 'status')).toLowerCase();
  const statusDefault = await columnDefault(prisma, db, 'users', 'status');
  if (statusType === '') {
    report.skipped.push('column users.status does not exist');
  } else if (statusType === STATUS_TYPE && statusDefault === STATUS_DEFAULT) {
    report.skipped.push('users.status already accepts PENDING_VERIFICATION and defaults to it');
  } else {
    if (!dryRun) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE ${qtable(db, 'users')} MODIFY COLUMN ${qi('status')} ${STATUS_DEFINITION}`,
      );
    }
    report.alteredColumns.push('users.status');
  }
  // `points.pointNumber` is a legacy VARCHAR(45) whose values are numeric; the
  // target schema is a signed INT NOT NULL (the reorder flow temporarily writes
  // negative markers, so the column must stay signed). Every legacy value is
  // validated BEFORE the ALTER: malformed values, decimals, NULLs and values
  // outside the signed INT range abort the phase with the affected point ids
  // reported — nothing is silently coerced. In a dry-run the normalization is
  // only reported; the validation SELECT stays read-only and no ALTER runs.
  const pnRawType = await columnType(prisma, db, 'points', 'pointNumber');
  const pnKind = pointNumberNormalization(pnRawType);
  if (pnKind === 'missing') {
    report.skipped.push('column points.pointNumber does not exist');
  } else if (pnKind === 'already-int') {
    report.skipped.push('points.pointNumber is already signed INT NOT NULL (no-op)');
  } else if (pnKind === 'unsupported') {
    throw new Error(
      `points.pointNumber has unexpected column type "${pnRawType}"; refusing an unverified conversion.`,
    );
  } else {
    // The validation SELECT must work on both shapes of the `points` table: the
    // cloned legacy table keeps `_id`, while the new `id` column is only added
    // by this DDL phase — which a dry-run does not execute. The identifier
    // column is resolved from information_schema: the legacy `_id` wins when it
    // exists, `id` is used only when `_id` is absent. The SELECT alias stays
    // `id`, so the validation and the reported point identifiers are
    // independent of the physical column name.
    const idColumn = (await columnExists(prisma, db, 'points', '_id')) ? '_id' : 'id';
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT ${qi(idColumn)} AS id, ${qi('pointNumber')} AS pointNumber FROM ${qtable(db, 'points')}`,
    )) as PointNumberRow[];
    const rejections = validatePointNumberRows(rows);
    if (rejections.length > 0) {
      const shown = rejections
        .slice(0, 10)
        .map((r) => `point ${r.id} value ${JSON.stringify(r.value)} (${r.reason})`)
        .join('; ');
      throw new Error(
        `points.pointNumber cannot be converted to INT: ${rejections.length} invalid value(s) [${shown}]` +
          (rejections.length > 10 ? ' ...' : ''),
      );
    }
    if (!dryRun) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE ${qtable(db, 'points')} MODIFY COLUMN ${qi('pointNumber')} ${POINT_NUMBER_DEFINITION}`,
      );
    }
    report.alteredColumns.push('points.pointNumber');
  }
  if (!dryRun) await ensureControlTables(prisma, db);
  else report.skipped.push('control tables (dry-run: not created)');
  return report;
}
