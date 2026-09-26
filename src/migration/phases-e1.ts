/**
 * PHASE 4 — finalization E1: deterministic INT ids + PK swap.
 * Tables: trips, points, comments, failedlogs, routenotfoundlogs.
 * verify already has INT _id; users stays UUID (never touched).
 *
 * INVARIANT (enforced by the trips/points/comments data phases):
 *   legacyId set  ⟺  Trip/Point/Comment state row exists.
 * Quarantined rows keep legacyId NULL permanently and never appear in
 * `keys` below, so they never enter the INT keyspace. The backfill in
 * step 1 therefore only covers the logs tables (mapped without
 * validation) plus resume-after-crash gaps — never quarantined rows.
 */
import { PrismaClient } from '@prisma/client';
import { DbExecutor, esc, inTx, isUuid, qi, qtable, toCount } from './db';
import { lookupState, lookupStateOrPending, quarantineDryAware, recordState, resolvePlaceholder } from './state';
import { Counters } from './types';

// EVERY table listed here reaches the target shape: INT AUTO_INCREMENT `id`
// as PRIMARY KEY (first column), legacy UUID preserved in `legacyId`, and
// the legacy `_id` column dropped. This matches prisma/schema.prisma, where
// Trip/Point/Comment/FailedLog/RouteNotFoundLog all declare
// `id Int @id @default(autoincrement())`.
// `users` is deliberately absent: User.id stays UUID forever.
// `verify` is absent too: its `_id` is ALREADY INT AUTO_INCREMENT.
const PK_TABLES = ['trips', 'points', 'comments', 'failedlogs', 'routenotfoundlogs'] as const;
type PkTable = (typeof PK_TABLES)[number];

const ENTITY: Record<PkTable, string> = {
  trips: 'Trip',
  points: 'Point',
  comments: 'Comment',
  failedlogs: 'FailedLog',
  routenotfoundlogs: 'RouteNotFoundLog',
};

async function hasColumn(exec: DbExecutor, db: string, table: string, column: string): Promise<boolean> {
  const rows = (await exec.$queryRawUnsafe(
    `SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = '${esc(table)}' AND COLUMN_NAME = '${esc(column)}' LIMIT 1`,
  )) as Array<{ ok: number }>;
  return rows.length > 0;
}

async function isPrimaryKey(exec: DbExecutor, db: string, table: string, column: string): Promise<boolean> {
  const rows = (await exec.$queryRawUnsafe(
    `SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = '${esc(table)}' AND COLUMN_NAME = '${esc(column)}' AND COLUMN_KEY = 'PRI' LIMIT 1`,
  )) as Array<{ ok: number }>;
  return rows.length > 0;
}

/** Deterministic order: legacy UUID ascending. Stable across reruns. */
async function legacyOrder(exec: DbExecutor, db: string, table: PkTable): Promise<string[]> {
  try {
    const rows = (await exec.$queryRawUnsafe(
      `SELECT ${qi('legacyId')} AS k FROM ${qtable(db, table)} WHERE ${qi('legacyId')} IS NOT NULL ORDER BY ${qi('legacyId')} ASC`,
    )) as Array<{ k: unknown }>;
    return rows.map((r) => String(r.k));
  } catch (e) {
    // Dry-run before ddl: legacyId does not exist yet. Fall back to the
    // live UUID PK so the report can still count what WOULD be assigned.
    if (String((e as Error).message).includes('Unknown column')) {
      const rows = (await exec.$queryRawUnsafe(
        `SELECT ${qi('_id')} AS k FROM ${qtable(db, table)} ORDER BY ${qi('_id')} ASC`,
      )) as Array<{ k: unknown }>;
      return rows.map((r) => String(r.k));
    }
    throw e;
  }
}


