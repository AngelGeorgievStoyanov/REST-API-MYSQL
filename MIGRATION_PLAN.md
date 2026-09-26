# REST API Migration / Refactor — Master Plan

Documentation only. No code, Prisma schema, database, or migration-script changes are made by this file.

> Current production database is **NOT being migrated yet** and production migration has **NOT happened**. It keeps running on the legacy MySQL layer. The final production migration happens only after the application refactor and testing are completed.

## 1. Overall phases

| Phase | Scope | Status |
|---|---|---|
| Phase 0 — Inventory | Map legacy MySQL tables, controllers, services, GCS image flow | ✅ Completed |
| Phase 1 — Backend modernization | Dependencies, ESLint, Multer v2 + custom GCS engine, import cleanup | ✅ Completed |
| Phase 2 — Legacy freeze | Keep `src/index.ts` + `mysql` pool + repositories unchanged; remove auto `CREATE USER/DATABASE/TABLE` from startup | ✅ Completed |
| Phase 3 — Schema redesign / finalization | Finalize target tables, column names, INT vs UUID policy, `target_types` polymorphism | 🟡 Current phase |
| Phase 4 — Migration tooling | `src/migration/*` runner: preflight, DDL, phased data migration, quarantine, verify, resume | 🟡 Test-only; must later be aligned with the finalized Phase 3 schema |
| Phase 5 — Application refactor | Rewrite services/controllers on Prisma Client against final schema | ⬜ Not started |
| Phase 6 — Testing | Unit/integration, migration dry-runs, parity checks, load/smoke tests | ⬜ Not started |
| Phase 7 — Production cutover | Backup, final migration rehearsal, cutover, cleanup of legacy columns | ⬜ Planned later, only after application refactor and testing are completed |

Existing migration operations detail stays in `src/migration/README.md`; this file is the project-level plan.

## 2. Current state

- Runtime still uses legacy `mysql` pool in `src/index.ts` and repository classes under `src/services/*`.
- `prisma/schema.prisma` is the **target**, not the live database.
- Migration code under `src/migration/*` is exercised against test/dev databases only (`--dry-run`, `--verify`, phased runs).
- Production data has not been rewritten, no legacy columns dropped, no FK cutover done.

## 3. ID policy (final)

- `users.id` remains **UUID / VARCHAR(36)** and is never converted to INT.
- All other entity IDs are **INT AUTO_INCREMENT**: `trip_groups`, `trips`, `points`, `comments`, `likes`, `favorites`, `reports`, `images`, `verify`, `failedlogs`, `routenotfoundlogs`, `target_types`.
- No migrated table uses `_id`, `_ownerId`, `_ownerTripId`, or similar underscore-prefixed names as a final column name.
- Every FK referencing `users` stays **UUID / VARCHAR(36)** (`ownerId`, `userId`).
- Resource FKs are INT: `tripId`, `pointId`, `tripGroupId`, `targetTypeId`, `targetId`.
- Legacy UUID PKs are preserved during migration in `legacyId` columns for row matching, then dropped after cutover.

## 4. Database migration strategy

1. Test/dev first: preflight, additive-only DDL, phased data migration, constraints report, verify.
2. Data phases run in dependency order, each in its own transaction, resumable via `migration_state(entity, legacy_key, new_id)`.
3. Dirty rows go to `migration_quarantine` with reason codes (`ORPHAN_USER`, `ORPHAN_TRIP`, `INVALID_UUID`, `MALFORMED_LIKE`, `DUPLICATE`, ...). Source rows are never deleted or invented.
4. Legacy VARCHAR timestamps and comma-separated columns are preserved until converted, then removed in a separate verified cleanup after application cutover.
5. Production migration only after Phases 5+6, with verified backup plus `MIGRATION_ALLOW_PRODUCTION=true`, `--confirm-production`, `MIGRATION_BACKUP_REF`.

## 5. Prisma direction

