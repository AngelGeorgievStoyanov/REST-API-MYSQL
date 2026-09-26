/**
 * PHASE 4 — per-phase data migration, part B (trips, points, comments).
 * New INT ids are assigned by altering the live `_id` column mapping:
 * legacy UUID is copied to `legacyId`, the child `tripId`/`tripGroupNewId`
 * INT columns are backfilled from migration_state, timestamps parsed.
 */
import { PrismaClient } from '@prisma/client';
import {
  DbExecutor,
  esc,
  inTx,
  isUuid,
  legacyGroupColumn,
  legacyKeyColumn,
  ownerColumn,
  parentPointerColumn,
  qi,
  qtable,
  timestampForWrite,
} from './db';
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
  // Resolve once, outside the per-row transaction: DDL is not transactional
  // in MySQL, so the shape cannot change mid-phase.
  const keyCol = (await legacyKeyColumn(prisma, db, 'trips')) || '_id';
  const ownerCol = (await ownerColumn(prisma, db, 'trips')) || '_ownerId';
  const groupCol = await legacyGroupColumn(prisma, db);
  const swapped = keyCol !== '_id';
  // Before groupfinalize the INT lives in tripGroupNewId. After the rename
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
      // A 0 placeholder means a previous attempt parked this trip (group or
      // day not yet resolvable). Re-validate from scratch: fall through and
      // re-run every check below instead of trusting the placeholder.
      // NOTE: the refactored trips phase never WRITES 0 placeholders
      // (quarantined trips `continue` before any recordState). A 0 can only
      // come from the pkswap placeholder-delete path on resume.
      const owner = cell(r, ownerCol);
      const ownerOk = isUuid(owner) && (await userExists(exec, db, owner));
      // Structural checks (group/day) run BEFORE the owner check so the
      // quarantine evidence names the structural problem. Owner orphans
      // are still quarantined below — nothing is skipped.
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
      // missing TripGroup row when migration_state exists. Pending mappings
      // are not UNKNOWN_GROUP and must not be quarantined.
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
      // A trip that fails group resolution is parked WITH identity: it gets
      // legacyId + Trip state row (new_id=0 placeholder) but tripGroupNewId
      // stays NULL. pkswap assigns it a real INT id (identity ≠ relations);
      // groupfinalize excludes NULL-group rows from scope.
      if (groupBlocked || groupPending) {
        if (dryRun || !groupIntPresent || groupPending) { c.migrated++; continue; }
        // Parked WITH identity: legacyId is set NOW (it was NULL before —
        // this is the first write for this row), group INT stays NULL.
        await exec.$executeRawUnsafe(
          `UPDATE ${qtable(db, 'trips')} SET ${qi('legacyId')} = '${esc(legacy)}', ` +
          `${qi(groupIntCol)} = NULL, ${qi('dayNumber')} = ${Number(day)}, ` +
          `${qi('createdAt')} = ${timestampForWrite(r['timeCreated']) ? `'${timestampForWrite(r['timeCreated'])}'` : 'NULL'}, ${qi('updatedAt')} = ${timestampForWrite(r['timeEdited']) ? `'${timestampForWrite(r['timeEdited'])}'` : 'NULL'} ` +
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
      const created = timestampForWrite(r['timeCreated']);
      const updated = timestampForWrite(r['timeEdited']);
      if (dryRun || !groupIntPresent) { c.migrated++; continue; }
      // Quarantined trips (orphan owner / invalid day / unknown group)
      // `continue`d above before ANY write: no legacyId, no tripGroupNewId,
      // no state row. pkswap only sees legacyId-bearing rows.
      await exec.$executeRawUnsafe(
        `UPDATE ${qtable(db, 'trips')} SET ${qi('legacyId')} = '${esc(legacy)}', ` +
        `${qi(groupIntCol)} = ${gid}, ${qi('dayNumber')} = ${Number(day)}, ` +
        `${qi('createdAt')} = ${created ? `'${created}'` : 'NULL'}, ${qi('updatedAt')} = ${updated ? `'${updated}'` : 'NULL'} ` +
        `WHERE ${swapped ? `${qi('legacyId')} = '${esc(legacy)}'` : `${qi('_id')} = '${esc(legacy)}'`}`,
      );
      // trips keeps its UUID `_id` PK for now (app still runs on it); the
      // INT `id` column does not exist yet — PK swap is a later step.
      // migration_state records the mapping intent (new_id=0 placeholder)
      // so child phases can detect that the trip was processed and resume.
      // NOTE: reaching here means gid is a REAL group id (gid===0 returns
      // at the UNKNOWN_GROUP check above), so tripGroupNewId is always set
      // for validated trips; groupfinalize scope = legacyId-bearing rows.
      await recordState(exec, db, 'Trip', legacy, 0, runId);
      // Child phases (points/comments/likes/...) cannot resolve a real Trip
      // INT id yet (no INT `id` column exists pre-PK-swap), so they
      // deterministically quarantine as ORPHAN_TRIP until the PK-swap step
      // assigns real INT ids and repoints the state mapping.
      c.migrated++;
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
): Promise<Counters> {
  const keyCol = (await legacyKeyColumn(prisma, db, table)) || '_id';
  const ownerCol = (await ownerColumn(prisma, db, table)) || '_ownerId';
  const parentCol = (await parentPointerColumn(prisma, db, table, legacyParent)) || legacyParent;
  const swapped = keyCol !== '_id';
  const tripIdPresent = (
    (await prisma.$queryRawUnsafe(
      `SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = '${esc(table)}' AND COLUMN_NAME = 'tripId' LIMIT 1`,
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
      // Post-activate the UUID pointer is gone and tripId is the INT.
      const parentIsInt = parentCol === 'tripId' && rawParent !== '' && Number.isInteger(Number(rawParent));
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
      // new_id=0 placeholder before PK-swap). That is pending, not an orphan.
      // A missing Trip state row when the table exists is a real quarantine.
      if (!tripPending && (tid === null || tid === 0)) {
        if (tid === null) {
          if (await quarantineDryAware(exec, db, dryRun, runId, entity, legacy, 'ORPHAN_TRIP', 'Referenced trip was quarantined or not migrated yet.', { trip: rawParent })) c.quarantined++;
          continue;
        }
        tripPending = true;
      }
      // Point-only: a missing legacy date is the write clock, not NULL.
      // One instant per row, so both columns match when both inputs are missing.
      // Passed as ISO text: timestampForWrite() does not accept a Date object.
      const missingPointStamp = entity === 'Point'
        ? timestampForWrite(new Date().toISOString())
        : '';
      const created = timestampForWrite(r['timeCreated']) || missingPointStamp;
      const updated = timestampForWrite(r['timeEdited']) || missingPointStamp;
      // Dry-run only reports the row that the live UPDATE below would write.
      if (dryRun) { c.migrated++; continue; }
      if (!tripIdPresent) {
        throw new Error(`${table}.tripId column missing; re-run the ddl phase before migrating ${entity}.`);
      }
      // Parent INT may still be the pre-pkswap 0 placeholder. Write legacyId
      // anyway so pkswap can assign this row's own INT id. Leave tripId NULL
      // only in that case; backfill sets it once the Trip mapping is real.
      // When the Trip INT already exists, tripId is written in this same
      // statement — never counted as migrated without the write.
      const tripAssign = tripPending ? '' : `${qi('tripId')} = ${tid}, `;
      const where = swapped ? `${qi('legacyId')} = '${esc(legacy)}'` : `${qi('_id')} = '${esc(legacy)}'`;
      await exec.$executeRawUnsafe(
        `UPDATE ${qtable(db, table)} SET ${qi('legacyId')} = '${esc(legacy)}', ` +
        `${tripAssign}` +
        `${qi('createdAt')} = ${created ? `'${created}'` : 'NULL'}, ${qi('updatedAt')} = ${updated ? `'${updated}'` : 'NULL'} ` +
        `WHERE ${where}`,
      );
      await recordState(exec, db, entity, legacy, swapped ? (already ?? 0) : 0, runId);
      c.migrated++;
    }
    return c;
  });
}

export const phasePoints = (p: PrismaClient, db: string, r: number, d: boolean) =>
  phaseChild(p, db, r, d, 'Point', 'points', '_ownerTripId');

export const phaseComments = (p: PrismaClient, db: string, r: number, d: boolean) =>
  phaseChild(p, db, r, d, 'Comment', 'comments', '_tripId');
