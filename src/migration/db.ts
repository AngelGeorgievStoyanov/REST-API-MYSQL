/**
 * PHASE 4 — low-level DB helpers for the migration runner.
 *
 * All helpers use Prisma `$queryRawUnsafe`/`$executeRawUnsafe` against the
 * SAME database named in DATABASE_URL. Writes are raw SQL only; the Phase 3
 * Prisma models describe the target and are NOT used for migration writes,
 * because the live schema does not match them yet.
 */

import { PrismaClient } from '@prisma/client';
import { databaseNameFromUrl } from './config';

/**
 * Minimal executor surface used by all migration code. Both PrismaClient
 * (dry-run / reads / DDL) and an interactive-transaction client satisfy it,
 * so phase bodies can run inside a real transaction without rewrites.
 */
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
 * Escape a VALUE for inline single-quoted SQL literals. Doubles
 * single-quotes AND backslashes: MySQL string literals treat `\` as an
 * escape character (unless NO_BACKSLASH_ESCAPES), so a raw backslash in a
 * filename/JSON payload would otherwise corrupt the stored value and break
 * resume lookups (e.g. Image state keys contain filenames).
 */
export function esc(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

export function qtable(db: string, table: string): string {
  return qi(db) + '.' + qi(table);
}

/**
 * Seed ids of the polymorphic `target_types` lookup table. The final schema
 * stores ONE generic likes/reports/Comments target column pair
 * (`targetTypeId` + bare `targetId`) instead of per-resource tables, and the
 * live target database holds exactly these five rows.
 */
export const TARGET_TYPE = {
  tripGroup: 1,
  trip: 2,
  point: 3,
  image: 4,
  comment: 5,
} as const;

/** Ordered seed content of `target_types` (id, name) — final schema order. */
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
 * Resolve the live owner-FK column name for a legacy table.
 *
 * The activate phase renames `_ownerId` -> `ownerId` (target schema:
 * Trip/Point/Comment.ownerId, VARCHAR(36)). Every phase that reads or joins
 * on the owner must resolve the name at runtime instead of hardcoding it,
 * otherwise a rerun AFTER the rename fails with "Unknown column '_ownerId'".
 * Returns '' when neither column exists (table not inspected yet).
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
 * Live primary-key column name of `users`.
 *
 * The legacy source declares `users._id VARCHAR(36)`; the final schema has
 * `users.id` (no column name may start with `_`), so the activate/finalize
 * step renames it. Every phase that reads or joins a user must resolve the
 * name at runtime instead of hardcoding `_id`, otherwise a rerun after the
 * rename fails with "Unknown column '_id'". Returns '' when neither exists.
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

/** True when a surviving user row has this UUID (shape-aware user key). */
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
 * Live column that still holds the legacy UUID of a resource row.
 * Pre-pkswap that is `_id`; after the swap `_id` is dropped and the UUID
 * lives in `legacyId`. Returns '' when neither exists.
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
 * Legacy parent pointer on a child table. Activate drops `_ownerTripId` /
 * `_tripId` once the final INT pointer is enforced, so post-activate reads
 * must fall back to the final INT column (callers treat a numeric value as
 * "already an INT"):
 *  - points   -> tripId      (final Points.tripId)
 *  - comments -> targetId    (final Comment.targetId + targetTypeId = 2)
 * Returns '' when none of the candidates exist.
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
 * Legacy trip-group key on trips. Groupfinalize drops the VARCHAR
 * `tripGroupId` and renames `tripGroupNewId` onto it (INT). Returns
 * 'tripGroupId' while the VARCHAR is still there, 'tripGroupNewId' on a
 * half-renamed table, and '' once only the finalized INT remains (callers
 * must then read the group UUID from migration_state, never invent one).
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
 * Strict UUID check. Only canonical 8-4-4-4-12 UUIDs count as users.
 * The known malformed like token is a 73-char concatenation of two UUIDs
 * and MUST be quarantined, never split by guessing.
 */
export function isUuid(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const s = String(value).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Current code joins/splits on commas and whitespace. */
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
 * Live DB default collation (legacy tables use it, e.g. utf8mb4_0900_ai_ci).
 * New tables/columns must declare it explicitly or cross-table string
 * comparisons fail with ER 1267 (illegal mix of collations). Read from the
 * live DB, never hardcoded.
 */
export async function dbCollation(exec: DbExecutor, db: string): Promise<string> {
  const rows = (await exec.$queryRawUnsafe(
    `SELECT default_collation_name AS co FROM information_schema.schemata WHERE schema_name = '${esc(db)}'`,
  )) as Array<{ co: string }>;
  const co = String(rows[0]?.co || '').trim();
  if (!/^[a-z0-9_]+$/i.test(co)) throw new Error(`Unsafe collation for ${db}: ${co}`);
  return co;
}
