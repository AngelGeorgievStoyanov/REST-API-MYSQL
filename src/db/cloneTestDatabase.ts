import dotenv = require('dotenv');
import mysql = require('mysql');

dotenv.config();

export const DEFAULT_SOURCE_DB = 'hack_trip';
export const TARGET_DB_ENV = 'MIGRATION_TEST_DB';
export const SOURCE_DB_ENV = 'CLONE_SOURCE_DB';
export const ALLOW_NON_LOCAL_ENV = 'CLONE_ALLOW_NON_LOCAL';

const SYSTEM_SCHEMAS = ['information_schema', 'mysql', 'performance_schema', 'sys'];
const IDENTIFIER_RE = /^[A-Za-z0-9_$-]{1,64}$/;
const DEFAULT_PORT = 3306;

export interface CloneConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  sourceDb: string;
  targetDb: string;
  allowNonLocal: boolean;
}

export interface CliOptions {
  dryRun: boolean;
  confirm: boolean;
  help: boolean;
}

export type EnvSource = Record<string, string | undefined>;

export class CloneGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloneGuardError';
  }
}

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { dryRun: false, confirm: false, help: false };
  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '--plan' || arg === '-n') opts.dryRun = true;
    else if (arg === '--confirm') opts.confirm = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else throw new CloneGuardError(`Unknown argument "${arg}". Use --help.`);
  }
  return opts;
}

export function helpText(): string {
  return [
    'Clone/reset the test database from the current source database.',
    '',
    '  npm run db:clone-test                 DROP + CREATE target, then copy source',
    '  npm run db:clone-test:dry-run         read-only: print the SQL that would run',
    '  npm run db:clone-test -- --confirm    required for non-localhost servers',
    '  npm run db:clone-test -- --help       this text',
    '',
    'Environment (.env):',
    `  ${TARGET_DB_ENV}   target database name (required, no default)`,
    `  ${SOURCE_DB_ENV}   source database name (default: ${DEFAULT_SOURCE_DB})`,
    '  MYSQL_HOST / MYSQL_PORT (or MYSQOL_PORT) / MYSQL_USER / MYSQL_PASSWORD',
    `  ${ALLOW_NON_LOCAL_ENV}=true   opt-in for non-localhost MYSQL_HOST`,
    '',
    'The source database is opened read-only and can never be a target: a target',
    'equal to the source (ignoring case and `-`/`_`) is refused. Tables are',
    'recreated from SHOW CREATE TABLE, so columns, primary keys, unique keys,',
    'indexes, CHECK constraints, foreign keys and table options are preserved;',
    'the data is copied server-side with INSERT ... SELECT.',
    '',
    'Exit codes: 0 = completed (warnings possible), 1 = unexpected error or',
    '            verification mismatch, 2 = guard/preflight refusal.',
  ].join('\n');
}

export function isLocalHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
}

/** Case- and separator-insensitive name key (`hack-trip` == `hack_trip`). */
export function normalizeDbName(name: string): string {
  return name.trim().toLowerCase().replace(/[-_]/g, '');
}

/** Validated before any connection opens, so an unsafe target never reaches DROP. */
export function assertSafeTarget(sourceDb: string, targetDb: string): void {
  const source = sourceDb.trim();
  const target = targetDb.trim();
  if (!target) {
    throw new CloneGuardError(`${TARGET_DB_ENV} is not set. Refusing to guess a target database.`);
  }
  if (!IDENTIFIER_RE.test(source)) {
    throw new CloneGuardError(`Unsafe source database name "${sourceDb}".`);
  }
  if (!IDENTIFIER_RE.test(target)) {
    throw new CloneGuardError(
      `Unsafe target database name "${targetDb}" (allowed: letters, digits, _ - $; max 64).`,
    );
  }
  if (SYSTEM_SCHEMAS.includes(target.toLowerCase())) {
    throw new CloneGuardError(`Refusing to use system schema "${target}" as target.`);
  }
  if (normalizeDbName(source) === normalizeDbName(target)) {
    throw new CloneGuardError(
      `Refusing: target "${target}" IS the source database (names are compared ignoring case and - / _). ` +
        `Set ${TARGET_DB_ENV} to a disposable test database.`,
    );
  }
}

