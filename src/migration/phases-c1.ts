/**
 * PHASE 4 — per-phase migration, part C1 (likes/favorites/tripReports).
 * Split/trim/validate; quarantine unknown/malformed/duplicates.
 */
import { PrismaClient } from '@prisma/client';
import { DbExecutor, esc, inTx, isUuid, qi, qtable, splitList } from './db';
import { isStateUnavailable, lookupState, lookupStateOrPending, quarantineDryAware, recordState } from './state';
import { Counters } from './types';

async function userExists(exec: DbExecutor, db: string, id: string): Promise<boolean> {
  const rows = (await exec.$queryRawUnsafe(
    `SELECT 1 AS ok FROM ${qtable(db, 'users')} WHERE ${qi('_id')} = '${esc(id)}' LIMIT 1`,
  )) as Array<{ ok: number }>;
  return rows.length > 0;
}

async function runBody(
  prisma: PrismaClient,
  db: string,
  runId: number,
  dryRun: boolean,
  entity: 'Like' | 'Favorite' | 'TripReport',
  apply: (exec: DbExecutor) => Promise<Counters>,
): Promise<Counters> {
  if (dryRun) return apply(prisma);
  let out: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  await inTx(prisma, async (tx) => {
    out = await apply(tx);
  });
  return out;
}

async function normalizePair(
  prisma: PrismaClient, db: string, runId: number, dryRun: boolean,
  entity: 'Like' | 'Favorite' | 'TripReport', table: string, sourceColumn: string,
): Promise<Counters> {
  // Post-groupfinalize the trips table has NO `_id` column (dropped at
  // pkswap). Resolve the trip's legacy UUID via legacyId when `_id` is
  // gone; pre-swap (or rerun before swap) `_id` still exists. Probe once.
  const tripsHasUuid = (
    (await prisma.$queryRawUnsafe(
      `SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = 'trips' AND COLUMN_NAME = '_id' LIMIT 1`,
    )) as Array<{ ok: number }>
  ).length > 0;
  const idExpr = tripsHasUuid ? qi('_id') : qi('legacyId');
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT ${idExpr} AS legacyTrip, ${qi(sourceColumn)} AS raw FROM ${qtable(db, 'trips')}`,
  )) as Array<{ legacyTrip: unknown; raw: unknown }>;
  return runBody(prisma, db, runId, dryRun, entity, async (exec) => {
    const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
    for (const r of rows) {
      const legacyTrip = String(r.legacyTrip ?? '');
      let tid: number | null = null;
      let pending = false;
      try {
        tid = await lookupState(exec, db, dryRun, 'Trip', legacyTrip);
      } catch (e) {
        if (!isStateUnavailable(e)) throw e;
        pending = true;
      }
      // Pre-PK-swap: tid===0 means the trip row was processed but has no INT
      // id yet. A missing migration_state table is the same pending case.
      // ORPHAN_TRIP is only a missing Trip row when the state table exists.
      if (pending || tid === 0) {
        const toks = splitList(r.raw);
        if (toks.length > 0) c.skipped += toks.length;
        continue;
      }
      if (tid === null) {
        const toks = splitList(r.raw);
        if (await quarantineDryAware(exec, db, dryRun, runId, entity, legacyTrip, 'ORPHAN_TRIP', `Parent trip not migrated; ${toks.length} token(s) held.`, { tokens: toks })) {
          if (toks.length > 0) c.quarantined++;
        }
        continue;
      }
      const seen = new Set<string>();
      for (const tok of splitList(r.raw)) {
        if (seen.has(tok)) { if (await quarantineDryAware(exec, db, dryRun, runId, entity, legacyTrip, 'DUPLICATE', 'Duplicate user token inside one legacy row.', { user: tok })) c.quarantined++; continue; }
        seen.add(tok);
        if (!isUuid(tok)) { await quarantineDryAware(exec, db, dryRun, runId, entity, legacyTrip, 'MALFORMED_LIKE', 'Token is not a canonical UUID; never split by guessing.', { token: tok }); c.quarantined++; continue; }
        if (!(await userExists(exec, db, tok))) { if (await quarantineDryAware(exec, db, dryRun, runId, entity, legacyTrip, 'UNKNOWN_USER', 'UUID has no surviving user.', { user: tok })) c.quarantined++; continue; }
        const key = tok + '|||' + tid;
        const already = await lookupStateOrPending(exec, db, dryRun, entity, key);
        if (already !== null) { c.skipped++; continue; }
        if (dryRun) { c.migrated++; continue; }
        await exec.$executeRawUnsafe(
          `INSERT IGNORE INTO ${qtable(db, table)} (${qi('userId')}, ${qi('tripId')}) VALUES ('${esc(tok)}', ${tid})`,
        );
        const idRows = (await exec.$queryRawUnsafe(
          `SELECT ${qi('id')} AS id FROM ${qtable(db, table)} WHERE ${qi('userId')} = '${esc(tok)}' AND ${qi('tripId')} = ${tid} LIMIT 1`,
        )) as Array<{ id: number | bigint }>;
        await recordState(exec, db, entity, key, Number(idRows[0].id), runId);
        c.migrated++;
      }
    }
    return c;
  });
}

export const phaseLikes = (p: PrismaClient, db: string, r: number, d: boolean) =>
  normalizePair(p, db, r, d, 'Like', 'likes', 'likes');
export const phaseFavorites = (p: PrismaClient, db: string, r: number, d: boolean) =>
  normalizePair(p, db, r, d, 'Favorite', 'favorites', 'favorites');
export const phaseTripReports = (p: PrismaClient, db: string, r: number, d: boolean) =>
  normalizePair(p, db, r, d, 'TripReport', 'trip_reports', 'reportTrip');
