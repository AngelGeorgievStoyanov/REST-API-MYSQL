/**
 * Images from trips/points/users. Exact filenames preserved; `_thumb.webp`
 * is a GCS sidecar of the stored base filename and gets no row of its own.
 */
import { PrismaClient } from '@prisma/client';
import { DbExecutor, columnExists, esc, inTx, qi, qtable, splitList, userExistsById, userKeyColumn } from './db';
import { isStateUnavailable, lookupState, lookupStateOrPending, quarantineDryAware, recordState } from './state';
import { Counters } from './types';

async function runImages(exec: DbExecutor, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  // Post-pkswap trips/points have no `_id`: resolve via legacyId (probed once per table).
  const hasUuid = async (table: string): Promise<boolean> =>
    (
      (await exec.$queryRawUnsafe(
        `SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${esc(db)}' AND TABLE_NAME = '${esc(table)}' AND COLUMN_NAME = '_id' LIMIT 1`,
      )) as Array<{ ok: number }>
    ).length > 0;
  const tripsIdExpr = (await hasUuid('trips')) ? qi('_id') : qi('legacyId');
  const pointsIdExpr = (await hasUuid('points')) ? qi('_id') : qi('legacyId');
  // Legacy image columns are dropped by a completed migration: a rerun then
  // has nothing left to migrate.
  const tripsImageCol = await columnExists(exec, db, 'trips', 'imageFile');
  const pointsImageCol = await columnExists(exec, db, 'points', 'imageFile');
  const usersImageCol = await columnExists(exec, db, 'users', 'imageFile');
  {
    const tripRows = tripsImageCol ? ((await exec.$queryRawUnsafe(
      `SELECT ${tripsIdExpr} AS legacy, ${qi('imageFile')} AS raw FROM ${qtable(db, 'trips')}`,
    )) as Array<{ legacy: unknown; raw: unknown }>) : [];
    for (const r of tripRows) {
      const legacy = String(r.legacy ?? '');
      let tid: number | null = null;
      let pending = false;
      try {
        tid = await lookupState(exec, db, dryRun, 'Trip', legacy);
      } catch (e) {
        if (!isStateUnavailable(e)) throw e;
        pending = true;
      }
      if (pending || tid === 0) {
        const toks = splitList(r.raw);
        if (toks.length > 0) c.skipped += toks.length;
        continue;
      }
      if (tid === null) {
        const toks = splitList(r.raw);
        if (await quarantineDryAware(exec, db, dryRun, runId, 'Image', legacy, 'ORPHAN_TRIP', `Trip not migrated; ${toks.length} filename(s) held.`, { files: toks })) {
          if (toks.length > 0) c.quarantined++;
        }
        continue;
      }
      for (const f of splitList(r.raw)) {
        const key = 'trip:' + tid + ':' + f;
        const already = await lookupStateOrPending(exec, db, dryRun, 'Image', key);
        if (already !== null) { c.skipped++; continue; }
        if (dryRun) { c.migrated++; continue; }
        await exec.$executeRawUnsafe(
          `INSERT INTO ${qtable(db, 'images')} (${qi('tripId')}, ${qi('filePath')}) VALUES (${tid}, '${esc(f.slice(0, 990))}')`,
        );
        const idRows = (await exec.$queryRawUnsafe(`SELECT LAST_INSERT_ID() AS id`)) as Array<{ id: number | bigint }>;
        await recordState(exec, db, 'Image', key, Number(idRows[0].id), runId);
        c.migrated++;
      }
    }
  }
  {
    const pointRows = pointsImageCol ? ((await exec.$queryRawUnsafe(
      `SELECT ${pointsIdExpr} AS legacy, ${qi('imageFile')} AS raw FROM ${qtable(db, 'points')}`,
    )) as Array<{ legacy: unknown; raw: unknown }>) : [];
    for (const r of pointRows) {
      const legacy = String(r.legacy ?? '');
      let pid: number | null = null;
      let pending = false;
      try {
        pid = await lookupState(exec, db, dryRun, 'Point', legacy);
      } catch (e) {
        if (!isStateUnavailable(e)) throw e;
        pending = true;
      }
      if (pending || pid === 0) {
        const toks = splitList(r.raw);
        if (toks.length > 0) c.skipped += toks.length;
        continue;
      }
      if (pid === null) {
        const toks = splitList(r.raw);
        if (await quarantineDryAware(exec, db, dryRun, runId, 'Image', legacy, 'ORPHAN_POINT', `Point not migrated; ${toks.length} filename(s) held.`, { files: toks })) {
          if (toks.length > 0) c.quarantined++;
        }
        continue;
      }
      for (const f of splitList(r.raw)) {
        const key = 'point:' + pid + ':' + f;
        const already = await lookupStateOrPending(exec, db, dryRun, 'Image', key);
        if (already !== null) { c.skipped++; continue; }
        if (dryRun) { c.migrated++; continue; }
        await exec.$executeRawUnsafe(
          `INSERT INTO ${qtable(db, 'images')} (${qi('pointId')}, ${qi('filePath')}) VALUES (${pid}, '${esc(f.slice(0, 990))}')`,
        );
        const idRows = (await exec.$queryRawUnsafe(`SELECT LAST_INSERT_ID() AS id`)) as Array<{ id: number | bigint }>;
        await recordState(exec, db, 'Image', key, Number(idRows[0].id), runId);
        c.migrated++;
      }
    }
  }
  {
    // userKeyCol resolved at runtime (`_id` legacy, `id` after rename).
    const userKeyCol = (await userKeyColumn(exec, db)) || '_id';
    const userRows = usersImageCol ? ((await exec.$queryRawUnsafe(
      `SELECT ${qi(userKeyCol)} AS legacy, ${qi('imageFile')} AS raw FROM ${qtable(db, 'users')}`,
    )) as Array<{ legacy: unknown; raw: unknown }>) : [];
    for (const r of userRows) {
      const legacy = String(r.legacy ?? '');
      if (!(await userExistsById(exec, db, legacy))) continue;
      for (const f of splitList(r.raw)) {
        const key = 'user:' + legacy + ':' + f;
        const already = await lookupStateOrPending(exec, db, dryRun, 'Image', key);
        if (already !== null) { c.skipped++; continue; }
        if (dryRun) { c.migrated++; continue; }
        await exec.$executeRawUnsafe(
          `INSERT INTO ${qtable(db, 'images')} (${qi('ownerId')}, ${qi('filePath')}) VALUES ('${esc(legacy)}', '${esc(f.slice(0, 990))}')`,
        );
        const idRows = (await exec.$queryRawUnsafe(`SELECT LAST_INSERT_ID() AS id`)) as Array<{ id: number | bigint }>;
        await recordState(exec, db, 'Image', key, Number(idRows[0].id), runId);
        c.migrated++;
      }
    }
  }
  return c;
}
export async function phaseImages(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  if (dryRun) return runImages(prisma, db, runId, dryRun);
  let out: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  await inTx(prisma, async (tx) => {
    out = await runImages(tx, db, runId, dryRun);
  });
  return out;
}