export function getConfig(env: EnvSource = process.env): CloneConfig {
  const host = (env.MYSQL_HOST || 'localhost').trim();
  // MYSQOL_PORT is the historical .env spelling.
  const rawPort = (env.MYSQL_PORT || env.MYSQOL_PORT || '').trim();
  const port = rawPort === '' ? DEFAULT_PORT : Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new CloneGuardError(`Invalid MySQL port "${rawPort}".`);
  }
  const user = (env.MYSQL_USER || '').trim();
  if (!user) {
    throw new CloneGuardError('MYSQL_USER is not set.');
  }
  const sourceDb = (env[SOURCE_DB_ENV] || DEFAULT_SOURCE_DB).trim();
  const targetDb = (env[TARGET_DB_ENV] || '').trim();
  assertSafeTarget(sourceDb, targetDb);
  return {
    host,
    port,
    user,
    password: env.MYSQL_PASSWORD || '',
    sourceDb,
    targetDb,
    allowNonLocal: (env[ALLOW_NON_LOCAL_ENV] || '').toLowerCase() === 'true',
  };
}

type Row = Record<string, unknown>;

export function qi(name: string): string {
  if (!IDENTIFIER_RE.test(name)) throw new CloneGuardError(`Unsafe identifier: ${name}`);
  return '`' + name + '`';
}

export function qtable(db: string, table: string): string {
  return qi(db) + '.' + qi(table);
}

function sqlString(value: string): string {
  return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Re-point every qualified reference to the source DB inside a DDL body. */
function requalify(sql: string, sourceDb: string, targetDb: string): string {
  return sql.replace(new RegExp('`' + escapeRegExp(sourceDb) + '`\\.', 'gi'), '`' + targetDb + '`.');
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function connect(conn: mysql.Connection): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    conn.connect((err) => (err ? reject(err) : resolve()));
  });
}

export function close(conn: mysql.Connection): Promise<void> {
  return new Promise<void>((resolve) => conn.end(() => resolve()));
}

export function q<T>(conn: mysql.Connection, sql: string, params: unknown[] = []): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    conn.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results as T);
    });
  });
}

export interface SchemaInfo {
  charset: string;
  collation: string;
}

export async function schemaInfo(conn: mysql.Connection, db: string): Promise<SchemaInfo | null> {
  const rows = await q<Row[]>(
    conn,
    'SELECT DEFAULT_CHARACTER_SET_NAME AS cs, DEFAULT_COLLATION_NAME AS co ' +
      'FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
    [db],
  );
  if (rows.length === 0) return null;
  const charset = str(rows[0].cs);
  const collation = str(rows[0].co);
  if (!/^[A-Za-z0-9_]+$/.test(charset) || !/^[A-Za-z0-9_]+$/.test(collation)) {
    throw new Error(`Unsafe charset/collation for \`${db}\`: ${charset}/${collation}`);
  }
  return { charset, collation };
}

export async function schemaExists(conn: mysql.Connection, db: string): Promise<boolean> {
  return (await schemaInfo(conn, db)) !== null;
}

/** Names that look like the requested (missing) database, for a helpful hint. */
export async function similarSchemas(conn: mysql.Connection, db: string): Promise<string[]> {
  const rows = await q<Row[]>(
    conn,
    'SELECT SCHEMA_NAME AS n FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME',
  );
  const needle = normalizeDbName(db);
  const prefix = needle.slice(0, 8);
  return rows
    .map((r) => str(r.n))
    .filter((n) => normalizeDbName(n).startsWith(prefix))
    .slice(0, 10);
}

