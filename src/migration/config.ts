/**
 * PHASE 4 — migration configuration and CLI contract.
 *
 * Isolated from runtime application code. Only the migration runner imports
 * this module. No controllers/services are touched.
 */

export const MIGRATION_NAME = 'phase4-uuid-to-int';
export const MIGRATION_VERSION = '1.0.0';

/** Ordered, resumable migration phases. */
export const PHASES = [
  'ddl',
  'users',
  'tripGroups',
  'trips',
  'points',
  'comments',
  'likes',
  'favorites',
  'reports',
  'images',
  'verify',
  'logs',
  'pkswap',
  'backfill',
  'groupfinalize',
  'replay',
  'constraints',
  'activate',
] as const;

export type PhaseName = (typeof PHASES)[number];

export interface CliOptions {
  dryRun: boolean;
  verifyOnly: boolean;
  confirmProduction: boolean;
  phase: PhaseName | null;
  help: boolean;
}

export interface MigrationEnv {
  databaseUrl: string;
  allowProduction: boolean;
  backupRef: string;
}

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    dryRun: false,
    verifyOnly: false,
    confirmProduction: false,
    phase: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--verify') opts.verifyOnly = true;
    else if (arg === '--confirm-production') opts.confirmProduction = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--phase') {
      const name = argv[i + 1];
      if (!name || !(PHASES as readonly string[]).includes(name)) {
        throw new Error(
          `Unknown --phase "${name}". Valid phases: ${PHASES.join(', ')}`,
        );
      }
      opts.phase = name as PhaseName;
      i++;
    } else {
      throw new Error(`Unknown argument "${arg}". Use --help.`);
    }
  }
  if (opts.verifyOnly && opts.phase) {
    throw new Error('--verify cannot be combined with --phase.');
  }
  return opts;
}

export function helpText(): string {
  return [
    'PHASE 4 migration — legacy `hack_trip` UUID schema -> final INT/polymorphic schema.',
    '',
    '  npm run migration:phase4                    live run (test DB by default)',
    '  npm run migration:phase4:dry-run            read-only dry run, no writes',
    '  npm run migration:phase4:verify             reconciliation + structure report, no writes',
    '  npm run migration:phase4 -- --phase trips   run a single phase (resume test)',
    '',
    'The migration rewrites the database named in DATABASE_URL IN PLACE into the',
    'structure declared by prisma/schema.prisma (target_types / likes / favorites /',
    'reports / comments+targetId, renamed id columns, final FK/index set) and drops',
    'the migration control tables at the end.',
    '',
    'Production safety:',
    '  Non-localhost DATABASE_URL requires BOTH:',
    '    MIGRATION_ALLOW_PRODUCTION=true  and  --confirm-production',
    '  plus a non-empty MIGRATION_BACKUP_REF documenting the verified backup.',
    '',
    'Exit codes: 0 = completed (quarantines/blockers possible, see report),',
    '            1 = unexpected error, 2 = preflight failure.',
  ].join('\n');
}

export function getEnv(): MigrationEnv {
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  return {
    databaseUrl,
    allowProduction:
      (process.env.MIGRATION_ALLOW_PRODUCTION || '').toLowerCase() === 'true',
    backupRef: (process.env.MIGRATION_BACKUP_REF || '').trim(),
  };
}

/** Database name parsed from a mysql:// DATABASE_URL. */
export function databaseNameFromUrl(url: string): string {
  const withoutQuery = url.split('?')[0];
  const parts = withoutQuery.split('/');
  const name = (parts[parts.length - 1] || '').trim();
  if (!name) throw new Error('DATABASE_URL has no database name.');
  return name;
}

/** True for loopback targets (test/dev). Never guessed for anything else. */
export function isLocalhostTarget(url: string): boolean {
  const m = url.match(/^mysql:\/\/[^@]+@([^/:]+)/i);
  const host = (m ? m[1] : '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}
