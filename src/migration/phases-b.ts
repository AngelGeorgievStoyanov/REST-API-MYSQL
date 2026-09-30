import { PrismaClient } from '@prisma/client';
import {
  DbExecutor,
  backfillTimestamps,
  columnExists,
  esc,
  inTx,
  isUuid,
  keepOrFill,
  legacyGroupColumn,
  legacyKeyColumn,
  ownerColumn,
  parentPointerColumn,
  qi,
  qtable,
  timestampFallback,
} from './db';
import { isStateUnavailable, lookupState, lookupStateOrPending, quarantineDryAware, recordState } from './state';
import { Counters } from './types';
import { TARGET_TYPE, userExistsById } from './db';

async function userExists(exec: DbExecutor, db: string, id: string): Promise<boolean> {
  return userExistsById(exec, db, id);
}

async function runBody(
  prisma: PrismaClient,
  db: string,
  dryRun: boolean,
  apply: (exec: DbExecutor) => Promise<Counters>,
): Promise<Counters> {
  if (dryRun) return apply(prisma);
  let out: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  await inTx(prisma, async (tx) => {
    out = await apply(tx);
  });
  return out;
}

function cell(row: Record<string, unknown>, column: string): string {
  if (!column) return '';
  const v = row[column];
  return v === null || v === undefined ? '' : String(v);
}