export async function listBaseTables(conn: mysql.Connection, db: string): Promise<string[]> {
  const rows = await q<Row[]>(
    conn,
    'SELECT TABLE_NAME AS n FROM information_schema.TABLES ' +
      "WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
    [db],
  );
  return rows.map((r) => str(r.n));
}

export async function listViews(conn: mysql.Connection, db: string): Promise<string[]> {
  const rows = await q<Row[]>(
    conn,
    'SELECT TABLE_NAME AS n FROM information_schema.TABLES ' +
      "WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'VIEW' ORDER BY TABLE_NAME",
    [db],
  );
  return rows.map((r) => str(r.n));
}

export async function listTriggers(conn: mysql.Connection, db: string): Promise<string[]> {
  const rows = await q<Row[]>(
    conn,
    'SELECT TRIGGER_NAME AS n FROM information_schema.TRIGGERS ' +
      'WHERE TRIGGER_SCHEMA = ? ORDER BY TRIGGER_NAME',
    [db],
  );
  return rows.map((r) => str(r.n));
}

/** Copyable columns: generated columns cannot be written to explicitly. */
export async function insertableColumns(
  conn: mysql.Connection,
  db: string,
  table: string,
): Promise<string[]> {
  const rows = await q<Row[]>(
    conn,
    'SELECT COLUMN_NAME AS c, EXTRA AS e FROM information_schema.COLUMNS ' +
      'WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
    [db, table],
  );
  return rows
    .filter((r) => !str(r.e).toUpperCase().includes('GENERATED'))
    .map((r) => str(r.c));
}

/** SHOW CREATE TABLE quoted for the source database (SHOW does not quote it). */
export async function showCreate(
  conn: mysql.Connection,
  db: string,
  object: string,
  kind: 'TABLE' | 'VIEW' | 'TRIGGER',
): Promise<string> {
  const rows = await q<Row[]>(conn, `SHOW CREATE ${kind} ${qtable(db, object)}`);
  if (rows.length === 0) throw new Error(`SHOW CREATE ${kind} returned no row for \`${db}\`.\`${object}\`.`);
  // DDL column names: 'Create Table' | 'Create View' | 'SQL Original Statement'.
  const keys = Object.keys(rows[0]);
  const bodyKey =
    keys.find((k) => /^Create\s/i.test(k) || /^SQL\s+Original\s+Statement$/i.test(k)) ??
    keys[keys.length - 1] ??
    '';
  const ddl = str(rows[0][bodyKey]);
  if (ddl === '') throw new Error(`SHOW CREATE ${kind} returned no SQL for \`${db}\`.\`${object}\`.`);
  return ddl;
}

export async function rowCount(conn: mysql.Connection, db: string, table: string): Promise<number> {
  const rows = await q<Row[]>(conn, `SELECT COUNT(*) AS c FROM ${qtable(db, table)}`);
  return num(rows[0]?.c);
}

export interface StructureStats {
  tables: number;
  views: number;
  columns: number;
  primaryKeys: number;
  indexes: number;
  foreignKeys: number;
  triggers: number;
}

const BASE_TABLES_JOIN =
  'JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = x.TABLE_SCHEMA ' +
  "AND t.TABLE_NAME = x.TABLE_NAME AND t.TABLE_TYPE = 'BASE TABLE'";

