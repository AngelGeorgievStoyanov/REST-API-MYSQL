/**
 * PHASE 4 — shared USER-TOKEN migration for the final polymorphic tables.
 *
 * The legacy source stores user collections as comma/space separated UUID
 * token lists inside a row:
 *   trips.likes            -> likes(userId, targetTypeId = 2, targetId)
 *   trips.favorites        -> favorites(userId, tripGroupId)
 *   trips.reportTrip       -> reports(userId, targetTypeId = 2, targetId)
 *   comments.reportComment -> reports(userId, targetTypeId = 5, targetId)
 *
 * Every token is validated (canonical UUID + surviving user) and either
 * migrated or quarantined with a reason code. Malformed tokens are NEVER
 * split or guessed; unknown users are NEVER invented. Runs are idempotent:
 * `migration_state(entity, legacy_key)` records each migrated pair and
 * `INSERT IGNORE` + the final UNIQUE key absorb reruns.
 */
import { PrismaClient } from '@prisma/client';
import {
  DbExecutor,
  columnExists,
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
  /** migration_state / quarantine entity name ('Like', 'Favorite', 'Report'). */
  entity: string;
  /** Final target table ('likes' | 'favorites' | 'reports'). */
  targetTable: string;
  /** Legacy source table that carries the token list. */
  sourceTable: 'trips' | 'comments';
  /** Legacy token column ('likes' | 'favorites' | 'reportTrip' | 'reportComment'). */
  sourceColumn: string;
  /** migration_state key: `${token}|||${stateKey(token, parentId)}`. */
  stateKey: (token: string, parentId: number) => string;
  /** Final target INT column that holds the parent id. */
  targetColumn: 'targetId' | 'tripGroupId';
  /** target_types seed id, or null when the target has no polymorphic type. */
  targetTypeId: number | null;
  /** Reason code for a token that is not a canonical UUID. */
  malformedCode: string;
  /** Reason code for a valid token whose parent could not be resolved. */
  orphanCode: string;
  /** Human label of the parent used in the quarantine reason text. */
  parentLabel: string;
  /** Resolve the parent row's final INT id for a legacy source key. */
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
  // After finalization the legacy token column is dropped: nothing left to do
  // (reruns of a finished migration stay no-ops instead of crashing).
  if (keyCol === '') return empty;
  if (!(await columnExists(prisma, db, cfg.sourceTable, cfg.sourceColumn))) return empty;
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT ${qi(keyCol)} AS legacy, ${qi(cfg.sourceColumn)} AS raw FROM ${qtable(db, cfg.sourceTable)}`,
  )) as Array<{ legacy: unknown; raw: unknown }>;

  return runBody(prisma, dryRun, async (exec) => {
    const c: Counters = { migrated: 0, skipped: 0, quarantined: 0 };
    for (const r of rows) {
      const legacy = String(r.legacy ?? '');
      const tokens = splitList(r.raw);
      if (tokens.length === 0) continue;
      const parent = await cfg.resolve(exec, legacy);
      if (parent.kind === 'pending') {
        // Final INT id not assigned yet (pre-PK-swap, or state table absent in
        // a dry-run): recount in the replay phase, never quarantine.
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
