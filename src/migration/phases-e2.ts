/**
 * Child FK backfill from migration_state after pkswap: points.tripId and
 * comments.targetId from the real Trip INT ids. Unresolvable parents
 * quarantine; only NULL-pointer rows are touched, so reruns converge.
 */
import { type PrismaClient } from '@prisma/client';
import { type DbExecutor, TARGET_TYPE, esc, inTx, legacyGroupColumn, legacyKeyColumn, parentPointerColumn, qi, qtable } from './db';
import { isStateUnavailable, lookupState, quarantineDryAware } from './state';
import { type Counters } from './types';

async function backfillChild(
  exec: DbExecutor, db: string, runId: number, dryRun: boolean,
  entity: 'Point' | 'Comment', childTable: 'points' | 'comments',
  legacyParentCol: '_ownerTripId' | '_tripId',
  parentIntCol: 'tripId' | 'targetId' = 'tripId',
  parentTypeId: number | null = null,
): Promise<Counters> {
  const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  // Activate drops the UUID parent pointer: afterwards the INT pointer is
  // the only reference, so there is nothing left to backfill.
  const parentCol = await parentPointerColumn(exec, db, childTable, legacyParentCol, parentIntCol);
  if (parentCol === '' || parentCol === parentIntCol) return c;
  const keyCol = (await legacyKeyColumn(exec, db, childTable)) || '_id';
  const tripKeyCol = (await legacyKeyColumn(exec, db, 'trips')) || '_id';
  let rows: Array<{ legacy: unknown; parent: unknown }>;
  try {
    rows = (await exec.$queryRawUnsafe(
      `SELECT ${qi(keyCol)} AS legacy, ${qi(parentCol)} AS parent FROM ${qtable(db, childTable)} WHERE ${qi(parentIntCol)} IS NULL`,
    )) as Array<{ legacy: unknown; parent: unknown }>;
  } catch (e) {
    // Dry-run before ddl: transitional columns missing — fall back to the
    // UUID PK so the report still counts pending backfills.
    if (!String((e as Error).message).includes('Unknown column')) throw e;
    rows = (await exec.$queryRawUnsafe(
      `SELECT ${qi('_id')} AS legacy, ${qi(parentCol)} AS parent FROM ${qtable(db, childTable)}`,
    )) as Array<{ legacy: unknown; parent: unknown }>;
  }
  for (const r of rows) {
    const legacy = String(r.legacy ?? '');
    // Quarantined child rows (legacyId NULL) never reach here; only
    // validated rows are backfilled.
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
        // Pre-ddl dry-run has no tripId filter: every child row is in scope,
        // so an empty parent pointer is pending, not an orphan trip UUID.
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
    // Comments also carry their polymorphic target type (2 = trip).
    const typeAssign = parentTypeId === null ? '' : `${qi('targetTypeId')} = ${parentTypeId}, `;
    await exec.$executeRawUnsafe(
      `UPDATE ${qtable(db, childTable)} SET ${qi('legacyId')} = '${esc(legacy)}', ${typeAssign}${qi(parentIntCol)} = ${tid} WHERE ${where}`,
    );
    c.migrated++;
  }
  return c;
}

export async function phaseBackfill(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  if (dryRun) {
    const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
    const c2 = await backfillChild(prisma, db, runId, true, 'Point', 'points', '_ownerTripId');
    const m = await backfillChild(prisma, db, runId, true, 'Comment', 'comments', '_tripId', 'targetId', TARGET_TYPE.trip);
    c.migrated = c2.migrated + m.migrated;
    c.quarantined = c2.quarantined + m.quarantined;
    return c;
  }
  // A fully-quarantined snapshot legitimately has nothing to backfill:
  // this phase succeeds with zeros, it must not fail the run.
  let out: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  await inTx(prisma, async (tx) => {
    const p = await backfillChild(tx, db, runId, false, 'Point', 'points', '_ownerTripId');
    const m = await backfillChild(tx, db, runId, false, 'Comment', 'comments', '_tripId', 'targetId', TARGET_TYPE.trip);
    out = { migrated: p.migrated + m.migrated, skipped: p.skipped + m.skipped, quarantined: p.quarantined + m.quarantined };
  });
  // TripGroup INT backfill: validated trips (legacyId set) parked with
  // tripGroupNewId=NULL because their group row does not exist yet. Resolve
  // via migration_state; still-missing groups stay parked (reported), never
  // guessed — groupfinalize only finalizes trips WITH a group INT. After
  // groupfinalize tripGroupNewId is gone, so skip instead of querying it.
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
