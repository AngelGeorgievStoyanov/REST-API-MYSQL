import { PrismaClient } from '@prisma/client';
import { databaseNameFromUrl } from './config';

/** Surface shared by PrismaClient and its interactive-transaction client. */
export type DbExecutor = {
  $queryRawUnsafe: PrismaClient['$queryRawUnsafe'];
  $executeRawUnsafe: PrismaClient['$executeRawUnsafe'];
};

/** Run fn inside a real interactive transaction (not raw START TRANSACTION). */
export async function inTx(prisma: PrismaClient, fn: (tx: DbExecutor) => Promise<void>): Promise<void> {
  await prisma.$transaction(
    async (t) => {
      await fn(t as unknown as DbExecutor);
    },
    { timeout: 120000 },
  );
}

export function qi(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe identifier: ${name}`);
  }
  return '`' + name + '`';
}

/**
 * Escape a VALUE for inline SQL literals: doubles quotes AND backslashes
 * (MySQL string literals treat `\` as escape unless NO_BACKSLASH_ESCAPES).
 */
export function esc(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

export function qtable(db: string, table: string): string {
  return qi(db) + '.' + qi(table);
}

/** Seed ids of the polymorphic `target_types` lookup table (five rows). */
export const TARGET_TYPE = {
  tripGroup: 1,
  trip: 2,
  point: 3,
  image: 4,
  comment: 5,
} as const;

export const TARGET_TYPES: ReadonlyArray<readonly [number, string]> = [
  [TARGET_TYPE.tripGroup, 'tripGroup'],
  [TARGET_TYPE.trip, 'trip'],
  [TARGET_TYPE.point, 'point'],
  [TARGET_TYPE.image, 'image'],
  [TARGET_TYPE.comment, 'comment'],
];

export async function columnExists(
  prisma: DbExecutor,
  db: string,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = '${esc(table)}' AND COLUMN_NAME = '${esc(column)}' LIMIT 1`,
  )) as Array<{ ok: number }>;
  return rows.length > 0;
}

export async function tableExists(
  prisma: DbExecutor,
  db: string,
  table: string,
): Promise<boolean> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT 1 AS ok FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = '${esc(table)}' LIMIT 1`,
  )) as Array<{ ok: number }>;
  return rows.length > 0;
}

export async function columnType(
  prisma: DbExecutor,
  db: string,
  table: string,
  column: string,
): Promise<string> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = '${esc(table)}' AND COLUMN_NAME = '${esc(column)}'`,
  )) as Array<{ t: string }>;
  return rows.length > 0 ? String(rows[0].t) : '';
}

