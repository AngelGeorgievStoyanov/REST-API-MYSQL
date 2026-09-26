# PHASE 4 — Production-safe database migration

Target: UUID resource IDs → INT AUTO_INCREMENT, normalized relations
(`prisma/schema.prisma`, Phase 3 target schema).

## Preconditions

- `DATABASE_URL` points at the intended database. Never guess.
- Localhost targets run directly (test/dev).
- Any non-localhost target requires ALL of:
  - `MIGRATION_ALLOW_PRODUCTION=true`
  - `--confirm-production`
  - `MIGRATION_BACKUP_REF=<verified backup reference>`
- A verified backup MUST exist before production migration.
  The runner does not invent or verify backups; it fails closed without one.
- Run the dry-run first and resolve blockers before any live run.

## Commands

```sh
npm run migration:phase4            # live localhost run (writes)
npm run migration:phase4:dry-run    # read-only: validates + reports, no writes
npm run migration:phase4:verify     # read-only reconciliation report
npm run migration:phase4 -- --phase trips   # single-phase resume/interrupt test
npm run migration:phase4 -- --help  # CLI reference
```

Production (explicit confirmation required):

```sh
MIGRATION_ALLOW_PRODUCTION=true MIGRATION_BACKUP_REF=backup-2026-09-24-full \
  npm run migration:phase4 -- --confirm-production
```

Exit codes: `0` completed, `1` unexpected error, `2` preflight failure.

## What each run does

1. Preflight: connectivity, legacy tables/columns, target DDL state,
   production gate + backup reference.
2. `ddl` phase (idempotent, additive only): creates `trip_groups`, `likes`,
   `favorites`, `trip_reports`, `comment_reports`, `images`, control tables
   (`migration_runs`, `migration_state`, `migration_quarantine`) and
   transitional columns (`legacyId`, `tripGroupNewId`, child `tripId`,
   new `createdAt`/`updatedAt`). Never drops/renames/deletes.
3. Data phases in dependency order, each in its own transaction.
4. `constraints` phase: READ-ONLY report of exact FK/UNIQUE blockers.
   Constraints are NOT enabled by this tooling.
5. Reconciliation report: source vs mapped vs quarantined per entity.

## Mapping, resume, quarantine

- `migration_state(entity, legacy_key, new_id)` UNIQUE is the resume source
  of truth. Reruns skip already-mapped rows; no duplicates by design.
- Legacy UUIDs are preserved in `legacyId` columns; new `Trip.tripGroupId`
  is backfilled via transitional `tripGroupNewId` (rename is a later step).
- `migration_runs` records every run with status/error.
- `migration_quarantine` records dirty rows with reason codes
  (`ORPHAN_USER`, `ORPHAN_TRIP`, `MALFORMED_LIKE`, `INVALID_UUID`,
  `INVALID_DAY_NUMBER`, `DUPLICATE`, `UNKNOWN_USER`, ...). Source rows are
  never deleted or invented. Evidence is deduplicated globally on
  `(entity, legacy_id, reason_code)`: reruns never duplicate quarantine rows;
  per-run counters count newly recorded evidence only.
- User UUIDs are NEVER converted: `User.id` stays UUID; `ownerId`/`userId`
  columns stay UUID. Only resource/entity ids become INT.

## Rollback

- Rerun-safe forward migration via `migration_state`; to undo a test run,
  restore the database backup (authoritative rollback for DDL + data).
- Legacy columns/values are preserved until a separate, verified cleanup step
  after application cutover. This tooling never removes legacy columns.

## Phase boundary

Phase 4 covers tooling + migration only. No JWT/auth refactor, no
controller/service rewrite, no API changes. Application cutover is Phase 5+.