export async function phaseTrips(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  // Resolve once outside the transaction: MySQL DDL is not transactional,
  // so the shape cannot change mid-phase.
  const keyCol = (await legacyKeyColumn(prisma, db, 'trips')) || '_id';
  const ownerCol = (await ownerColumn(prisma, db, 'trips')) || '_ownerId';
  const groupCol = await legacyGroupColumn(prisma, db);
  const swapped = keyCol !== '_id';
  // Before groupfinalize the INT lives in tripGroupNewId; after the rename
  // (or on a half-renamed table) it lives in tripGroupId.
  const groupIntCol = groupCol === 'tripGroupId' ? 'tripGroupNewId' : 'tripGroupId';
  const groupIntPresent = (
    (await prisma.$queryRawUnsafe(
      `SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = 'trips' AND COLUMN_NAME = '${esc(groupIntCol)}' LIMIT 1`,
    )) as Array<{ ok: number }>
  ).length > 0;
  const rows = (await prisma.$queryRawUnsafe(`SELECT * FROM ${qtable(db, 'trips')}`)) as Array<Record<string, unknown>>;
  return runBody(prisma, db, dryRun, async (exec) => {
    const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
    const seenDay = new Set<string>();
    const existingPairs = new Set<string>();
    if (!dryRun && groupIntPresent) {
      const done = (await exec.$queryRawUnsafe(
        `SELECT ${qi(groupIntCol)} AS g, ${qi('dayNumber')} AS d FROM ${qtable(db, 'trips')} WHERE ${qi(groupIntCol)} IS NOT NULL AND ${qi('legacyId')} IS NOT NULL`,
      )) as Array<{ g: unknown; d: unknown }>;
      for (const r of done) existingPairs.add(String(r.g) + '|||' + String(r.d));
    }
    for (const r of rows) {
      const legacy = cell(r, keyCol);
      if (!isUuid(legacy)) { if (await quarantineDryAware(exec, db, dryRun, runId, 'Trip', legacy, 'INVALID_UUID', 'Trip legacy key is not a canonical UUID.', { key: legacy })) c.quarantined++; continue; }
      const already = await lookupStateOrPending(exec, db, dryRun, 'Trip', legacy);
      if (already !== null && already !== 0) { c.skipped++; continue; }
      // A 0 placeholder means a previous attempt parked this trip: re-validate
      // from scratch instead of trusting it (a 0 can only come from the pkswap
      // placeholder-delete path on resume).
      const owner = cell(r, ownerCol);
      const ownerOk = isUuid(owner) && (await userExists(exec, db, owner));
      // Structural checks run before the owner check so the quarantine evidence
      // names the structural problem; owner orphans are still quarantined below.
      const g = groupCol ? cell(r, groupCol) : '';
      if (!groupCol) {
        if (await quarantineDryAware(exec, db, dryRun, runId, 'Trip', legacy, 'INVALID_GROUP', 'Legacy tripGroupId already finalized; cannot re-derive the group UUID.', {})) c.quarantined++;
        continue;
      }
      if (g.trim() === '') { if (await quarantineDryAware(exec, db, dryRun, runId, 'Trip', legacy, 'INVALID_GROUP', 'NULL/empty legacy tripGroupId.', {})) c.quarantined++; continue; }
      let gid: number | null;
      let groupPending = false;
      try {
        gid = await lookupState(exec, db, dryRun, 'TripGroup', g);
      } catch (e) {
        if (!isStateUnavailable(e)) throw e;
        // Valid group UUID, INT mapping not created yet (dry-run, no state table).
        gid = null;
        groupPending = true;
      }
      // A real block is only a persisted unmigratable group (new_id=0) or a
      // missing TripGroup row when migration_state exists; pending mappings
      // are not UNKNOWN_GROUP.
      const groupBlocked = !groupPending && (gid === null || gid === 0);
      if (groupBlocked) { if (await quarantineDryAware(exec, db, dryRun, runId, 'Trip', legacy, 'UNKNOWN_GROUP', 'Legacy group was quarantined or not migrated yet.', { group: g })) c.quarantined++; }
      const day = r['dayNumber'];
      const dayOk = day !== null && day !== undefined && Number.isInteger(Number(day)) && Number(day) >= 0;
      if (!dayOk) {
        if (await quarantineDryAware(exec, db, dryRun, runId, 'Trip', legacy, 'INVALID_DAY_NUMBER', 'dayNumber is NULL/invalid; no value invented.', { dayNumber: day })) c.quarantined++; continue;
      }
      if (!ownerOk) {
        if (await quarantineDryAware(exec, db, dryRun, runId, 'Trip', legacy, 'ORPHAN_USER', 'Trip owner is not a surviving user; owner not invented.', { owner })) c.quarantined++; continue;
      }
      // Legacy dates win; a missing/blank one becomes the write clock, and
      // updatedAt falls back to createdAt before the clock (never NULL).
      const { createdAt, updatedAt } = timestampFallback(r['timeCreated'], r['timeEdited']);
      // Parked WITH identity: legacyId + Trip state row (new_id=0),
      // tripGroupNewId stays NULL. pkswap assigns the real INT id;
      // groupfinalize excludes NULL-group rows from scope.
      if (groupBlocked || groupPending) {
        if (dryRun || !groupIntPresent || groupPending) { c.migrated++; continue; }
        // legacyId is set NOW (first write for this row); group INT stays NULL.
        await exec.$executeRawUnsafe(
          `UPDATE ${qtable(db, 'trips')} SET ${qi('legacyId')} = '${esc(legacy)}', ` +
          `${qi(groupIntCol)} = NULL, ${qi('dayNumber')} = ${Number(day)}, ` +
          `${keepOrFill('createdAt', createdAt)}, ${keepOrFill('updatedAt', updatedAt)} ` +
          `WHERE ${swapped ? `${qi('legacyId')} = '${esc(legacy)}'` : `${qi('_id')} = '${esc(legacy)}' AND ${qi('legacyId')} IS NULL`}`,
        );
        await recordState(exec, db, 'Trip', legacy, 0, runId);
        c.migrated++;
        continue;
      }
      const pair = gid + '|||' + Number(day);
      if (seenDay.has(pair) || existingPairs.has(pair)) {
        if (await quarantineDryAware(exec, db, dryRun, runId, 'Trip', legacy, 'DUPLICATE', 'Duplicate (tripGroupId, dayNumber) blocks the UNIQUE constraint.', { group: g, dayNumber: day })) c.quarantined++; continue;
      }
      seenDay.add(pair);
      if (dryRun || !groupIntPresent) { c.migrated++; continue; }
      // Quarantined trips `continue` above before ANY write: no legacyId,
      // no tripGroupNewId, no state row — pkswap only sees legacyId-bearing rows.
      await exec.$executeRawUnsafe(
        `UPDATE ${qtable(db, 'trips')} SET ${qi('legacyId')} = '${esc(legacy)}', ` +
        `${qi(groupIntCol)} = ${gid}, ${qi('dayNumber')} = ${Number(day)}, ` +
        `${keepOrFill('createdAt', createdAt)}, ${keepOrFill('updatedAt', updatedAt)} ` +
        `WHERE ${swapped ? `${qi('legacyId')} = '${esc(legacy)}'` : `${qi('_id')} = '${esc(legacy)}'`}`,
      );
      // trips keeps its UUID `_id` PK until pkswap; migration_state records
      // the intent (new_id=0) so child phases can resume. gid is real here
      // (0 returns at the UNKNOWN_GROUP check), so tripGroupNewId is always
      // set for validated trips.
      await recordState(exec, db, 'Trip', legacy, 0, runId);
      // Child phases cannot resolve a Trip INT id pre-PK-swap, so they
      // quarantine as ORPHAN_TRIP until pkswap assigns real ids.
      c.migrated++;
    }
    // Trips already mapped by an earlier (pre-fallback) run are skipped by the
    // state guard above, so their NULL timestamps need a repair pass. It is
    // scoped to rows the migration owns (legacyId); quarantined trips are never
    // written by design and keep the NULL marker for review.
    if (!dryRun && (await columnExists(exec, db, 'trips', 'legacyId'))) {
      await backfillTimestamps(exec, db, 'trips', { updatedAt: true, where: `${qi('legacyId')} IS NOT NULL` });
    }
    return c;
  });
}