export async function phasePkswap(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  if (dryRun) {
    // Read-only rehearsal: report what WOULD be assigned.
    for (const table of PK_TABLES) {
      const keys = await legacyOrder(prisma, db, table);
      const done = await lookupStateOrPending(prisma, db, true, `${ENTITY[table]}:pkswapped`, 'done');
      if (done !== null) c.skipped += keys.length;
      else c.migrated += keys.length;
    }
    return c;
  }
  for (const table of PK_TABLES) {
    const entity = ENTITY[table];
    const marker = await lookupState(prisma, db, false, `${entity}:pkswapped`, 'done');
    if (marker !== null) {
      const stillHasUuidPk = await hasColumn(prisma, db, table, '_id');
      const idIsPk = await isPrimaryKey(prisma, db, table, 'id');
      // A previous run wrote the done marker while every legacyId was still
      // NULL (points/comments transaction had rolled back). That marker is
      // not a completed swap: the UUID PK is still there and `id` is not.
      // Ignore it so this run allocates ids and swaps for real.
      if (idIsPk || !stillHasUuidPk) {
        const keys = await legacyOrder(prisma, db, table);
        c.skipped += keys.length;
        continue;
      }
    }
    // 1. Crash-recovery backfill: a crash between the data-phase UPDATE
    // (legacyId set) and its recordState leaves a row with legacyId but no
    // state mapping. Re-resolve ONLY such rows (state row missing): give
    // them the deterministic next id. Rows with legacyId NULL are either
    // quarantined (no state row by design — left untouched) or logs rows
    // (handled below). This backfill cannot resurrect quarantined rows
    // because it never writes legacyId itself.
    // NOTE: on tables whose PK was ALREADY swapped (no `_id` column left,
    // e.g. rerun after logs swap), information_schema has no `_id` — skip
    // the legacyId backfill entirely (legacyId is already populated).
    const stillHasUuid = await hasColumn(prisma, db, table, '_id');
    if (stillHasUuid) {
      const orphaned = (await prisma.$queryRawUnsafe(
        `SELECT t.${qi('legacyId')} AS k FROM ${qtable(db, table)} t LEFT JOIN ${qtable(db, 'migration_state')} s ON s.${qi('entity')} = '${entity}' AND s.${qi('legacy_key')} = t.${qi('legacyId')} WHERE t.${qi('legacyId')} IS NOT NULL AND s.${qi('legacy_key')} IS NULL`,
      )) as Array<{ k: unknown }>;
      for (const r of orphaned) {
        const k = String(r.k ?? '');
        if (!isUuid(k)) {
          if (await quarantineDryAware(prisma, db, false, runId, entity, k || '(empty)', 'INVALID_UUID', `Cannot assign INT id: legacyId is not a canonical UUID.`, {})) c.quarantined++;
          continue;
        }
        // Fall through to step 2 allocation via keys (legacyOrder picks it
        // up since legacyId IS set). Nothing to write here.
        void k;
      }
    }
    // Logs tables map legacyId without validation in their data phase, so
    // legacyId may genuinely be missing there — fill it now (idempotent).
    // Only when `_id` still exists (pre-swap); post-swap there is nothing
    // to fill from.
    if ((table === 'failedlogs' || table === 'routenotfoundlogs') && stillHasUuid) {
      const missing = (await prisma.$queryRawUnsafe(
        `SELECT ${qi('_id')} AS k FROM ${qtable(db, table)} WHERE ${qi('legacyId')} IS NULL`,
      )) as Array<{ k: unknown }>;
      for (const r of missing) {
        const k = String(r.k ?? '');
        if (!isUuid(k)) {
          if (await quarantineDryAware(prisma, db, false, runId, entity, k || '(empty)', 'INVALID_UUID', `Cannot assign INT id: _id is not a canonical UUID.`, {})) c.quarantined++;
          continue;
        }
        await prisma.$executeRawUnsafe(
          `UPDATE ${qtable(db, table)} SET ${qi('legacyId')} = '${esc(k)}' WHERE ${qi('_id')} = '${esc(k)}' AND ${qi('legacyId')} IS NULL`,
        );
      }
    }
    const keys = await legacyOrder(prisma, db, table);
    if (keys.length === 0) {
      // Nothing is mapped yet. Do NOT write the pkswapped marker: a previous
      // points/comments phase can fail before writing legacyId (its
      // transaction rolls back) while this phase still runs. A done marker
      // here would make every later resume skip the swap forever, leaving
      // tripId NULL. Verify reports the missing PK as PENDING until a later
      // run actually maps rows and swaps.
      c.skipped++;
      continue;
    }
    // 2. Assign deterministic INT ids in legacy-UUID order. Existing state
    //    mappings are NEVER overwritten (first mapping wins, stable).
    //    Quarantined rows keep legacyId NULL (their data phase `continue`s
    //    before any recordState), so they never appear in `keys` and never
    //    enter the INT keyspace. Only the logs tables (mapped without
    //    validation) may carry 0 placeholders needing resolution here.
    //    NOTE: `keys` is empty on the dirty snapshot (all rows quarantined)
    //    → allocation is a no-op and the swap block below is skipped via
    //    the keys.length===0 early-continue above. No id values are ever
    //    written for quarantined rows.
    const usedRows = (await prisma.$queryRawUnsafe(
      `SELECT ${qi('new_id')} AS n FROM ${qtable(db, 'migration_state')} WHERE ${qi('entity')} = '${entity}' AND ${qi('new_id')} > 0`,
    )) as Array<{ n: number | bigint }>;
    const used = new Set(usedRows.map((r) => Number(r.n)));
    let next = 1;
    while (used.has(next)) next++;
    for (const k of keys) {
      const existing = await lookupState(prisma, db, false, entity, k);
      if (existing !== null && existing !== 0) continue;
      while (used.has(next)) next++;
      // recordState keeps the FIRST mapping on reruns; here there is none
      // (or a 0 placeholder). A 0 placeholder is promoted IN PLACE via
      // resolvePlaceholder (UPDATE ... WHERE new_id = 0) instead of
      // DELETE+INSERT: deleting first would lose the mapping entirely if
      // the process crashed between the two statements, orphaning the row.
      const assigned = existing === 0
        ? await resolvePlaceholder(prisma, db, entity, k, next, runId)
        : await recordState(prisma, db, entity, k, next, runId);
      // Use the id the state table actually holds (a concurrent/previous
      // run may have won the race), so the keyspace stays consistent.
      used.add(assigned);
      if (assigned === next) next++;
    }
    // 3. Swap the PK (DDL commits implicitly in MySQL; marker = resume).
    // Only legacyId-bearing rows participate: quarantined orphans
    // (legacyId NULL) are excluded from the INT keyspace by design, and
    // the refusal check below counts exactly that set — orphans can never
    // block the swap.
    // NOTE: the `id` column is created by the ddl phase (not here), so it
    // always exists by the time pkswap runs — including on reruns/resume.
    // `valued===0` (dirty snapshot: zero mappable rows) skips the swap
    // block entirely via the early-continue above — this block only runs
    // when at least one id value exists, so ADD PRIMARY KEY always has a
    // fully-valued column here (the backfill below is belt-and-braces).
    const hasId = await hasColumn(prisma, db, table, 'id');
    const idIsPk = hasId && (await isPrimaryKey(prisma, db, table, 'id'));
    if (!idIsPk) {
      if (!hasId) {
        throw new Error(
          `PK swap refused for ${table}: transitional \`id\` column missing. Re-run the ddl phase first.`,
        );
      }
      await prisma.$executeRawUnsafe(
        `UPDATE ${qtable(db, table)} t JOIN ${qtable(db, 'migration_state')} s ` +
          `ON s.${qi('entity')} = '${entity}' AND s.${qi('legacy_key')} = t.${qi('legacyId')} ` +
          `SET t.${qi('id')} = s.${qi('new_id')} WHERE t.${qi('legacyId')} IS NOT NULL AND s.${qi('new_id')} > 0`,
      );
      const unmapped = toCount((await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS c FROM ${qtable(db, table)} WHERE ${qi('legacyId')} IS NOT NULL AND ${qi('id')} IS NULL`,
      )) as Array<Record<string, unknown>>);
      if (unmapped > 0) {
        throw new Error(
          `PK swap refused for ${table}: ${unmapped} row(s) have no INT id mapping. Resolve quarantine first.`,
        );
      }
      // Promote id to PK. `valued > 0` is guaranteed here (the valued===0
      // case early-continues above), so at least one id value exists. Fill
      // order: (1) backfill every NULL id from migration_state FIRST, while
      // the UUID `_id` PK still exists; (2) refuse if any NULL remains
      // (interrupted mapping — resume, never guess); (3) drop the UUID
      // `_id` column (implicitly drops old PK); (4) add PRIMARY KEY on the
      // now-fully-valued id; (5) set AUTO_INCREMENT. Quarantined rows
      // (legacyId NULL) never reach this block — keys.length===0 for them.
      const valued = toCount((await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS c FROM ${qtable(db, table)} WHERE ${qi('id')} IS NOT NULL`,
      )) as Array<Record<string, unknown>>);
      if (valued === 0) {
        throw new Error(
          `PK swap invariant violated for ${table}: reached swap block with zero id values. This is a tooling bug, not dirty data — refusing.`,
        );
      }
      const idIsAlreadyPk = await isPrimaryKey(prisma, db, table, 'id');
      if (!idIsAlreadyPk) {
        // valued > 0 guaranteed above: at least one id value exists, and
        // the backfill below fills the rest from migration_state. The
        // stillNull refusal after it fires only on truly interrupted
        // mappings — never on quarantined orphans (they have no legacyId
        // and are excluded from keys entirely).
        await prisma.$executeRawUnsafe(
          `UPDATE ${qtable(db, table)} t JOIN ${qtable(db, 'migration_state')} s ` +
            `ON s.${qi('entity')} = '${entity}' AND s.${qi('legacy_key')} = t.${qi('legacyId')} ` +
            `SET t.${qi('id')} = s.${qi('new_id')} WHERE t.${qi('id')} IS NULL AND s.${qi('new_id')} > 0`,
        );
        const stillNull = toCount((await prisma.$queryRawUnsafe(
          `SELECT COUNT(*) AS c FROM ${qtable(db, table)} WHERE ${qi('id')} IS NULL`,
        )) as Array<Record<string, unknown>>);
        if (stillNull > 0) {
          throw new Error(
            `PK swap refused for ${table}: ${stillNull} row(s) still lack INT id after backfill. Resolve quarantine first.`,
          );
        }
        // Legacy `_id` is preserved in `legacyId` (UNIQUE) BEFORE it is
        // dropped: the data phases copy it there and the refusal checks
        // above guarantee every retained row is mapped. Dropping it here
        // is therefore never data loss — it is the documented end of the
        // transitional column's life (target schema has no `_id`).
        const uuidIsPresent = await hasColumn(prisma, db, table, '_id');
        if (uuidIsPresent) {
          const unpreserved = toCount((await prisma.$queryRawUnsafe(
            `SELECT COUNT(*) AS c FROM ${qtable(db, table)} WHERE ${qi('_id')} IS NOT NULL AND ${qi('legacyId')} IS NULL`,
          )) as Array<Record<string, unknown>>);
          if (unpreserved > 0) {
            throw new Error(
              `PK swap refused for ${table}: ${unpreserved} row(s) would lose their legacy UUID (_id set, legacyId NULL). Re-run the data phase before dropping _id.`,
            );
          }
          await prisma.$executeRawUnsafe(`ALTER TABLE ${qtable(db, table)} DROP COLUMN ${qi('_id')}`);
        }
        // NOT NULL must be set BEFORE ADD PRIMARY KEY: MySQL silently
        // coerces NULLs to 0 when a nullable column is promoted to PK,
        // which would collapse rows onto a duplicate 0 key.
        await prisma.$executeRawUnsafe(`ALTER TABLE ${qtable(db, table)} MODIFY ${qi('id')} INT NOT NULL`);
        await prisma.$executeRawUnsafe(`ALTER TABLE ${qtable(db, table)} ADD PRIMARY KEY (${qi('id')})`);
        // AUTO_INCREMENT requires the column to already be a key; making
        // `id` the FIRST column matches the target schema layout.
        await prisma.$executeRawUnsafe(`ALTER TABLE ${qtable(db, table)} MODIFY ${qi('id')} INT NOT NULL AUTO_INCREMENT FIRST`);
      }
    }
    await recordState(prisma, db, `${entity}:pkswapped`, 'done', 1, runId);
    c.migrated += keys.length;
  }
  return c;
}

export { inTx };
