/**
 * PHASE 4 — per-phase data migration, part A (users, tripGroups).
 * Idempotent via migration_state; dirty rows go to quarantine, never deleted.
 */
import { PrismaClient } from '@prisma/client';
import { DbExecutor, columnExists, esc, inTx, isUuid, legacyGroupColumn, ownerColumn, qi, qtable, timestampForWrite, toCount, userKeyColumn } from './db';
import { lookupStateOrPending, quarantineDryAware, recordState } from './state';
import { Counters } from './types';

async function runBody(
  prisma: PrismaClient,
  db: string,
  runId: number,
  dryRun: boolean,
  entity: 'User' | 'TripGroup',
  apply: (exec: DbExecutor) => Promise<Counters>,
): Promise<Counters> {
  if (dryRun) {
    // Read-only rehearsal: same validation, never writes.
    return apply(prisma);
  }
  let out: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  await inTx(prisma, async (tx) => {
    out = await apply(tx);
  });
  return out;
}

export async function phaseUsers(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  // `users._id` in the legacy source, `users.id` after the finalize rename.
  const keyCol = (await userKeyColumn(prisma, db)) || '_id';
  // The legacy `timeCreated`/`timeEdited` columns are retired by the activate
  // step; a rerun of a finished migration has nothing left to migrate.
  if (!(await columnExists(prisma, db, 'users', 'timeCreated'))) {
    const n = toCount((await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM ${qtable(db, 'users')}`,
    )) as Array<Record<string, unknown>>);
    return { migrated: 0, skipped: n, quarantined: 0 };
  }
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT ${qi(keyCol)}, ${qi('email')}, ${qi('role')}, ${qi('status')}, ${qi('timeCreated')}, ${qi('timeEdited')} FROM ${qtable(db, 'users')}`,
  )) as Array<Record<string, unknown>>;
  const validRoles = new Set(['user', 'admin', 'manager']);
  const validStatus = new Set(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']);
  return runBody(prisma, db, runId, dryRun, 'User', async (exec) => {
    const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
    const seenEmail = new Set<string>();
    for (const r of rows) {
      const id = String(r[keyCol] ?? '');
      if (!isUuid(id)) { if (await quarantineDryAware(exec, db, dryRun, runId, 'User', id, 'INVALID_UUID', 'User key is not a canonical UUID.', r)) c.quarantined++; continue; }
      const email = String(r['email'] ?? '').toLowerCase();
      if (seenEmail.has(email)) { if (await quarantineDryAware(exec, db, dryRun, runId, 'User', id, 'DUPLICATE', 'Duplicate user email blocks users.email UNIQUE.', r)) c.quarantined++; continue; }
      seenEmail.add(email);
      if (!validRoles.has(String(r['role'])) || !validStatus.has(String(r['status']))) {
        if (await quarantineDryAware(exec, db, dryRun, runId, 'User', id, 'INVALID_ENUM', 'role/status outside confirmed enum values.', r)) c.quarantined++;
        continue;
      }
      const created = timestampForWrite(r['timeCreated']);
      const updated = timestampForWrite(r['timeEdited']);
      if (!dryRun) {
        await exec.$executeRawUnsafe(
          `UPDATE ${qtable(db, 'users')} SET ${qi('createdAt')} = ${created ? `'${created}'` : 'NULL'}, ${qi('updatedAt')} = ${updated ? `'${updated}'` : 'NULL'} WHERE ${qi(keyCol)} = '${esc(id)}'`,
        );
      }
      c.migrated++;
    }
    return c;
  });
}

export async function phaseTripGroups(prisma: PrismaClient, db: string, runId: number, dryRun: boolean): Promise<Counters> {
  // The trip GROUP key only exists as the legacy VARCHAR `tripGroupId`. After
  // groupfinalize that column is the final INT and every group is already
  // mapped, so a rerun must not mistake INT group ids for legacy keys.
  const groupCol = await legacyGroupColumn(prisma, db);
  if (groupCol !== 'tripGroupId') {
    const n = toCount((await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM ${qtable(db, 'trip_groups')}`,
    )) as Array<Record<string, unknown>>);
    return { migrated: 0, skipped: n, quarantined: 0 };
  }
  // Deterministic derivation: legacy group UUID ascending. The final
  // `trip_groups.id` assignment is therefore stable across runs/databases
  // (the live target was derived in exactly this order).
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT DISTINCT ${qi('tripGroupId')} AS g FROM ${qtable(db, 'trips')} ORDER BY ${qi('tripGroupId')} ASC`,
  )) as Array<{ g: unknown }>;
  // `_ownerId` pre-activate, `ownerId` after the rename — resolve once.
  const tripsOwnerCol = (await ownerColumn(prisma, db, 'trips')) || '_ownerId';
  // `users._id` in the legacy source, `users.id` after the finalize rename.
  const userKeyCol = (await userKeyColumn(prisma, db)) || '_id';
  return runBody(prisma, db, runId, dryRun, 'TripGroup', async (exec) => {
    const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
    for (const r of rows) {
      const g = r.g === null || r.g === undefined ? '' : String(r.g);
      if (g.trim() === '') {
        if (await quarantineDryAware(exec, db, dryRun, runId, 'TripGroup', '(empty)', 'INVALID_GROUP', 'NULL/empty legacy tripGroupId cannot become a group.', { group: r.g })) c.quarantined++; continue;
      }
      const existing = await lookupStateOrPending(exec, db, dryRun, 'TripGroup', g);
      // Resume path: a rolled-back insert may have left a 0 placeholder.
      // Treat it as unmapped (fall through and allocate below).
      if (existing !== null && existing !== 0) { c.skipped++; continue; }
      const owners = (await exec.$queryRawUnsafe(
        `SELECT DISTINCT ${qi(tripsOwnerCol)} AS o FROM ${qtable(db, 'trips')} WHERE ${qi('tripGroupId')} = '${esc(g)}'`,
      )) as Array<{ o: unknown }>;
      const ownerList = owners.map((o) => (o.o === null || o.o === undefined ? '' : String(o.o)));
      const good = ownerList.filter((o) => isUuid(o));
      const users = good.length > 0 ? (await exec.$queryRawUnsafe(
        `SELECT ${qi(userKeyCol)} AS id FROM ${qtable(db, 'users')} WHERE ${qi(userKeyCol)} IN (${good.map((o) => `'${esc(o)}'`).join(',')})`,
      )) as Array<{ id: unknown }> : [];
      const valid = new Set(users.map((u) => String(u.id)));
      const usable = good.filter((o) => valid.has(o));
      if (usable.length === 0) {
        // No surviving owner: record a 0 placeholder so downstream phases
        // can distinguish "group seen but unmigratable" (0) from "group
        // never seen" (null). The placeholder never becomes a real id.
        if (!dryRun) await recordState(exec, db, 'TripGroup', g, 0, runId);
        await quarantineDryAware(exec, db, dryRun, runId, 'TripGroup', g, 'ORPHAN_USER', 'No surviving user owner; owner must not be invented.', { owners: ownerList }); c.quarantined++; continue;
      }
      const owner = [...new Set(usable)].sort()[0];
      if (new Set(usable).size > 1) {
        await quarantineDryAware(exec, db, dryRun, runId, 'TripGroup', g, 'MULTI_OWNER', 'Several surviving owners; deterministic lowest-UUID chosen, needs review.', { owners: usable, chosen: owner });
      }
      if (dryRun) { c.migrated++; continue; }
      await exec.$executeRawUnsafe(`INSERT INTO ${qtable(db, 'trip_groups')} (${qi('ownerId')}) VALUES ('${esc(owner)}')`);
      const idRows = (await exec.$queryRawUnsafe(`SELECT LAST_INSERT_ID() AS id`)) as Array<{ id: number | bigint }>;
      await recordState(exec, db, 'TripGroup', g, Number(idRows[0].id), runId);
      c.migrated++;
    }
    return c;
  });
}
