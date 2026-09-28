/**
 * TripGroup FK finalization: verify every retained trip has a group mapping,
 * then rename tripGroupNewId -> tripGroupId (dropping the legacy VARCHAR
 * first). Refuses while any trip lacks a mapping; resumable via the
 * TripGroup:finalized state marker.
 */
import { PrismaClient } from '@prisma/client';
import { esc, qi, qtable, toCount } from './db';
import { isStateUnavailable, lookupState, recordState } from './state';
import { Counters } from './types';

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
  // Shape probes first: a previous attempt may have half-renamed, so the
  // legacy VARCHAR key can be gone — probe once, branch on the shape.
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
    // Half-done resume: complete the CHANGE directly. NOT NULL would fail
    // (ER-1138) on parked NULL rows, so the rename stays NULL-able;
    // activate enforces NOT NULL/UNIQUE only when clean.
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
    // Fresh dry-run: no control tables (ER 1146) and no transitional
    // columns yet — treat as "no mappings yet": count trips as pending,
    // never quarantined.
    if (dryRun && (msg.includes("doesn't exist") || msg.includes('Unknown column') || isStateUnavailable(e))) {
      c.migrated = 0;
      c.quarantined = 0;
      c.skipped = toCount((await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS c FROM ${qtable(db, 'trips')}`,
      )) as Array<Record<string, unknown>>);
      return c;
    }
    throw e;
  }
  // Orphan group refs also block — but only for validated trips (legacyId
  // set) that carry a group INT; quarantined trips are excluded entirely.
  const badRefs = toCount((await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM ${qtable(db, 'trips')} t LEFT JOIN ${qtable(db, 'trip_groups')} g ON g.${qi('id')} = t.${qi('tripGroupNewId')} WHERE t.${qi('legacyId')} IS NOT NULL AND t.${qi('tripGroupNewId')} IS NOT NULL AND g.${qi('id')} IS NULL`,
  )) as Array<Record<string, unknown>>);
  if (badRefs > 0) {
    throw new Error(
      `Group finalization refused: ${badRefs} retained trip row(s) reference missing trip_groups rows.`,
    );
  }
  // Rename scope: only legacyId-bearing trips WITH a group INT join the
  // UNIQUE(tripGroupId, dayNumber) guarantee; parked trips keep their
  // evidence in quarantine payloads, not the dropped VARCHAR copy. The
  // column stays NULL-able: NOT NULL + UNIQUE belong to activate, gated on
  // clean data. A fully-quarantined dataset passes both checks trivially
  // and still reaches the final INT shape.
  await prisma.$executeRawUnsafe(`ALTER TABLE ${qtable(db, 'trips')} DROP COLUMN ${qi('tripGroupId')}`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ${qtable(db, 'trips')} CHANGE COLUMN ${qi('tripGroupNewId')} ${qi('tripGroupId')} INT NULL DEFAULT NULL`);
  await recordState(prisma, db, 'TripGroup:finalized', 'done', 1, runId);
  const n = toCount((await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM ${qtable(db, 'trips')}`)) as Array<Record<string, unknown>>);
  c.migrated = n;
  return c;
}
