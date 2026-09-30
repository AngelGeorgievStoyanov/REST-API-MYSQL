import { PrismaClient } from '@prisma/client';
import { DbExecutor, backfillTimestamps, columnExists, createdNow, esc, inTx, isUuid, keepOrFill, legacyGroupColumn, ownerColumn, qi, qtable, timestampFallback, toCount, userKeyColumn } from './db';
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
    // Read-only rehearsal: same validation, no writes.
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
  // timeCreated/timeEdited are retired by activate: nothing left to migrate on a rerun.
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
  // PENDING_VERIFICATION is the target status of a user that has not confirmed
  // the email yet; legacy rows are ACTIVE/SUSPENDED/DEACTIVATED only.
  const validStatus = new Set(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']);
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
      const { createdAt, updatedAt } = timestampFallback(r['timeCreated'], r['timeEdited']);
      if (!dryRun) {
        await exec.$executeRawUnsafe(
          `UPDATE ${qtable(db, 'users')} SET ${keepOrFill('createdAt', createdAt)}, ${keepOrFill('updatedAt', updatedAt)} WHERE ${qi(keyCol)} = '${esc(id)}'`,
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
  // Deterministic order: legacy UUID ascending, so the final
  // `trip_groups.id` assignment matches the live target on every rerun.
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT DISTINCT ${qi('tripGroupId')} AS g FROM ${qtable(db, 'trips')} ORDER BY ${qi('tripGroupId')} ASC`,
  )) as Array<{ g: unknown }>;
  // `_ownerId` pre-activate, `ownerId` after the rename — resolve once.
  const tripsOwnerCol = (await ownerColumn(prisma, db, 'trips')) || '_ownerId';
  // `users._id` in the legacy source, `users.id` after the finalize rename.
  const userKeyCol = (await userKeyColumn(prisma, db)) || '_id';
  return runBody(prisma, db, runId, dryRun, 'TripGroup', async (exec) => {
    const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
    // Groups created by an earlier (pre-fallback) run must not stay date-less:
    // fill only NULL columns, so a rerun is a no-op.
    if (!dryRun) await backfillTimestamps(exec, db, 'trip_groups', { updatedAt: true });
    for (const r of rows) {
      const g = r.g === null || r.g === undefined ? '' : String(r.g);
      if (g.trim() === '') {
        if (await quarantineDryAware(exec, db, dryRun, runId, 'TripGroup', '(empty)', 'INVALID_GROUP', 'NULL/empty legacy tripGroupId cannot become a group.', { group: r.g })) c.quarantined++; continue;
      }
      const existing = await lookupStateOrPending(exec, db, dryRun, 'TripGroup', g);
      // Resume path: a rolled-back insert may have left a 0 placeholder — treat as unmapped.
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
        // 0 placeholder = "seen but unmigratable", distinct from never seen
        // (null); it never becomes a real id.
        if (!dryRun) await recordState(exec, db, 'TripGroup', g, 0, runId);
        await quarantineDryAware(exec, db, dryRun, runId, 'TripGroup', g, 'ORPHAN_USER', 'No surviving user owner; owner must not be invented.', { owners: ownerList }); c.quarantined++; continue;
      }
      const owner = [...new Set(usable)].sort()[0];
      if (new Set(usable).size > 1) {
        await quarantineDryAware(exec, db, dryRun, runId, 'TripGroup', g, 'MULTI_OWNER', 'Several surviving owners; deterministic lowest-UUID chosen, needs review.', { owners: usable, chosen: owner });
      }
      if (dryRun) { c.migrated++; continue; }
      // A group is a new concept: it has no legacy timestamp at all, so the
      // migration clock is the only truthful date (the columns have no DB default).
      const stamp = createdNow();
      await exec.$executeRawUnsafe(
        `INSERT INTO ${qtable(db, 'trip_groups')} (${qi('ownerId')}, ${qi('createdAt')}, ${qi('updatedAt')}) VALUES ('${esc(owner)}', '${stamp}', '${stamp}')`,
      );
      const idRows = (await exec.$queryRawUnsafe(`SELECT LAST_INSERT_ID() AS id`)) as Array<{ id: number | bigint }>;
      await recordState(exec, db, 'TripGroup', g, Number(idRows[0].id), runId);
      c.migrated++;
    }
    return c;
  });
}
