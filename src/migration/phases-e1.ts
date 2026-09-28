/**
 * Deterministic INT ids + PK swap for trips, points, comments, failedlogs,
 * routenotfoundlogs (verify already has INT id; users stays UUID).
 * INVARIANT: legacyId set ⟺ state row exists — quarantined rows keep
 * legacyId NULL, so they never enter the INT keyspace; backfill covers only
 * the logs tables and resume gaps.
 */
import { PrismaClient } from '@prisma/client';
import { DbExecutor, esc, inTx, isUuid, qi, qtable, toCount } from './db';
import { lookupState, lookupStateOrPending, quarantineDryAware, recordState, resolvePlaceholder } from './state';
import { Counters } from './types';

// Target shape for every table listed: INT AUTO_INCREMENT `id` PK (first
// column), UUID preserved in `legacyId`, `_id` dropped (prisma/schema.prisma).
// users stays UUID; verify already has INT `_id`.
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
    // Dry-run before ddl: legacyId missing — fall back to the UUID PK so the
    // report can still count what WOULD be assigned.
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
      // A done marker while every legacyId is NULL (rolled-back child phase)
      // is not a completed swap: ignore it and swap for real this run.
      if (idIsPk || !stillHasUuidPk) {
        const keys = await legacyOrder(prisma, db, table);
        c.skipped += keys.length;
        continue;
      }
    }
    // 1. Crash-recovery backfill: rows with legacyId but no state mapping
    // (crash between UPDATE and recordState) get the deterministic next id;
    // legacyId-NULL rows are quarantined/logs and stay untouched (this
    // backfill never writes legacyId, so it cannot resurrect quarantined
    // rows). Skipped entirely when `_id` is gone (already swapped).
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
        // Fall through to step 2 via keys (legacyOrder picks it up); nothing to write here.
        void k;
      }
    }
    // Logs map legacyId without validation, so fill it here (idempotent) —
    // only while `_id` still exists; post-swap there is nothing to fill from.
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
      // Do NOT write the pkswapped marker when nothing is mapped: a
      // rolled-back child phase plus this marker would make resumes skip
      // the swap forever (tripId stays NULL). Verify reports PENDING instead.
      c.skipped++;
      continue;
    }
    // 2. Deterministic INT ids in legacy-UUID order; existing mappings are
    //    never overwritten. Quarantined rows keep legacyId NULL, so they are
    //    absent from `keys` and never enter the INT keyspace (an all-quarantined
    //    snapshot makes allocation + swap a no-op via the keys.length===0
    //    continue). Only logs tables may carry 0 placeholders, resolved below.
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
      // First mapping wins on reruns. A 0 placeholder is promoted IN PLACE via
      // resolvePlaceholder, never DELETE+INSERT: a crash between the two would
      // lose the mapping and orphan the row.
      const assigned = existing === 0
        ? await resolvePlaceholder(prisma, db, entity, k, next, runId)
        : await recordState(prisma, db, entity, k, next, runId);
      // Use the id the state table actually holds (a concurrent run may have
      // won), so the keyspace stays consistent.
      used.add(assigned);
      if (assigned === next) next++;
    }
    // 3. Swap the PK (MySQL DDL commits implicitly; marker = resume). Only
    //    legacyId-bearing rows participate, so quarantined orphans never
    //    block the swap. The `id` column comes from the ddl phase, and
    //    `valued===0` early-continues above, so ADD PRIMARY KEY always has
    //    a fully-valued column here.
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
      // Backfill NULL ids from migration_state BEFORE dropping the UUID PK,
      // then refuse if any NULL remains (interrupted mapping — resume, never
      // guess). Quarantined rows (legacyId NULL) never reach this block.
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
        // valued > 0 guaranteed above; the backfill fills the rest, so a
        // later stillNull can only be an interrupted mapping — never a
        // quarantined orphan (they have no legacyId and are in no keys).
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
        // `_id` is preserved in UNIQUE legacyId before dropping (guaranteed
        // by the refusal checks), so the drop is never data loss — the final
        // schema has no `_id`.
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
        // NOT NULL before ADD PRIMARY KEY: MySQL silently coerces NULLs to 0
        // when promoting a nullable column to PK, collapsing rows onto a dup key.
        await prisma.$executeRawUnsafe(`ALTER TABLE ${qtable(db, table)} MODIFY ${qi('id')} INT NOT NULL`);
        await prisma.$executeRawUnsafe(`ALTER TABLE ${qtable(db, table)} ADD PRIMARY KEY (${qi('id')})`);
        // AUTO_INCREMENT requires the column to already be a key; FIRST matches the target layout.
        await prisma.$executeRawUnsafe(`ALTER TABLE ${qtable(db, table)} MODIFY ${qi('id')} INT NOT NULL AUTO_INCREMENT FIRST`);
      }
    }
    await recordState(prisma, db, `${entity}:pkswapped`, 'done', 1, runId);
    c.migrated += keys.length;
  }
  return c;
}

export { inTx };
