import { MIGRATION_NAME, MIGRATION_VERSION } from './config';
import { DbExecutor, esc, legacyGroupColumn, legacyKeyColumn, qi, qtable } from './db';

export const RUN_TABLE = 'migration_runs';
export const STATE_TABLE = 'migration_state';
export const QUARANTINE_TABLE = 'migration_quarantine';

export async function ensureControlTables(
  exec: DbExecutor,
  db: string,
): Promise<void> {
  await exec.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS ${qtable(db, RUN_TABLE)} (` +
      `${qi('id')} INT NOT NULL PRIMARY KEY AUTO_INCREMENT, ` +
      `${qi('migration_name')} VARCHAR(120) NOT NULL, ` +
      `${qi('version')} VARCHAR(40) NOT NULL, ` +
      `${qi('started_at')} DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), ` +
      `${qi('completed_at')} DATETIME(3) NULL DEFAULT NULL, ` +
      `${qi('status')} VARCHAR(20) NOT NULL DEFAULT 'RUNNING', ` +
      `${qi('error')} VARCHAR(2000) NULL DEFAULT NULL, ` +
      `${qi('dry_run')} TINYINT NOT NULL DEFAULT 0` +
      `) ENGINE=InnoDB`,
  );
  await exec.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS ${qtable(db, STATE_TABLE)} (` +
      `${qi('id')} INT NOT NULL PRIMARY KEY AUTO_INCREMENT, ` +
      `${qi('entity')} VARCHAR(60) NOT NULL, ` +
      `${qi('legacy_key')} VARCHAR(255) NOT NULL, ` +
      `${qi('new_id')} INT NOT NULL, ` +
      `${qi('run_id')} INT NULL DEFAULT NULL, ` +
      `${qi('created_at')} DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), ` +
      `UNIQUE KEY ${qi('uq_state_entity_key')} (${qi('entity')}, ${qi('legacy_key')})` +
      `) ENGINE=InnoDB`,
  );
  await exec.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS ${qtable(db, QUARANTINE_TABLE)} (` +
      `${qi('id')} INT NOT NULL PRIMARY KEY AUTO_INCREMENT, ` +
      `${qi('run_id')} INT NULL DEFAULT NULL, ` +
      `${qi('entity')} VARCHAR(60) NOT NULL, ` +
      `${qi('legacy_id')} VARCHAR(255) NULL DEFAULT NULL, ` +
      `${qi('reason_code')} VARCHAR(60) NOT NULL, ` +
      `${qi('reason')} VARCHAR(1000) NOT NULL, ` +
      `${qi('payload')} JSON NULL DEFAULT NULL, ` +
      `${qi('created_at')} DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), ` +
      `KEY ${qi('ix_quarantine_entity')} (${qi('entity')}), ` +
      // Rerun dedupe: the UNIQUE key excludes run_id, so evidence is recorded
      // once globally; run_id keeps the FIRST run that saw it.
      `UNIQUE KEY ${qi('uq_quarantine_entity_key_reason')} (${qi('entity')}, ${qi('legacy_id')}, ${qi('reason_code')})` +
      `) ENGINE=InnoDB`,
  );
}

export async function startRun(
  exec: DbExecutor,
  db: string,
  dryRun: boolean,
): Promise<number> {
  await exec.$executeRawUnsafe(
    `INSERT INTO ${qtable(db, RUN_TABLE)} (${qi('migration_name')}, ${qi('version')}, ${qi('status')}, ${qi('dry_run')}) VALUES ('${MIGRATION_NAME}', '${MIGRATION_VERSION}', 'RUNNING', ${dryRun ? 1 : 0})`,
  );
  const rows = (await exec.$queryRawUnsafe(
    `SELECT LAST_INSERT_ID() AS id`,
  )) as Array<{ id: number | bigint }>;
  const v = rows[0].id;
  return typeof v === 'bigint' ? Number(v) : Number(v);
}

export async function finishRun(
  exec: DbExecutor,
  db: string,
  runId: number,
  status: 'COMPLETED' | 'FAILED',
  error: string,
): Promise<void> {
  const safe = esc(error.slice(0, 1900));
  try {
    await exec.$executeRawUnsafe(
      `UPDATE ${qtable(db, RUN_TABLE)} SET ${qi('status')} = '${status}', ${qi('completed_at')} = CURRENT_TIMESTAMP(3), ${qi('error')} = '${safe}' WHERE ${qi('id')} = ${runId}`,
    );
  } catch (e) {
    // activate drops the control tables, so the run record may legitimately be gone.
    if (String((e as Error).message).includes("doesn't exist")) {
      console.log(`[state] ${RUN_TABLE} was finalized away; run ${runId} (${status}) is not persisted (by design).`);
      return;
    }
    throw e;
  }
}

/** Dry-run before ddl: migration_state does not exist yet, so no mapping can be read. */
export class StateUnavailableError extends Error {
  constructor() {
    super('migration_state unavailable');
    this.name = 'StateUnavailableError';
  }
}

export function isStateUnavailable(e: unknown): boolean {
  return e instanceof StateUnavailableError;
}

/**
 * Dry-run without a migration_state table = "nothing recorded yet" (null).
 * Callers needing the difference from a missing row use lookupState, which
 * throws StateUnavailableError in that case.
 */
export async function lookupStateOrPending(
  exec: DbExecutor,
  db: string,
  dryRun: boolean,
  entity: string,
  legacyKey: string,
): Promise<number | null> {
  try {
    return await lookupState(exec, db, dryRun, entity, legacyKey);
  } catch (e) {
    if (isStateUnavailable(e)) return null;
    throw e;
  }
}

export async function lookupState(
  exec: DbExecutor,
  db: string,
  dryRun: boolean,
  entity: string,
  legacyKey: string,
): Promise<number | null> {
  try {
    const safe = esc(legacyKey);
    const rows = (await exec.$queryRawUnsafe(
      `SELECT ${qi('new_id')} AS n FROM ${qtable(db, STATE_TABLE)} WHERE ${qi('entity')} = '${entity}' AND ${qi('legacy_key')} = '${safe}' LIMIT 1`,
    )) as Array<{ n: number | bigint }>;
    if (rows.length === 0) return null;
    const v = rows[0].n;
    return typeof v === 'bigint' ? Number(v) : Number(v);
  } catch (e) {
    // Dry-run before ddl: control tables absent — NOT the same as "row missing" (a real null).
    if (dryRun && (e as Error).message.includes("doesn't exist")) throw new StateUnavailableError();
    throw e;
  }
}

export async function recordState(
  exec: DbExecutor,
  db: string,
  entity: string,
  legacyKey: string,
  newId: number,
  runId: number,
): Promise<number> {
  const safe = esc(legacyKey);
  // ON DUPLICATE KEY keeps the FIRST mapping stable across reruns and returns
  // the canonical new_id either way. A 0 placeholder is never overwritten here —
  // use resolvePlaceholder() to promote 0 -> real id.
  const rows = (await exec.$queryRawUnsafe(
    `INSERT INTO ${qtable(db, STATE_TABLE)} (${qi('entity')}, ${qi('legacy_key')}, ${qi('new_id')}, ${qi('run_id')}) VALUES ('${entity}', '${safe}', ${newId}, ${runId}) ` +
      `ON DUPLICATE KEY UPDATE ${qi('new_id')} = LAST_INSERT_ID(${qi('new_id')}), ${qi('run_id')} = ${runId}`,
  )) as unknown;
  void rows;
  const idRows = (await exec.$queryRawUnsafe(
    `SELECT ${qi('new_id')} AS n FROM ${qtable(db, STATE_TABLE)} WHERE ${qi('entity')} = '${entity}' AND ${qi('legacy_key')} = '${safe}' LIMIT 1`,
  )) as Array<{ n: number | bigint }>;
  const v = idRows[0].n;
  return typeof v === 'bigint' ? Number(v) : Number(v);
}

/**
 * Promotes a 0 placeholder (parked row: validated, INT id pending) to a real
 * id; only touches rows with new_id = 0, so real mappings are never
 * overwritten. Returns the canonical id (promoted or already real).
 */
export async function resolvePlaceholder(
  exec: DbExecutor,
  db: string,
  entity: string,
  legacyKey: string,
  newId: number,
  runId: number,
): Promise<number> {
  const safe = esc(legacyKey);
  await exec.$executeRawUnsafe(
    `UPDATE ${qtable(db, STATE_TABLE)} SET ${qi('new_id')} = ${newId}, ${qi('run_id')} = ${runId} ` +
      `WHERE ${qi('entity')} = '${entity}' AND ${qi('legacy_key')} = '${safe}' AND ${qi('new_id')} = 0`,
  );
  const idRows = (await exec.$queryRawUnsafe(
    `SELECT ${qi('new_id')} AS n FROM ${qtable(db, STATE_TABLE)} WHERE ${qi('entity')} = '${entity}' AND ${qi('legacy_key')} = '${safe}' LIMIT 1`,
  )) as Array<{ n: number | bigint }>;
  if (idRows.length === 0) {
    return recordState(exec, db, entity, legacyKey, newId, runId);
  }
  const v = idRows[0].n;
  return typeof v === 'bigint' ? Number(v) : Number(v);
}

/**
 * target  -> final INT id exists, migrate the tokens.
 * pending -> id not assigned yet (dry-run without state, or a 0 placeholder
 *            the PK swap will promote). Skip; reruns converge.
 * unmapped-> no mapping (parent missing/quarantined). Quarantine, never guess.
 */
export type TargetResolution =
  | { kind: 'target'; id: number }
  | { kind: 'pending' }
  | { kind: 'unmapped' };

/**
 * Final INT trip_groups.id for a legacy trip UUID. Favorites attach to the
 * trip GROUP (`favorites.tripGroupId`), never to `trips.id`. Works on every
 * table shape (VARCHAR tripGroupId via state lookup, tripGroupNewId or the
 * finalized tripGroupId read off the trip row). Unresolvable -> `unmapped`.
 */
export async function resolveTripGroupIntForTrip(
  exec: DbExecutor,
  db: string,
  dryRun: boolean,
  legacyTrip: string,
): Promise<TargetResolution> {
  const keyCol = await legacyKeyColumn(exec, db, 'trips');
  if (keyCol === '') return { kind: 'unmapped' };
  const groupCol = await legacyGroupColumn(exec, db);
  let raw: unknown;
  try {
    const groupExpr = groupCol === '' ? 'NULL' : qi(groupCol);
    const rows = (await exec.$queryRawUnsafe(
      `SELECT ${groupExpr} AS g FROM ${qtable(db, 'trips')} WHERE ${qi(keyCol)} = '${esc(legacyTrip)}' LIMIT 1`,
    )) as Array<{ g: unknown }>;
    if (rows.length === 0) return { kind: 'unmapped' };
    raw = rows[0].g;
  } catch (e) {
    // Dry-run before ddl: transitional columns/tables do not exist yet —
    // "not assigned yet", never a data defect.
    if (dryRun && (e as Error).message.includes('Unknown column')) return { kind: 'pending' };
    throw e;
  }
  const g = raw === null || raw === undefined ? '' : String(raw).trim();
  if (g === '') return { kind: 'unmapped' };
  // Already an INT: the group pointer has been finalized/backfilled.
  if (/^[0-9]+$/.test(g)) return { kind: 'target', id: Number(g) };
  try {
    const gid = await lookupState(exec, db, dryRun, 'TripGroup', g);
    // A 0 placeholder marks a group that was seen but could not be migrated
    // (no surviving owner); such a group can never hold a favorite.
    if (gid === null || gid === 0) return { kind: 'unmapped' };
    return { kind: 'target', id: gid };
  } catch (e) {
    if (isStateUnavailable(e)) return { kind: 'pending' };
    throw e;
  }
}

export async function quarantineDryAware(
  exec: DbExecutor,
  db: string,
  dryRun: boolean,
  runId: number,
  entity: string,
  legacyId: string,
  reasonCode: string,
  reason: string,
  payload: unknown,
): Promise<boolean> {
  // Dry-run counts quarantines without touching the table (it may not exist
  // before ddl). Live mode persists and reports newly inserted (false = already present).
  void db;
  if (dryRun) return true;
  return quarantine(exec, db, runId, entity, legacyId, reasonCode, reason, payload);
}

export async function quarantine(
  exec: DbExecutor,
  db: string,
  runId: number,
  entity: string,
  legacyId: string,
  reasonCode: string,
  reason: string,
  payload: unknown,
): Promise<boolean> {
  // false = identical evidence already exists (any run): the UNIQUE
  // (entity, legacy_id, reason_code) key suppresses rerun duplicates;
  // callers count only true (newly recorded).
  const safeLegacy = esc(legacyId.slice(0, 250));
  const safeReason = esc(reason.slice(0, 950));
  const safePayload = esc(JSON.stringify(payload ?? null).slice(0, 4000));
  const res = (await exec.$queryRawUnsafe(
    `INSERT INTO ${qtable(db, QUARANTINE_TABLE)} (${qi('run_id')}, ${qi('entity')}, ${qi('legacy_id')}, ${qi('reason_code')}, ${qi('reason')}, ${qi('payload')}) ` +
      `VALUES (${runId}, '${entity}', '${safeLegacy}', '${reasonCode}', '${safeReason}', CAST('${safePayload}' AS JSON)) ` +
      `ON DUPLICATE KEY UPDATE ${qi('id')} = LAST_INSERT_ID(${qi('id')})`,
  )) as unknown as { affectedRows?: number | bigint };
  const affected = Number((res as { affectedRows?: unknown }).affectedRows ?? 1);
  return affected === 1;
}
