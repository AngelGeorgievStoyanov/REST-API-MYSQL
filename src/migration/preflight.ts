/**
 * PHASE 4 — preflight checks (read-only; never writes).
 *
 * Fails closed with exit 2: missing DATABASE_URL, no connectivity, missing
 * legacy source tables, missing migration DDL prerequisites, or production
 * target without backup + dual confirmation. Dry-run mode can still report
 * what WOULD happen after these checks pass.
 */

import { PrismaClient } from '@prisma/client';
import {
  databaseNameFromUrl,
  getEnv,
  isLocalhostTarget,
  MIGRATION_VERSION,
} from './config';
import { columnExists, tableExists, dbName, qtable } from './db';

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

const TARGET_TABLES = ['trip_groups', 'likes', 'favorites', 'trip_reports', 'comment_reports', 'images'];

async function sourceColumnReport(prisma: PrismaClient, db: string): Promise<string[]> {
  const fatal: string[] = [];
  const need: Array<[string, string]> = [
    ['users', '_id'],
    ['users', 'email'],
    ['users', 'role'],
    ['users', 'status'],
    ['trips', '_id'],
    ['trips', '_ownerId'],
    ['trips', 'tripGroupId'],
    ['trips', 'dayNumber'],
    ['trips', 'likes'],
    ['trips', 'favorites'],
    ['trips', 'reportTrip'],
    ['trips', 'imageFile'],
    ['points', '_id'],
    ['points', '_ownerId'],
    ['points', '_ownerTripId'],
    ['points', 'imageFile'],
    ['comments', '_id'],
    ['comments', '_ownerId'],
    ['comments', '_tripId'],
    ['comments', 'reportComment'],
    ['verify', '_id'],
    ['verify', 'userId'],
    ['failedlogs', '_id'],
    ['routenotfoundlogs', '_id'],
  ];
  for (const [table, column] of need) {
    if (await columnExists(prisma, db, table, column)) continue;
    // pkswap drops the UUID `_id` after copying it to `legacyId`. A resumed
    // run (dry or live) must accept that shape; users._id is never swapped.
    if (column === '_id' && table !== 'users' && table !== 'verify') {
      if (await columnExists(prisma, db, table, 'legacyId')) continue;
    }
    fatal.push(`source schema differs: missing ${db}.${table}.${column}`);
  }
  return fatal;
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
  fatal.push(...(await sourceColumnReport(prisma, db)));

  const missingTargets: string[] = [];
  for (const t of TARGET_TABLES) {
    if (!(await tableExists(prisma, db, t))) missingTargets.push(t);
  }
  const tripsNewIdMissing = !(await columnExists(prisma, db, 'trips', 'tripGroupNewId'));
  if (missingTargets.length > 0 || tripsNewIdMissing) {
    if (opts?.allowMissingTargets) {
      for (const t of missingTargets) warnings.push(`target table missing (will be created by ddl phase): ${t}`);
      if (tripsNewIdMissing) warnings.push('trips.tripGroupNewId missing (will be created by ddl phase)');
    } else if (missingTargets.length > 0) {
      fatal.push(
        `target schemaDDL not applied (missing: ${missingTargets.join(', ')}). ` +
          `Apply the migration DDL phase or synced schema before data migration.`,
      );
    }
  }
  if (tripsNewIdMissing && !opts?.allowMissingTargets) {
    fatal.push('missing trips.tripGroupNewId — run the ddl phase before data migration.');
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
