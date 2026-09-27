/**
 * PHASE 4 — preflight checks (read-only; never writes).
 *
 * Fails closed with exit 2: missing DATABASE_URL, no connectivity, missing
 * legacy source tables, missing migration DDL prerequisites, or production
 * target without backup + dual confirmation. Dry-run mode can still report
 * what WOULD happen after these checks pass.
 *
 * A legacy source column that the data phases READ may legitimately be gone
 * because the migration already retired it — that case is downgraded to a
 * warning when the corresponding final object exists, so `--verify` still works
 * on a finished database. Everything else stays fatal.
 */

import { PrismaClient } from '@prisma/client';
import {
  databaseNameFromUrl,
  getEnv,
  isLocalhostTarget,
  MIGRATION_VERSION,
} from './config';
import { columnExists, columnType, dbName, qtable, tableExists } from './db';

export interface PreflightResult {
  ok: boolean;
  fatal: string[];
  warnings: string[];
  database: string;
  isProduction: boolean;
}

const LEGACY_TABLES = [
  'users',
  'trips',
  'points',
  'comments',
  'verify',
  'failedlogs',
  'routenotfoundlogs',
];

/** Target objects the migration creates. Missing ones are fine when the ddl
 *  phase is part of the requested run. */
const TARGET_TABLES = ['target_types', 'trip_groups', 'likes', 'favorites', 'reports', 'images'];


interface SourceRequirement {
  table: string;
  column: string;
  /** True when the final shape that replaced this source column is present. */
  migratedWhen: () => Promise<boolean>;
  /** What the column feeds, used in the warning text. */
  feeds: string;
}

async function sourceColumnReport(
  prisma: PrismaClient,
  db: string,
): Promise<{ fatal: string[]; warnings: string[] }> {
  const fatal: string[] = [];
  const warnings: string[] = [];
  const hasId = (table: string): Promise<boolean> => columnExists(prisma, db, table, 'id');
  const tableFilled = (table: string): Promise<boolean> => tableExists(prisma, db, table);
  const requirements: SourceRequirement[] = [
    // user identity: `_id` -> final `id`
    { table: 'users', column: '_id', feeds: 'users.id', migratedWhen: () => hasId('users') },
    { table: 'users', column: 'email', feeds: 'users.email', migratedWhen: async () => false },
    { table: 'users', column: 'role', feeds: 'users.role', migratedWhen: async () => false },
    { table: 'users', column: 'status', feeds: 'users.status', migratedWhen: async () => false },
    // trips
    { table: 'trips', column: '_id', feeds: 'trips.id', migratedWhen: () => hasId('trips') },
    { table: 'trips', column: '_ownerId', feeds: 'trips.ownerId', migratedWhen: () => columnExists(prisma, db, 'trips', 'ownerId') },
    { table: 'trips', column: 'tripGroupId', feeds: 'trips.tripGroupId', migratedWhen: async () => false },
    { table: 'trips', column: 'dayNumber', feeds: 'trips.dayNumber', migratedWhen: async () => false },
    { table: 'trips', column: 'likes', feeds: 'likes(targetTypeId=2)', migratedWhen: () => tableFilled('likes') },
    { table: 'trips', column: 'favorites', feeds: 'favorites', migratedWhen: () => tableFilled('favorites') },
    { table: 'trips', column: 'reportTrip', feeds: 'reports(targetTypeId=2)', migratedWhen: () => tableFilled('reports') },
    { table: 'trips', column: 'imageFile', feeds: 'images', migratedWhen: () => tableFilled('images') },
    // points
    { table: 'points', column: '_id', feeds: 'points.id', migratedWhen: () => hasId('points') },
    { table: 'points', column: '_ownerId', feeds: 'points.ownerId', migratedWhen: () => columnExists(prisma, db, 'points', 'ownerId') },
    { table: 'points', column: '_ownerTripId', feeds: 'points.tripId', migratedWhen: () => columnExists(prisma, db, 'points', 'tripId') },
    { table: 'points', column: 'imageFile', feeds: 'images', migratedWhen: () => tableFilled('images') },
    // comments
    { table: 'comments', column: '_id', feeds: 'comments.id', migratedWhen: () => hasId('comments') },
    { table: 'comments', column: '_ownerId', feeds: 'comments.ownerId', migratedWhen: () => columnExists(prisma, db, 'comments', 'ownerId') },
    { table: 'comments', column: '_tripId', feeds: 'comments.targetId (targetTypeId=2)', migratedWhen: () => columnExists(prisma, db, 'comments', 'targetId') },
    { table: 'comments', column: 'reportComment', feeds: 'reports(targetTypeId=5)', migratedWhen: () => tableFilled('reports') },
    // verify / logs
    { table: 'verify', column: '_id', feeds: 'verify.id', migratedWhen: () => hasId('verify') },
    { table: 'verify', column: 'userId', feeds: 'verify.userId', migratedWhen: async () => false },
    { table: 'failedlogs', column: '_id', feeds: 'failedlogs.id', migratedWhen: () => hasId('failedlogs') },
    { table: 'routenotfoundlogs', column: '_id', feeds: 'routenotfoundlogs.id', migratedWhen: () => hasId('routenotfoundlogs') },
  ];
  for (const req of requirements) {
    if (await columnExists(prisma, db, req.table, req.column)) continue;
    if (await req.migratedWhen()) {
      warnings.push(`source column already retired: ${db}.${req.table}.${req.column} (already migrated into ${req.feeds})`);
      continue;
    }
    fatal.push(`source schema differs: missing ${db}.${req.table}.${req.column}`);
  }
  return { fatal, warnings };
}

