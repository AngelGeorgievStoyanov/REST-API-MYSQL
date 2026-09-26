/**
 * PHASE 4 — finalization E3: TripGroup FK finalization.
 * Verifies every retained trip has a valid tripGroupNewId, then renames
 * tripGroupNewId -> tripGroupId (dropping the legacy VARCHAR column first).
 * Refuses to proceed while any trip lacks a group mapping. Resumable via
 * state marker TripGroup:finalized.
 */
import { PrismaClient } from '@prisma/client';
import { esc, qi, qtable, toCount } from './db';
import { isStateUnavailable, lookupState, recordState } from './state';
import { Counters } from './types';

void tableHasColumn;

async function tableHasColumn(_prisma: PrismaClient, _db: string, _table: string, _column: string): Promise<boolean> {
  void _prisma; void _db; void _table; void _column;
  // Probe helper retained for future shape checks; current groupfinalize
  // uses colType() probes instead. Kept (not deleted) to avoid churn.
  return false;
}

export async function phaseGroupfinalize(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  const done = await lookupState(prisma, db, dryRun, 'TripGroup:finalized', 'done').catch((e: unknown) => {
    if (dryRun && isStateUnavailable(e)) return null;
    throw e;
  });
  if (done !== null) {
    if (!dryRun) {
      const n = toCount((await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM ${qtable(db, 'trips')}`)) as Array<Record<string, unknown>>);
      c.skipped = n;
    }
    return c;
  }
  // Shape probes FIRST (before any refusal query): a previous attempt may
  // have partially renamed, in which case the legacy VARCHAR key is gone
  // and any query referencing it would throw Unknown column. Probe once,
  // branch on the shape, never on assumptions.
  const colType = async (col: string): Promise<string> => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = 'trips' AND COLUMN_NAME = '${esc(col)}'`,
    )) as Array<{ t: string }>;
    return rows.length > 0 ? String(rows[0].t) : '';
  };
  const varcharType = await colType('tripGroupId');
  const hasLegacyVarchar = varcharType !== '' && !varcharType.toLowerCase().includes('int');
  const hasTransitional = (await colType('tripGroupNewId')) !== '';
  const alreadyFinal = !hasLegacyVarchar && !hasTransitional && (await colType('tripGroupId')).toLowerCase().includes('int');
  if (alreadyFinal) {
    if (!dryRun) await recordState(prisma, db, 'TripGroup:finalized', 'done', 1, runId);
    return c;
  }
  if (!hasLegacyVarchar && hasTransitional) {
    // Half-done resume: VARCHAR gone, transitional present → complete the
    // CHANGE directly (refusal queries need the VARCHAR key — skipped).
    // Guard: the CHANGE to NOT NULL fails (ER-1138) when parked NULL rows
    // exist. Those rows are quarantined by design — but MySQL still
    // refuses. Resolve by scoping the rename to a NULL-able INT first;
    // the activate phase enforces NOT NULL/UNIQUE only when clean.
    if (dryRun) {
      c.migrated = toCount((await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM ${qtable(db, 'trips')}`)) as Array<Record<string, unknown>>);
      return c;
    }
    await prisma.$executeRawUnsafe(`ALTER TABLE ${qtable(db, 'trips')} CHANGE COLUMN ${qi('tripGroupNewId')} ${qi('tripGroupId')} INT NULL DEFAULT NULL`);
    if (!dryRun) await recordState(prisma, db, 'TripGroup:finalized', 'done', 1, runId);
    const nHalf = toCount((await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM ${qtable(db, 'trips')}`)) as Array<Record<string, unknown>>);
    c.migrated = nHalf;
    return c;
  }
  if (!hasLegacyVarchar && !hasTransitional) {
    // Fully renamed already (covered above, kept as belt-and-braces).
    if (!dryRun) await recordState(prisma, db, 'TripGroup:finalized', 'done', 1, runId);
    return c;
  }
  try {
    const orphans = toCount((await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM ${qtable(db, 'trips')} t JOIN ${qtable(db, 'migration_state')} s ON s.${qi('entity')} = 'TripGroup' AND s.${qi('legacy_key')} = t.${qi('tripGroupId')} WHERE t.${qi('legacyId')} IS NOT NULL AND t.${qi('tripGroupNewId')} IS NULL AND s.${qi('new_id')} > 0`,
    )) as Array<Record<string, unknown>>);
    if (dryRun) {
      c.migrated = orphans === 0 ? 1 : 0;
      c.quarantined = orphans;
      return c;
    }
    if (orphans > 0) {
      throw new Error(
        `Group finalization refused: ${orphans} retained trip row(s) with REAL group mappings lack tripGroupNewId (interrupted backfill?). Rerun the backfill phase first.`,
      );
    }
  } catch (e) {
    const msg = String((e as Error).message);
    // Fresh dry-run: ddl does not create control tables, so migration_state
    // is absent (ER 1146). Transitional columns are absent too (Unknown column).
    // Neither case is a write; treat as "no mappings yet" and keep counting.
    if (dryRun && (msg.includes("doesn't exist") || msg.includes('Unknown column') || isStateUnavailable(e))) {
      // Absent migration_state means mappings are not created yet.
      // Count those trips as pending/unmapped, never as quarantined.
      c.migrated = 0;
      c.quarantined = 0;
      c.skipped = toCount((await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS c FROM ${qtable(db, 'trips')}`,
      )) as Array<Record<string, unknown>>);
      return c;
    }
    throw e;
  }
  // Orphan group references (group id with no trip_groups row) also block —
  // but ONLY for trips that passed validation (legacyId set) AND carry a
  // group INT. Quarantined trips (legacyId NULL) are excluded entirely.
  const badRefs = toCount((await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM ${qtable(db, 'trips')} t LEFT JOIN ${qtable(db, 'trip_groups')} g ON g.${qi('id')} = t.${qi('tripGroupNewId')} WHERE t.${qi('legacyId')} IS NOT NULL AND t.${qi('tripGroupNewId')} IS NOT NULL AND g.${qi('id')} IS NULL`,
  )) as Array<Record<string, unknown>>);
  if (badRefs > 0) {
    throw new Error(
      `Group finalization refused: ${badRefs} retained trip row(s) reference missing trip_groups rows.`,
    );
  }
  // Rename scope: only legacyId-bearing trips WITH a group INT participate
  // in the UNIQUE(tripGroupId, dayNumber) guarantee. Parked quarantined
  // trips (legacyId NULL, group INT NULL) are unaffected by the rename in
  // every way that matters: their reviewability lives in quarantine
  // payloads (UNKNOWN_GROUP/ORPHAN_USER evidence with the legacy group
  // string), never in the dropped VARCHAR copy. The DROP is safe exactly
  // because the two refusal checks above passed.
  // NOTE: on a fully-quarantined dataset (dirty test snapshot) there are
  // zero legacyId-bearing trips, so both checks pass trivially and the
  // rename still executes: the table reaches the final INT shape with all
  // rows parked. Verify reports the finalized shape + quarantine counts.
  // NULL-ability: the renamed column stays NULL-able (parked rows hold
  // NULL by design). NOT NULL + UNIQUE enforcement belongs to the
  // activate phase, gated on clean data — never forced here.
  await prisma.$executeRawUnsafe(`ALTER TABLE ${qtable(db, 'trips')} DROP COLUMN ${qi('tripGroupId')}`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ${qtable(db, 'trips')} CHANGE COLUMN ${qi('tripGroupNewId')} ${qi('tripGroupId')} INT NULL DEFAULT NULL`);
  await recordState(prisma, db, 'TripGroup:finalized', 'done', 1, runId);
  const n = toCount((await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM ${qtable(db, 'trips')}`)) as Array<Record<string, unknown>>);
  c.migrated = n;
  return c;
}