export async function structureStats(
  conn: mysql.Connection,
  db: string,
): Promise<StructureStats> {
  const scalar = async (sql: string): Promise<number> => {
    const rows = await q<Row[]>(conn, sql, [db]);
    return num(rows[0]?.c);
  };
  return {
    tables: await scalar(
      "SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
    ),
    views: await scalar(
      "SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'VIEW'",
    ),
    columns: await scalar(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS x ${BASE_TABLES_JOIN} WHERE x.TABLE_SCHEMA = ?`,
    ),
    primaryKeys: await scalar(
      `SELECT COUNT(*) AS c FROM (SELECT x.TABLE_NAME FROM information_schema.STATISTICS x ${BASE_TABLES_JOIN} ` +
        "WHERE x.TABLE_SCHEMA = ? AND x.INDEX_NAME = 'PRIMARY' GROUP BY x.TABLE_NAME) y",
    ),
    indexes: await scalar(
      `SELECT COUNT(*) AS c FROM (SELECT x.TABLE_NAME, x.INDEX_NAME FROM information_schema.STATISTICS x ${BASE_TABLES_JOIN} ` +
        'WHERE x.TABLE_SCHEMA = ? GROUP BY x.TABLE_NAME, x.INDEX_NAME) y',
    ),
    foreignKeys: await scalar(
      `SELECT COUNT(*) AS c FROM (SELECT x.TABLE_NAME, x.CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE x ${BASE_TABLES_JOIN} ` +
        'WHERE x.TABLE_SCHEMA = ? AND x.REFERENCED_TABLE_NAME IS NOT NULL GROUP BY x.TABLE_NAME, x.CONSTRAINT_NAME) y',
    ),
    triggers: await scalar(
      'SELECT COUNT(*) AS c FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?',
    ),
  };
}

/** table -> referenced tables, used to create parents before children. */
export async function foreignKeyDeps(
  conn: mysql.Connection,
  db: string,
): Promise<Map<string, string[]>> {
  const rows = await q<Row[]>(
    conn,
    'SELECT TABLE_NAME AS t, REFERENCED_TABLE_NAME AS r FROM information_schema.KEY_COLUMN_USAGE ' +
      'WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL ' +
      'GROUP BY TABLE_NAME, REFERENCED_TABLE_NAME',
    [db],
  );
  const deps = new Map<string, string[]>();
  for (const row of rows) {
    const table = str(row.t);
    const referenced = str(row.r);
    if (table === '' || referenced === '') continue;
    const list = deps.get(table) ?? [];
    if (!list.includes(referenced)) list.push(referenced);
    deps.set(table, list);
  }
  return deps;
}

/**
 * Parents first; cyclic FK graphs go last (the session runs with
 * FOREIGN_KEY_CHECKS=0, so a missing reference cannot fail creation).
 */
export function orderTables(tables: string[], deps: Map<string, string[]>): string[] {
  const remaining = new Set(tables);
  const ordered: string[] = [];
  let progress = true;
  while (remaining.size > 0 && progress) {
    progress = false;
    for (const table of [...remaining]) {
      const parents = (deps.get(table) ?? []).filter((p) => p !== table);
      if (parents.some((p) => remaining.has(p))) continue;
      ordered.push(table);
      remaining.delete(table);
      progress = true;
    }
  }
  for (const table of remaining) ordered.push(table);
  return ordered;
}

export function dropDatabaseStatement(db: string): string {
  return `DROP DATABASE IF EXISTS ${qi(db)}`;
}

export function createDatabaseStatement(db: string, info: SchemaInfo): string {
  return `CREATE DATABASE ${qi(db)} CHARACTER SET ${info.charset} COLLATE ${info.collation}`;
}

export async function createTableStatement(
  conn: mysql.Connection,
  cfg: CloneConfig,
  table: string,
): Promise<string> {
  const ddl = requalify(
    await showCreate(conn, cfg.sourceDb, table, 'TABLE'),
    cfg.sourceDb,
    cfg.targetDb,
  );
  const bodyStart = ddl.indexOf('(');
  if (bodyStart < 0) throw new Error(`Unexpected SHOW CREATE TABLE output for \`${table}\`.`);
  return `CREATE TABLE ${qtable(cfg.targetDb, table)} ${ddl.slice(bodyStart)}`;
}

export async function createViewStatement(
  conn: mysql.Connection,
  cfg: CloneConfig,
  view: string,
): Promise<string> {
  const ddl = requalify(
    await showCreate(conn, cfg.sourceDb, view, 'VIEW'),
    cfg.sourceDb,
    cfg.targetDb,
  );
  return ddl.replace(
    new RegExp('VIEW\\s+`' + escapeRegExp(view) + '`', 'i'),
    `VIEW ${qtable(cfg.targetDb, view)}`,
  );
}

export async function createTriggerStatement(
  conn: mysql.Connection,
  cfg: CloneConfig,
  trigger: string,
): Promise<string> {
  const ddl = requalify(
    await showCreate(conn, cfg.sourceDb, trigger, 'TRIGGER'),
    cfg.sourceDb,
    cfg.targetDb,
  );
  return ddl.replace(
    new RegExp('TRIGGER\\s+`' + escapeRegExp(trigger) + '`', 'i'),
    `TRIGGER ${qtable(cfg.targetDb, trigger)}`,
  );
}

/** Server-side data copy: no client round-trip, all data types verbatim. */
export function insertSelectStatement(
  cfg: CloneConfig,
  table: string,
  columns: string[],
): string {
  const columnList = columns.map((c) => qi(c)).join(', ');
  return (
    `INSERT INTO ${qtable(cfg.targetDb, table)} (${columnList}) ` +
    `SELECT ${columnList} FROM ${qtable(cfg.sourceDb, table)}`
  );
}

export async function sessionSqlMode(conn: mysql.Connection): Promise<string> {
  const rows = await q<Row[]>(conn, 'SELECT @@SESSION.sql_mode AS m');
  return str(rows[0]?.m);
}

/** Adds NO_AUTO_VALUE_ON_ZERO (as mysqldump does) so a stored AUTO_INCREMENT
 *  key of 0 is copied verbatim instead of being replaced by a new id. */
export function withNoAutoValueOnZero(mode: string): string {
  const parts = mode
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (!parts.includes('NO_AUTO_VALUE_ON_ZERO')) parts.push('NO_AUTO_VALUE_ON_ZERO');
  return parts.join(',');
}

export interface ClonePlan {
  tables: string[];
  views: string[];
  triggers: string[];
  targetExists: boolean;
  source: SchemaInfo;
}

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}

function printBaseDryRun(cfg: CloneConfig, targetExists: boolean): void {
  console.log('PLAN (statements a live run would execute):');
  console.log(`  SET SESSION FOREIGN_KEY_CHECKS = 0;`);
  console.log(`  ${dropDatabaseStatement(cfg.targetDb)};   -- target exists: ${targetExists ? 'yes' : 'no'}`);
  console.log(
    `  CREATE DATABASE ${qi(cfg.targetDb)} CHARACTER SET <source charset> COLLATE <source collation>;` +
      '   -- read once the source database is reachable',
  );
  console.log('  CREATE TABLE / INSERT ... SELECT for every source table (see --dry-run with a reachable source)');
  console.log('  SET SESSION FOREIGN_KEY_CHECKS = 1;');
}

async function printDryRun(
  conn: mysql.Connection,
  cfg: CloneConfig,
  plan: ClonePlan,
): Promise<void> {
  console.log('PLAN — exact statements a live run would execute:');
  console.log('  SET SESSION FOREIGN_KEY_CHECKS = 0;');
  console.log(
    `  ${dropDatabaseStatement(cfg.targetDb)};   -- target exists: ${plan.targetExists ? 'yes' : 'no'}`,
  );
  console.log(`  ${createDatabaseStatement(cfg.targetDb, plan.source)};`);

  console.log(
    `  -- structure: ${plan.tables.length} table(s), parents before children, DDL from SHOW CREATE TABLE`,
  );
  let totalRows = 0;
  const inserts: string[] = [];
  for (const table of plan.tables) {
    const rows = await rowCount(conn, cfg.sourceDb, table);
    totalRows += rows;
    const columns = await insertableColumns(conn, cfg.sourceDb, table);
    console.log('');
    console.log(`  -- \`${table}\`: source rows=${rows}, copyable columns=${columns.length}`);
    console.log(indent((await createTableStatement(conn, cfg, table)) + ';', '  '));
    inserts.push(indent(insertSelectStatement(cfg, table, columns) + ';', '  '));
  }
  console.log('');
  console.log(`  -- data: ${inserts.length} server-side INSERT ... SELECT statement(s)`);
  for (const statement of inserts) console.log(statement);
  for (const view of plan.views) {
    console.log(indent((await createViewStatement(conn, cfg, view)) + ';', '  '));
  }
  for (const trigger of plan.triggers) {
    console.log(indent((await createTriggerStatement(conn, cfg, trigger)) + ';', '  '));
  }
  console.log('  SET SESSION FOREIGN_KEY_CHECKS = 1;');
  console.log(
    `PLAN-TOTAL source rows=${totalRows} tables=${plan.tables.length} views=${plan.views.length} triggers=${plan.triggers.length}`,
  );
}

async function createTargetTables(
  conn: mysql.Connection,
  cfg: CloneConfig,
  plan: ClonePlan,
): Promise<void> {
  const deferred: Array<{ table: string; ddl: string }> = [];
  for (const table of plan.tables) {
    const ddl = await createTableStatement(conn, cfg, table);
    try {
      await q(conn, ddl);
      console.log(`[ddl] created ${qtable(cfg.targetDb, table)}`);
    } catch (e) {
      deferred.push({ table, ddl });
      console.log(`[ddl] deferred ${qtable(cfg.targetDb, table)}: ${errorMessage(e)}`);
    }
  }
  for (const item of deferred) {
    try {
      await q(conn, item.ddl);
      console.log(`[ddl] created ${qtable(cfg.targetDb, item.table)} (retry after other tables)`);
    } catch (e) {
      throw new Error(`CREATE TABLE failed for \`${item.table}\`: ${errorMessage(e)}`, { cause: e });
    }
  }
}

async function copyTableData(
  conn: mysql.Connection,
  cfg: CloneConfig,
  plan: ClonePlan,
  warnings: string[],
): Promise<number> {
  const mode = await sessionSqlMode(conn);
  const copyMode = withNoAutoValueOnZero(mode);
  if (copyMode !== mode) {
    console.log(`[data] session sql_mode += NO_AUTO_VALUE_ON_ZERO`);
    await q(conn, `SET SESSION sql_mode = ${sqlString(copyMode)}`);
  }
  let copied = 0;
  try {
    for (const table of plan.tables) {
      const columns = await insertableColumns(conn, cfg.sourceDb, table);
      if (columns.length === 0) {
        warnings.push(`table \`${table}\` has no writable columns — data skipped`);
        console.log(`[data] ${table}: skipped (no writable columns)`);
        continue;
      }
      const sql = insertSelectStatement(cfg, table, columns);
      const started = Date.now();
      try {
        await q(conn, sql);
      } catch (e) {
        throw new Error(`data copy failed for \`${table}\`: ${errorMessage(e)}\n  SQL: ${sql}`, {
          cause: e,
        });
      }
      const rows = await rowCount(conn, cfg.targetDb, table);
      copied += rows;
      console.log(`[data] ${table}: ${rows} rows in ${Date.now() - started} ms`);
    }
  } finally {
    if (copyMode !== mode) await q(conn, `SET SESSION sql_mode = ${sqlString(mode)}`);
  }
  return copied;
}

async function copyViewsAndTriggers(
  conn: mysql.Connection,
  cfg: CloneConfig,
  plan: ClonePlan,
  warnings: string[],
): Promise<void> {
  for (const view of plan.views) {
    try {
      await q(conn, await createViewStatement(conn, cfg, view));
      console.log(`[view] created ${qtable(cfg.targetDb, view)}`);
    } catch (e) {
      warnings.push(`view \`${view}\` not created: ${errorMessage(e)}`);
    }
  }
  for (const trigger of plan.triggers) {
    try {
      await q(conn, await createTriggerStatement(conn, cfg, trigger));
      console.log(`[trigger] created ${qtable(cfg.targetDb, trigger)}`);
    } catch (e) {
      warnings.push(`trigger \`${trigger}\` not created: ${errorMessage(e)}`);
    }
  }
}

export async function executeClone(
  conn: mysql.Connection,
  cfg: CloneConfig,
  plan: ClonePlan,
): Promise<void> {
  const warnings: string[] = [];

  await q(conn, 'SET SESSION FOREIGN_KEY_CHECKS = 0');
  console.log('EXEC SET SESSION FOREIGN_KEY_CHECKS = 0;   -- this session only, both databases');

  console.log(`EXEC ${dropDatabaseStatement(cfg.targetDb)};`);
  await q(conn, dropDatabaseStatement(cfg.targetDb));
  const createDb = createDatabaseStatement(cfg.targetDb, plan.source);
  console.log(`EXEC ${createDb};`);
  await q(conn, createDb);

  await createTargetTables(conn, cfg, plan);
  const copiedRows = await copyTableData(conn, cfg, plan, warnings);
  await copyViewsAndTriggers(conn, cfg, plan, warnings);

  await q(conn, 'SET SESSION FOREIGN_KEY_CHECKS = 1');
  console.log('EXEC SET SESSION FOREIGN_KEY_CHECKS = 1;');

  const mismatches = await verifyClone(conn, cfg, plan);
  for (const warning of warnings) console.log('WARN ' + warning);

  if (mismatches.length > 0) {
    console.error('CLONE_MISMATCH');
    for (const mismatch of mismatches) console.error('  - ' + mismatch);
    process.exitCode = 1;
    return;
  }
  console.log(
    `CLONE_DONE \`${cfg.targetDb}\` is a clean copy of \`${cfg.sourceDb}\` ` +
      `(tables=${plan.tables.length} rows=${copiedRows} warnings=${warnings.length}).`,
  );
  console.log('Point DATABASE_URL at the target database before running migration tests.');
}

export async function verifyClone(
  conn: mysql.Connection,
  cfg: CloneConfig,
  plan: ClonePlan,
): Promise<string[]> {
  const mismatches: string[] = [];
  console.log('VERIFICATION:');
  const source = await structureStats(conn, cfg.sourceDb);
  const target = await structureStats(conn, cfg.targetDb);
  const keys: Array<keyof StructureStats> = [
    'tables',
    'views',
    'columns',
    'primaryKeys',
    'indexes',
    'foreignKeys',
    'triggers',
  ];
  for (const key of keys) {
    const ok = source[key] === target[key];
    if (!ok) mismatches.push(`${key}: source=${source[key]} target=${target[key]}`);
    console.log(`  [${ok ? 'OK' : 'MISMATCH'}] ${key}: source=${source[key]} target=${target[key]}`);
  }
  let sourceRows = 0;
  let targetRows = 0;
  for (const table of plan.tables) {
    const s = await rowCount(conn, cfg.sourceDb, table);
    const t = await rowCount(conn, cfg.targetDb, table);
    sourceRows += s;
    targetRows += t;
    if (s !== t) {
      mismatches.push(`rows \`${table}\`: source=${s} target=${t}`);
      console.log(`  [MISMATCH] rows \`${table}\`: source=${s} target=${t}`);
    }
  }
  const rowsOk = sourceRows === targetRows;
  if (!rowsOk) {
    mismatches.push(`total rows: source=${sourceRows} target=${targetRows}`);
  }
  console.log(`  [${rowsOk ? 'OK' : 'MISMATCH'}] total rows: source=${sourceRows} target=${targetRows}`);
  return mismatches;
}

async function main(): Promise<void> {
  let opts: CliOptions;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error('ARG_ERROR ' + errorMessage(e));
    console.error(helpText());
    process.exitCode = 1;
    return;
  }
  if (opts.help) {
    console.log(helpText());
    return;
  }

  let cfg: CloneConfig;
  try {
    cfg = getConfig();
  } catch (e) {
    if (e instanceof CloneGuardError) {
      console.error('GUARD_REFUSE ' + e.message);
      process.exitCode = 2;
      return;
    }
    throw e;
  }

  if (!isLocalHost(cfg.host) && !(cfg.allowNonLocal && opts.confirm)) {
    console.error(
      `GUARD_REFUSE non-localhost MYSQL_HOST "${cfg.host}" requires ` +
        `${ALLOW_NON_LOCAL_ENV}=true and --confirm.`,
    );
    process.exitCode = 2;
    return;
  }

  console.log(
    `CLONE ${opts.dryRun ? 'DRY-RUN (nothing will be executed)' : 'EXECUTE (target will be dropped and recreated)'}`,
  );
  console.log(`  server  ${cfg.host}:${cfg.port} as ${cfg.user}`);
  console.log(`  source  ${cfg.sourceDb}   (read-only: SHOW CREATE TABLE / SELECT only)`);
  console.log(`  target  ${cfg.targetDb}   (dropped + recreated)`);
  if (!normalizeDbName(cfg.targetDb).includes('test')) {
    console.log('  WARN    target name does not contain "test" — make sure it is disposable.');
  }

  const conn = mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    charset: 'utf8mb4',
    multipleStatements: false,
  });

  try {
    await connect(conn);
    console.log(`CONNECTED ${cfg.host}:${cfg.port} as ${cfg.user} (single session)`);

    const source = await schemaInfo(conn, cfg.sourceDb);
    const targetExists = await schemaExists(conn, cfg.targetDb);

    if (!source) {
      const hints = await similarSchemas(conn, cfg.sourceDb);
      const detail =
        `source database \`${cfg.sourceDb}\` does not exist on ${cfg.host}:${cfg.port}` +
        (hints.length > 0
          ? `; similar schemas: ${hints.join(', ')} (override with ${SOURCE_DB_ENV})`
          : '');
      if (opts.dryRun) {
        console.log('CLONE_WARN ' + detail);
        printBaseDryRun(cfg, targetExists);
        console.log('DRY-RUN complete: nothing was executed.');
        return;
      }
      console.error('PREFLIGHT_FAIL ' + detail);
      process.exitCode = 2;
      return;
    }

    console.log(
      `SOURCE ${cfg.sourceDb}: exists, charset=${source.charset} collation=${source.collation}`,
    );
    console.log(
      `TARGET ${cfg.targetDb}: ${targetExists ? 'exists → will be DROPPED and recreated' : 'missing → will be created'}`,
    );

    const tables = await listBaseTables(conn, cfg.sourceDb);
    const views = await listViews(conn, cfg.sourceDb);
    const triggers = await listTriggers(conn, cfg.sourceDb);
    const plan: ClonePlan = {
      tables: orderTables(tables, await foreignKeyDeps(conn, cfg.sourceDb)),
      views,
      triggers,
      targetExists,
      source,
    };
    console.log(
      `PLAN ${plan.tables.length} tables, ${plan.views.length} views, ${plan.triggers.length} triggers → \`${cfg.targetDb}\``,
    );

    if (opts.dryRun) {
      await printDryRun(conn, cfg, plan);
      console.log('DRY-RUN complete: nothing was executed.');
      return;
    }
    await executeClone(conn, cfg, plan);
  } catch (e) {
    if (e instanceof CloneGuardError) {
      console.error('GUARD_REFUSE ' + e.message);
      process.exitCode = 2;
    } else {
      console.error('CLONE_FAILED ' + errorMessage(e));
      process.exitCode = 1;
    }
  } finally {
    await close(conn);
  }
}

main();