- Prisma Client is the target data layer; do not point the app at the half-migrated schema prematurely.
- Legacy columns stay as `legacy*` / `@map` bridges until cutover.
- Native Prisma enums for `UserRole` / `UserStatus`; live columns stay VARCHAR until cutover.
- Delete policy: Cascade down the resource tree (`trip_groups -> trips -> points/comments/likes/favorites/reports/images`); Restrict `users` FKs so user-owned content cannot disappear silently.

## 6. Current database structure (Phase 3)

- `users (UUID id)` — `email UNIQUE`, `role`, `status`, legacy `timeCreated/timeEdited`, `createdAt/updatedAt`.
- `target_types (INT id AUTO_INCREMENT)` — lookup table for polymorphic targets.
- `trip_groups (INT id AUTO_INCREMENT)` — `ownerId UUID -> users.id`, `createdAt/updatedAt`.
- `trips (INT id AUTO_INCREMENT)` — `ownerId UUID -> users.id`, `tripGroupId INT -> trip_groups.id`, `dayNumber`, `createdAt/updatedAt`, plus legacy columns pending cleanup.
- `points (INT id AUTO_INCREMENT)` — `ownerId UUID -> users.id`, `tripId INT -> trips.id`, `createdAt/updatedAt`, plus legacy columns pending cleanup.
- `comments (INT id AUTO_INCREMENT)` — `ownerId UUID -> users.id`, `targetTypeId INT -> target_types.id`, `targetId INT`, `createdAt/updatedAt`, plus legacy columns pending cleanup.
- `likes (INT id AUTO_INCREMENT)` — `userId UUID -> users.id`, `targetTypeId INT -> target_types.id`, `targetId INT`; UNIQUE `(userId, targetTypeId, targetId)`.
- `reports (INT id AUTO_INCREMENT)` — `userId UUID -> users.id`, `targetTypeId INT -> target_types.id`, `targetId INT`; UNIQUE `(userId, targetTypeId, targetId)`.
- `favorites (INT id AUTO_INCREMENT)` — `userId UUID -> users.id`, `tripGroupId INT -> trip_groups.id`; UNIQUE `(userId, tripGroupId)`.
- `images (INT id AUTO_INCREMENT)` — `ownerId UUID -> users.id`, optional `tripId INT -> trips.id`, optional `pointId INT -> points.id`, `filePath`.
- `verify (INT id AUTO_INCREMENT)` — `userId UUID -> users.id`.
- `failedlogs (INT id AUTO_INCREMENT)` / `routenotfoundlogs (INT id AUTO_INCREMENT)` — operational logs; `reqUserId` validated as UUID when present.

Key relations/FKs: resource-tree deletes cascade; user references restrict/cascade per schema comments and must be confirmed during migration testing.

## 7. Application refactor (Phase 5)

- Replace `mysql` repositories with Prisma Client services.
- Rewrite controllers for normalized relations (likes/favorites/reports/images as tables, not comma-separated strings).
- Keep GCS flat single-bucket storage concept; image rows reference generated filenames plus `_thumb.webp` sidecar.
- No API behavior change beyond what normalization requires; auth/JWT work stays separate from DB migration.

## 8. Testing (Phase 6)

- Unit tests for parsing/mapping helpers and report/toggle logic.
- Migration dry-run plus verify on a production-like copy; reconcile source vs mapped vs quarantined per entity.
- Application parity tests: legacy vs Prisma responses for trips/points/comments/likes/favorites/reports/images.
- Smoke/load checks for upload, top-trips ordering, favorites, and reporting flows.

## 9. Final production cutover (Phase 7, later)

- Freeze writes, take and verify full backup, record `MIGRATION_BACKUP_REF`.
- Rehearse full migration on a restore; resolve all quarantine/blockers.
- Run production migration with dual confirmation, then switch the app to Prisma.
- Only after successful cutover: drop transitional `legacyId`, legacy VARCHAR dates, and comma-separated columns in a separate verified step.

