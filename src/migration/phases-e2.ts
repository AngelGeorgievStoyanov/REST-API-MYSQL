/**
 * PHASE 4 — finalization E2: child FK backfill from migration_state.
 * Runs AFTER pkswap. Backfills points.tripId, comments.tripId from the real
 * Trip INT ids. Unresolvable parents quarantine (never guessed).
 * Idempotent: only NULL tripId rows are touched; reruns converge.
 */
import { PrismaClient } from '@prisma/client';
import { DbExecutor, esc, inTx, legacyGroupColumn, legacyKeyColumn, parentPointerColumn, qi, qtable } from './db';
import { isStateUnavailable, lookupState, quarantineDryAware } from './state';
import { Counters } from './types';

async function backfillChild(
  exec: DbExecutor, db: string, runId: number, dryRun: boolean,
  entity: 'Point' | 'Comment', childTable: 'points' | 'comments',
  legacyParentCol: '_ownerTripId' | '_tripId',
): Promise<Counters> {
  const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  // Activate drops the UUID parent pointer. After that the INT tripId is the
  // only parent reference, so there is nothing left to backfill.
  const parentCol = await parentPointerColumn(exec, db, childTable, legacyParentCol);
  if (parentCol === '' || parentCol === 'tripId') return c;
  const keyCol = (await legacyKeyColumn(exec, db, childTable)) || '_id';
  const tripKeyCol = (await legacyKeyColumn(exec, db, 'trips')) || '_id';
  let rows: Array<{ legacy: unknown; parent: unknown }>;
  try {
    rows = (await exec.$queryRawUnsafe(
      `SELECT ${qi(keyCol)} AS legacy, ${qi(parentCol)} AS parent FROM ${qtable(db, childTable)} WHERE ${qi('tripId')} IS NULL`,
    )) as Array<{ legacy: unknown; parent: unknown }>;
  } catch (e) {
    // Dry-run before ddl: transitional columns do not exist yet. Fall back
    // to the live UUID PK so the report still counts pending backfills.
    if (!String((e as Error).message).includes('Unknown column')) throw e;
    rows = (await exec.$queryRawUnsafe(
      `SELECT ${qi('_id')} AS legacy, ${qi(parentCol)} AS parent FROM ${qtable(db, childTable)}`,
    )) as Array<{ legacy: unknown; parent: unknown }>;
  }
  for (const r of rows) {
    const legacy = String(r.legacy ?? '');
    // Quarantined child rows (legacyId NULL) never reach here: the query
    // above filters them out. Only validated rows are backfilled.
    const parent = r.parent === null || r.parent === undefined ? '' : String(r.parent);
    let tid: number | null = null;
    let pending = false;
    try {
      tid = await lookupState(exec, db, dryRun, 'Trip', parent);
    } catch (e) {
      if (!isStateUnavailable(e)) throw e;
      // INT mapping will be written after ddl/pkswap. Not an orphan.
      pending = true;
    }
    if (!pending && (tid === null || tid === 0)) {
      const parentRows = parent.trim() === '' ? [] : (await exec.$queryRawUnsafe(
        `SELECT 1 AS ok FROM ${qtable(db, 'trips')} WHERE ${qi(tripKeyCol)} = '${esc(parent)}' LIMIT 1`,
      )) as Array<{ ok: number }>;
      if (parentRows.length > 0 && tid === 0) {
        pending = true;
      } else if (dryRun && parent.trim() === '') {
        // Pre-ddl dry-run has no tripId filter, so every child row is in
        // scope. An empty parent pointer is not an orphan trip UUID.
        pending = true;
      } else {
        await quarantineDryAware(exec, db, dryRun, runId, entity, legacy, 'ORPHAN_TRIP', 'Parent trip has no INT id mapping; held for review.', { trip: parent });
        c.quarantined++;
        continue;
      }
    }
    if (dryRun || pending) { c.migrated++; continue; }
    const where = keyCol === 'legacyId'
      ? `${qi('legacyId')} = '${esc(legacy)}'`
      : `${qi(keyCol)} = '${esc(legacy)}'`;
    await exec.$executeRawUnsafe(
      `UPDATE ${qtable(db, childTable)} SET ${qi('legacyId')} = '${esc(legacy)}', ${qi('tripId')} = ${tid} WHERE ${where}`,
    );
    c.migrated++;
  }
  return c;
}

export async function phaseBackfill(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  if (dryRun) {
    const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
    const p = await backfillChild(prisma, db, runId, true, 'Point', 'points', '_ownerTripId');
    const m = await backfillChild(prisma, db, runId, true, 'Comment', 'comments', '_tripId');
    c.migrated = p.migrated + m.migrated;
    c.quarantined = p.quarantined + m.quarantined;
    return c;
  }
  // NOTE: on the dirty test snapshot every point/comment is quarantined
  // (orphan owners), so there is legitimately nothing to backfill. The
  // child-FK columns stay NULL and groupfinalize/replay handle the rest.
  // This phase therefore succeeds with zeros — it must NOT fail the run.
  let out: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  await inTx(prisma, async (tx) => {
    const p = await backfillChild(tx, db, runId, false, 'Point', 'points', '_ownerTripId');
    const m = await backfillChild(tx, db, runId, false, 'Comment', 'comments', '_tripId');
    out = { migrated: p.migrated + m.migrated, skipped: p.skipped + m.skipped, quarantined: p.quarantined + m.quarantined };
  });
  // TripGroup INT backfill: trips that PASSED validation (legacyId set) but
  // were parked with tripGroupNewId=NULL because their TripGroup row does
  // not exist yet (orphan-owner groups are quarantined at the group level
  // and never get rows). Resolve via migration_state; trips whose group is
  // still missing stay parked (NULL) and are reported — they do NOT block
  // groupfinalize, because groupfinalize only finalizes trips WITH a group
  // INT and leaves parked trips for quarantine review. Never guessed.
  // After groupfinalize tripGroupNewId is gone. Skip rather than query it.
  const groupCol = await legacyGroupColumn(prisma, db);
  const stillTransitional = (
    (await prisma.$queryRawUnsafe(
      `SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = 'trips' AND COLUMN_NAME = 'tripGroupNewId' LIMIT 1`,
    )) as Array<{ ok: number }>
  ).length > 0;
  if (groupCol && stillTransitional) await inTx(prisma, async (tx) => {
    const pending = (await tx.$queryRawUnsafe(
      `SELECT ${qi('legacyId')} AS legacy, ${qi(groupCol)} AS g FROM ${qtable(db, 'trips')} WHERE ${qi('legacyId')} IS NOT NULL AND ${qi('tripGroupNewId')} IS NULL`,
    )) as Array<{ legacy: unknown; g: unknown }>;
    for (const r of pending) {
      const legacy = String(r.legacy ?? '');
      const g = r.g === null || r.g === undefined ? '' : String(r.g);
      const gid = await lookupState(tx, db, false, 'TripGroup', g);
      if (gid === null || gid === 0) continue; // stays quarantined/pending
      await tx.$executeRawUnsafe(
        `UPDATE ${qtable(db, 'trips')} SET ${qi('tripGroupNewId')} = ${gid} WHERE ${qi('legacyId')} = '${esc(legacy)}'`,
      );
      out.migrated++;
    }
  });
  return out;
}
