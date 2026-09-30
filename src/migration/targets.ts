/**
 * Migrates legacy comma/space-separated UUID token lists into the final
 * polymorphic tables. Tokens are validated (canonical UUID + surviving user)
 * and either migrated or quarantined — never split or guessed. Idempotent
 * via migration_state + the final UNIQUE keys.
 */
import { PrismaClient } from '@prisma/client';
import {
  DbExecutor,
  backfillTimestamps,
  columnExists,
  createdNow,
  esc,
  inTx,
  isUuid,
  legacyKeyColumn,
  qi,
  qtable,
  splitList,
  userExistsById,
} from './db';
import {
  TargetResolution,
  isStateUnavailable,
  lookupState,
  lookupStateOrPending,
  quarantineDryAware,
  recordState,
  resolveTripGroupIntForTrip,
} from './state';
import { Counters } from './types';

export interface TokenListConfig {
  entity: string;
  targetTable: string;
  sourceTable: 'trips' | 'comments';
  sourceColumn: string;
  stateKey: (token: string, parentId: number) => string;
  targetColumn: 'targetId' | 'tripGroupId';
  targetTypeId: number | null;
  malformedCode: string;
  orphanCode: string;
  parentLabel: string;
  resolve: (exec: DbExecutor, legacyKey: string) => Promise<TargetResolution>;
}

/** Resolve a legacy trip UUID to the final `trips.id`. */
export function tripParentResolver(db: string, dryRun: boolean) {
  return async (exec: DbExecutor, legacyTrip: string): Promise<TargetResolution> => {
    let tid: number | null;
    try {
      tid = await lookupState(exec, db, dryRun, 'Trip', legacyTrip);
    } catch (e) {
      if (!isStateUnavailable(e)) throw e;
      return { kind: 'pending' };
    }
    if (tid === null) return { kind: 'unmapped' };
    if (tid === 0) return { kind: 'pending' };
    return { kind: 'target', id: tid };
  };
}

/** Resolve a legacy comment UUID to the final `comments.id`. */
export function commentParentResolver(db: string, dryRun: boolean) {
  return async (exec: DbExecutor, legacyComment: string): Promise<TargetResolution> => {
    let cid: number | null;
    try {
      cid = await lookupState(exec, db, dryRun, 'Comment', legacyComment);
    } catch (e) {
      if (!isStateUnavailable(e)) throw e;
      return { kind: 'pending' };
    }
    if (cid === null) return { kind: 'unmapped' };
    if (cid === 0) return { kind: 'pending' };
    return { kind: 'target', id: cid };
  };
}

/** Resolve a legacy trip UUID to its final `trip_groups.id` (favorites). */
export function tripGroupParentResolver(db: string, dryRun: boolean) {
  return (exec: DbExecutor, legacyTrip: string): Promise<TargetResolution> =>
    resolveTripGroupIntForTrip(exec, db, dryRun, legacyTrip);
}

export async function migrateUserTokenList(
  prisma: PrismaClient,
  db: string,
  runId: number,
  dryRun: boolean,
  cfg: TokenListConfig,
): Promise<Counters> {
  const empty: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
  const keyCol = await legacyKeyColumn(prisma, db, cfg.sourceTable);
  // Finalization dropped the legacy token column: reruns of a finished
  // migration stay no-ops instead of crashing.
  if (keyCol === '') return empty;
  if (!(await columnExists(prisma, db, cfg.sourceTable, cfg.sourceColumn))) return empty;
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT ${qi(keyCol)} AS legacy, ${qi(cfg.sourceColumn)} AS raw FROM ${qtable(db, cfg.sourceTable)}`,
  )) as Array<{ legacy: unknown; raw: unknown }>;

  return runBody(prisma, dryRun, async (exec) => {
    const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
    // likes/favorites/reports have no legacy timestamp column: every migrated row
    // carries the migration clock, and a row an earlier run created date-less is
    // repaired here (existing dates are never touched).
    if (!dryRun) await backfillTimestamps(exec, db, cfg.targetTable);
    for (const r of rows) {
      const legacy = String(r.legacy ?? '');
      const tokens = splitList(r.raw);
      if (tokens.length === 0) continue;
      const parent = await cfg.resolve(exec, legacy);
      if (parent.kind === 'pending') {
        // Final INT id not assigned yet (pre-PK-swap or dry-run without state):
        // recount in the replay phase, never quarantine.
        c.skipped += tokens.length;
        continue;
      }
      if (parent.kind === 'unmapped') {
        if (await quarantineDryAware(exec, db, dryRun, runId, cfg.entity, legacy, cfg.orphanCode, `${cfg.parentLabel} not migrated; ${tokens.length} token(s) held.`, { tokens })) {
          c.quarantined++;
        }
        continue;
      }
      const seen = new Set<string>();
      for (const token of tokens) {
        if (seen.has(token)) {
          if (await quarantineDryAware(exec, db, dryRun, runId, cfg.entity, legacy, 'DUPLICATE', 'Duplicate user token inside one legacy row.', { user: token })) c.quarantined++;
          continue;
        }
        seen.add(token);
        if (!isUuid(token)) {
          await quarantineDryAware(exec, db, dryRun, runId, cfg.entity, legacy, cfg.malformedCode, 'Token is not a canonical UUID; never split by guessing.', { token });
          c.quarantined++;
          continue;
        }
        if (!(await userExistsById(exec, db, token))) {
          if (await quarantineDryAware(exec, db, dryRun, runId, cfg.entity, legacy, 'UNKNOWN_USER', 'UUID has no surviving user.', { user: token })) c.quarantined++;
          continue;
        }
        const stateKey = cfg.stateKey(token, parent.id);
        const already = await lookupStateOrPending(exec, db, dryRun, cfg.entity, stateKey);
        if (already !== null) {
          c.skipped++;
          continue;
        }
        if (dryRun) {
          c.migrated++;
          continue;
        }
        const cols = [qi('userId')];
        const vals = [`'${esc(token)}'`];
        if (cfg.targetTypeId !== null) {
          cols.push(qi('targetTypeId'));
          vals.push(String(cfg.targetTypeId));
        }
        cols.push(qi(cfg.targetColumn));
        vals.push(String(parent.id));
        // No legacy date exists for a like/favorite/report relation: the migration
        // clock is the only truthful `createdAt` (the column has no DB default).
        cols.push(qi('createdAt'));
        vals.push(`'${createdNow()}'`);
        await exec.$executeRawUnsafe(
          `INSERT IGNORE INTO ${qtable(db, cfg.targetTable)} (${cols.join(', ')}) VALUES (${vals.join(', ')})`,
        );
        const where = [`${qi('userId')} = '${esc(token)}'`];
        if (cfg.targetTypeId !== null) where.push(`${qi('targetTypeId')} = ${cfg.targetTypeId}`);
        where.push(`${qi(cfg.targetColumn)} = ${parent.id}`);
        const idRows = (await exec.$queryRawUnsafe(
          `SELECT ${qi('id')} AS id FROM ${qtable(db, cfg.targetTable)} WHERE ${where.join(' AND ')} LIMIT 1`,
        )) as Array<{ id: number | bigint }>;
        await recordState(exec, db, cfg.entity, stateKey, Number(idRows[0].id), runId);
        c.migrated++;
      }
    }
    return c;
  });
}

async function runBody<T>(
  prisma: PrismaClient,
  dryRun: boolean,
  apply: (exec: DbExecutor) => Promise<T>,
): Promise<T> {
  if (dryRun) return apply(prisma);
  let out: T | undefined;
  await inTx(prisma, async (tx) => {
    out = await apply(tx);
  });
  return out as T;
}