async function phaseChild(
  prisma: PrismaClient,
  db: string,
  runId: number,
  dryRun: boolean,
  entity: 'Point' | 'Comment',
  table: 'points' | 'comments',
  legacyParent: '_ownerTripId' | '_tripId',
  parentIntCol: 'tripId' | 'targetId' = 'tripId',
  parentTypeId: number | null = null,
): Promise<Counters> {
  const keyCol = (await legacyKeyColumn(prisma, db, table)) || '_id';
  const ownerCol = (await ownerColumn(prisma, db, table)) || '_ownerId';
  const parentCol = (await parentPointerColumn(prisma, db, table, legacyParent, parentIntCol)) || legacyParent;
  const swapped = keyCol !== '_id';
  const parentIntPresent = (
    (await prisma.$queryRawUnsafe(
      `SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = '${esc(table)}' AND COLUMN_NAME = '${esc(parentIntCol)}' LIMIT 1`,
    )) as Array<{ ok: number }>
  ).length > 0;
  const rows = (await prisma.$queryRawUnsafe(`SELECT * FROM ${qtable(db, table)}`)) as Array<Record<string, unknown>>;
  return runBody(prisma, db, dryRun, async (exec) => {
    const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
    for (const r of rows) {
      const legacy = cell(r, keyCol);
      if (!isUuid(legacy)) {
        if (await quarantineDryAware(exec, db, dryRun, runId, entity, legacy, 'INVALID_UUID', `${entity} legacy key is not a canonical UUID.`, { key: legacy })) c.quarantined++;
        continue;
      }
      const already = await lookupStateOrPending(exec, db, dryRun, entity, legacy);
      if (already !== null && already !== 0) { c.skipped++; continue; }
      const owner = cell(r, ownerCol);
      if (!isUuid(owner) || !(await userExists(exec, db, owner))) {
        if (await quarantineDryAware(exec, db, dryRun, runId, entity, legacy, 'ORPHAN_USER', `${entity} owner is not a surviving user.`, { owner })) c.quarantined++;
        continue;
      }
      const rawParent = cell(r, parentCol);
      // Post-activate the UUID pointer is gone; the final INT pointer holds
      // the resolved parent id.
      const parentIsInt = parentCol === parentIntCol && rawParent !== '' && Number.isInteger(Number(rawParent));
      if (!parentIsInt && !isUuid(rawParent)) {
        if (await quarantineDryAware(exec, db, dryRun, runId, entity, legacy, 'INVALID_TRIP', `${entity} parent trip pointer is not a canonical trip UUID.`, { trip: rawParent })) c.quarantined++;
        continue;
      }
      let tid: number | null = null;
      let tripPending = false;
      if (parentIsInt) {
        tid = Number(rawParent);
      } else {
        const tripKeyCol = (await legacyKeyColumn(exec, db, 'trips')) || '_id';
        const parentRows = (await exec.$queryRawUnsafe(
          `SELECT 1 AS ok FROM ${qtable(db, 'trips')} WHERE ${qi(tripKeyCol)} = '${esc(rawParent)}' LIMIT 1`,
        )) as Array<{ ok: number }>;
        if (parentRows.length === 0) {
          if (await quarantineDryAware(exec, db, dryRun, runId, entity, legacy, 'ORPHAN_TRIP', 'Referenced trip UUID does not exist.', { trip: rawParent })) c.quarantined++;
          continue;
        }
        try {
          tid = await lookupState(exec, db, dryRun, 'Trip', rawParent);
        } catch (e) {
          if (!isStateUnavailable(e)) throw e;
          tripPending = true;
        }
      }
      // Parent UUID exists but INT id is not assigned yet (no state table, or
      // new_id=0 placeholder before PK-swap): pending, not orphan. A missing
      // Trip state row when the table exists is a real quarantine.
      if (!tripPending && (tid === null || tid === 0)) {
        if (tid === null) {
          if (await quarantineDryAware(exec, db, dryRun, runId, entity, legacy, 'ORPHAN_TRIP', 'Referenced trip was quarantined or not migrated yet.', { trip: rawParent })) c.quarantined++;
          continue;
        }
        tripPending = true;
      }
      // Legacy dates win; a missing/blank one becomes the write clock for BOTH
      // children (comments used to stay NULL), updatedAt falling back to
      // createdAt first. timestampForWrite() rejects Date objects, so the clock
      // is passed as ISO text.
      const { createdAt, updatedAt } = timestampFallback(r['timeCreated'], r['timeEdited']);
      if (dryRun) { c.migrated++; continue; }
      if (!parentIntPresent) {
        throw new Error(`${table}.${parentIntCol} column missing; re-run the ddl phase before migrating ${entity}.`);
      }
      // legacyId is written even when the parent INT is still the 0
      // placeholder, so pkswap can assign this row's own id; the parent
      // pointer stays NULL until backfill. Comments carry targetTypeId
      // (2 = trip) in the same write; points have no target type.
      const parentAssign = tripPending
        ? ''
        : (parentTypeId === null
          ? `${qi(parentIntCol)} = ${tid}, `
          : `${qi('targetTypeId')} = ${parentTypeId}, ${qi(parentIntCol)} = ${tid}, `);
      const where = swapped ? `${qi('legacyId')} = '${esc(legacy)}'` : `${qi('_id')} = '${esc(legacy)}'`;
      await exec.$executeRawUnsafe(
        `UPDATE ${qtable(db, table)} SET ${qi('legacyId')} = '${esc(legacy)}', ` +
        `${parentAssign}` +
        `${keepOrFill('createdAt', createdAt)}, ${keepOrFill('updatedAt', updatedAt)} ` +
        `WHERE ${where}`,
      );
      await recordState(exec, db, entity, legacy, swapped ? (already ?? 0) : 0, runId);
      c.migrated++;
    }
    // Same repair as trips: rows mapped by an earlier run are skipped by the
    // state guard, so only their NULL timestamps are filled, and only for rows
    // the migration owns (legacyId).
    if (!dryRun && (await columnExists(exec, db, table, 'legacyId'))) {
      await backfillTimestamps(exec, db, table, { updatedAt: true, where: `${qi('legacyId')} IS NOT NULL` });
    }
    return c;
  });
}

export const phasePoints = (p: PrismaClient, db: string, r: number, d: boolean) =>
  phaseChild(p, db, r, d, 'Point', 'points', '_ownerTripId');

// Comments are polymorphic: the legacy trip pointer lands in `targetId` with
// `targetTypeId = 2` (trip); there is no comments.tripId.
export const phaseComments = (p: PrismaClient, db: string, r: number, d: boolean) =>
  phaseChild(p, db, r, d, 'Comment', 'comments', '_tripId', 'targetId', TARGET_TYPE.trip);