export async function preflight(prisma: PrismaClient, opts?: { allowMissingTargets?: boolean }): Promise<PreflightResult> {
  const fatal: string[] = [];
  const warnings: string[] = [];
  const env = getEnv();

  if (!env.databaseUrl) {
    return { ok: false, fatal: ['DATABASE_URL is not set.'], warnings, database: '', isProduction: false };
  }
  let db: string;
  try {
    db = databaseNameFromUrl(env.databaseUrl);
  } catch {
    return { ok: false, fatal: ['DATABASE_URL has no database name.'], warnings, database: '', isProduction: false };
  }

  try {
    await prisma.$queryRawUnsafe('SELECT 1 AS ok');
  } catch (e) {
    return { ok: false, fatal: [`database connectivity failed: ${(e as Error).message}`], warnings, database: db, isProduction: false };
  }

  for (const t of LEGACY_TABLES) {
    if (!(await tableExists(prisma, db, t))) fatal.push(`missing legacy table ${db}.${t}`);
  }
  const source = await sourceColumnReport(prisma, db);
  fatal.push(...source.fatal);
  warnings.push(...source.warnings);

  // Target objects: missing ones are created by the ddl phase. The trips group
  // column must exist in SOME shape (legacy VARCHAR, transitional
  // tripGroupNewId, or the finalized INT tripGroupId).
  const missingTargets: string[] = [];
  for (const t of TARGET_TABLES) {
    if (!(await tableExists(prisma, db, t))) missingTargets.push(t);
  }
  const groupType = await columnType(prisma, db, 'trips', 'tripGroupId');
  const groupFinalized = groupType.toLowerCase().includes('int');
  const newIdPresent = await columnExists(prisma, db, 'trips', 'tripGroupNewId');
  const groupColumnPresent = groupType !== '' || newIdPresent;

  if (missingTargets.length > 0 || !groupColumnPresent || !groupFinalized) {
    if (opts?.allowMissingTargets) {
      for (const t of missingTargets) warnings.push(`target table missing (will be created by ddl phase): ${t}`);
      if (!groupColumnPresent) warnings.push('trips trip-group column missing (ddl phase will add tripGroupNewId)');
      else if (!groupFinalized) warnings.push('trips.tripGroupId not finalized to INT yet (groupfinalize phase pending)');
    } else {
      if (missingTargets.length > 0) {
        fatal.push(
          `target schema DDL not applied (missing: ${missingTargets.join(', ')}). ` +
            'Apply the migration DDL phase or a synced schema before data migration.',
        );
      }
      if (!groupColumnPresent) fatal.push('missing trips.tripGroupId/tripGroupNewId — run the ddl phase before data migration.');
      else if (!groupFinalized) fatal.push('trips.tripGroupId is not INT yet — run the groupfinalize phase before activation.');
    }
  }

  const isProduction = !isLocalhostTarget(env.databaseUrl);
  if (isProduction) {
    warnings.push('non-localhost DATABASE_URL detected: production guard active.');
    if (!env.allowProduction) warnings.push('MIGRATION_ALLOW_PRODUCTION is not "true".');
    if (!env.backupRef) fatal.push('production target requires MIGRATION_BACKUP_REF (verified backup reference).');
    if (!env.allowProduction) fatal.push('production target requires MIGRATION_ALLOW_PRODUCTION=true.');
  }

  return { ok: fatal.length === 0, fatal, warnings, database: db, isProduction };
}

export function productionGateError(): string[] {
  return [
    `Refusing production migration without explicit confirmation. Set MIGRATION_ALLOW_PRODUCTION=true, ` +
      `pass --confirm-production, and set MIGRATION_BACKUP_REF to the verified backup (migration v${MIGRATION_VERSION}).`,
  ];
}

export { dbName, qtable };