export async function columnNullable(
  prisma: DbExecutor,
  db: string,
  table: string,
  column: string,
): Promise<boolean | null> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT IS_NULLABLE AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = '${esc(table)}' AND COLUMN_NAME = '${esc(column)}'`,
  )) as Array<{ n: string }>;
  if (rows.length === 0) return null;
  return String(rows[0].n).toUpperCase() === 'YES';
}

/**
 * Live owner-FK column: `ownerId` after the activate rename, `_ownerId`
 * before. Resolved at runtime so reruns work in either shape; '' when the
 * table has neither.
 */
export async function ownerColumn(
  exec: DbExecutor,
  db: string,
  table: string,
): Promise<string> {
  const rows = (await exec.$queryRawUnsafe(
    `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = '${esc(table)}' AND COLUMN_NAME IN ('ownerId', '_ownerId')`,
  )) as Array<{ c: string }>;
  const names = new Set(rows.map((r) => String(r.c)));
  // Prefer the finalized name; fall back to the legacy underscore name.
  if (names.has('ownerId')) return 'ownerId';
  if (names.has('_ownerId')) return '_ownerId';
  return '';
}

/**
 * Live users key column: `users.id` after the activate rename, `users._id`
 * before. Resolved at runtime; '' when neither exists.
 */
export async function userKeyColumn(
  exec: DbExecutor,
  db: string,
): Promise<string> {
  const rows = (await exec.$queryRawUnsafe(
    `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('id', '_id')`,
  )) as Array<{ c: string }>;
  const names = new Set(rows.map((r) => String(r.c)));
  if (names.has('id')) return 'id';
  if (names.has('_id')) return '_id';
  return '';
}

/** True when a surviving user row has this UUID. */
export async function userExistsById(
  exec: DbExecutor,
  db: string,
  id: string,
): Promise<boolean> {
  const col = (await userKeyColumn(exec, db)) || '_id';
  const rows = (await exec.$queryRawUnsafe(
    `SELECT 1 AS ok FROM ${qtable(db, 'users')} WHERE ${qi(col)} = '${esc(id)}' LIMIT 1`,
  )) as Array<{ ok: number }>;
  return rows.length > 0;
}

/**
 * Column still holding the legacy UUID of a row: `_id` pre-pkswap,
 * `legacyId` after the swap. '' when neither exists.
 */
export async function legacyKeyColumn(
  exec: DbExecutor,
  db: string,
  table: string,
): Promise<string> {
  const rows = (await exec.$queryRawUnsafe(
    `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = '${esc(table)}' AND COLUMN_NAME IN ('_id', 'legacyId')`,
  )) as Array<{ c: string }>;
  const names = new Set(rows.map((r) => String(r.c)));
  if (names.has('_id')) return '_id';
  if (names.has('legacyId')) return 'legacyId';
  return '';
}

/**
 * Legacy parent pointer on a child table; after activate falls back to the
 * final INT column (numeric value = already final):
 *   points -> tripId, comments -> targetId (targetTypeId = 2).
 * '' when no candidate exists.
 */
export async function parentPointerColumn(
  exec: DbExecutor,
  db: string,
  table: string,
  legacyName: '_ownerTripId' | '_tripId',
  intName: string = 'tripId',
): Promise<string> {
  const rows = (await exec.$queryRawUnsafe(
    `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = '${esc(table)}' AND COLUMN_NAME IN ('${legacyName}', '${esc(intName)}')`,
  )) as Array<{ c: string }>;
  const names = new Set(rows.map((r) => String(r.c)));
  if (names.has(legacyName)) return legacyName;
  if (names.has(intName)) return intName;
  return '';
}

/**
 * Trip-group column on trips: VARCHAR `tripGroupId` while legacy,
 * `tripGroupNewId` on a half-renamed table, '' once only the final INT
 * remains (callers then read the group UUID from migration_state).
 */
export async function legacyGroupColumn(exec: DbExecutor, db: string): Promise<string> {
  const rows = (await exec.$queryRawUnsafe(
    `SELECT COLUMN_NAME AS c, DATA_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = 'trips' AND COLUMN_NAME IN ('tripGroupId', 'tripGroupNewId')`,
  )) as Array<{ c: string; t: string }>;
  const byName = new Map(rows.map((r) => [String(r.c), String(r.t).toLowerCase()]));
  const groupType = byName.get('tripGroupId') ?? '';
  if (groupType !== '' && !groupType.includes('int')) return 'tripGroupId';
  if (byName.has('tripGroupNewId')) return 'tripGroupNewId';
  return '';
}

export function toCount(rows: Array<Record<string, unknown>>): number {
  if (!rows || rows.length === 0) return 0;
  const v = Object.values(rows[0])[0];
  if (typeof v === 'bigint') return Number(v);
  return Number(v);
}

export function toBigintString(v: unknown): string {
  if (typeof v === 'bigint') return v.toString();
  if (v === null || v === undefined) return '';
  return String(v);
}

/**
 * Canonical 8-4-4-4-12 only; the known 73-char concatenated token must be
 * quarantined, never split by guessing.
 */
export function isUuid(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const s = String(value).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function splitList(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  const s = String(raw);
  if (s.trim() === '') return [];
  return s
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function isValidTimestamp(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const s = String(value).trim();
  if (s === '' || s === 'CURRENT_TIMESTAMP' || s === 'NULL') return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

/** ISO string kept verbatim for MySQL DATETIME(3) write; '' when unusable. */
export function timestampForWrite(value: unknown): string {
  if (!isValidTimestamp(value)) return '';
  return new Date(String(value).trim()).toISOString().slice(0, 23).replace('T', ' ');
}

export function dbName(): string {
  return databaseNameFromUrl((process.env.DATABASE_URL || '').trim());
}

/**
 * Live default collation, read not hardcoded: cross-table string comparisons
 * fail with ER 1267 when objects declare a different one.
 */
export async function dbCollation(exec: DbExecutor, db: string): Promise<string> {
  const rows = (await exec.$queryRawUnsafe(
    `SELECT default_collation_name AS co FROM information_schema.schemata WHERE schema_name = '${esc(db)}'`,
  )) as Array<{ co: string }>;
  const co = String(rows[0]?.co || '').trim();
  if (!/^[a-z0-9_]+$/i.test(co)) throw new Error(`Unsafe collation for ${db}: ${co}`);
  return co;
}
