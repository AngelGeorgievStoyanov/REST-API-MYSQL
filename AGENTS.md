# Backend Contributor Instructions

This document describes the current backend and the rules for changing it. The source code is authoritative when implementation and documentation differ. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the current routes, data model, dependencies, and runtime flow; see [src/migration/README.md](src/migration/README.md) for migration-tool operation.

## Stack and runtime

- Node.js `>=22`, TypeScript, Express 4, Prisma Client, and MySQL.
- Application source is under `src/`; `src/index.ts` is the HTTP entry point. TypeScript emits to `build/`.
- The HTTP request path is `Controller -> Service -> Repository -> shared Prisma client -> MySQL`.
- `src/container.ts` is the composition root. It wires repositories and services; do not put business logic or configuration loading there.
- The app uses one shared Prisma client from `src/clients/prisma.ts`. Do not create another client or a slice-specific database connection.

## Project structure

- `src/controllers/`: Express route handlers, input boundary, status codes, response shaping.
- `src/services/`: business rules, authorization/ownership checks, orchestration, and mapping to API DTOs.
- `src/repositories/`: Prisma queries and database-specific persistence for each slice.
- `src/model/`: domain, request, response, and API DTO types; do not expose Prisma rows directly.
- `src/validation/` and `src/validation/schemas/`: request parsing and Zod schemas. Keep generic parsing primitives separate from domain rules.
- `src/middlewares/`: authentication boundary, request marker, rate limits, error handling, and route-not-found diagnostics.
- `src/routes/`: `/api` and `/v1` router composition.
- `src/clients/`, `src/config/`, `src/constants/`, `src/storage/`, `src/utils/`: external clients, environment/runtime configuration, constants, file storage, and helpers.
- `src/startup/`: runtime initialization and resource release.
- `src/migration/`: guarded schema/data migration CLI; its raw SQL is isolated from request handlers.
- `src/db/cloneTestDatabase.ts`: separate guarded database-clone CLI for disposable test/dev databases. It is not the removed API test suite.
- `prisma/`: Prisma schema, seed data, and migrations.
- `scripts/`: repository maintenance scripts.
- `build/`: generated output; do not edit it by hand.

## Slice boundaries

A slice with persistence or business logic normally has its own controller, service, repository, and model/schema files, adding only what it needs.

### Controller

Controllers parse HTTP inputs through validation middleware, apply authentication/role middleware, call the service, and shape the HTTP response. They must not contain Prisma queries, SQL, business rules, repository/service construction, or complex validation.

### Service

Services own business validation, authorization and ownership rules, orchestration, DTO mapping, and request-to-repository mapping. Keep service dependencies constructor-injected. Do not instantiate repositories, Prisma clients, or other dependencies inside a service. Keep one-use service-local helpers next to their consumer.

### Repository

Repositories use the shared Prisma client and own persistence queries. Do not introduce generic CRUD/query-builder layers. Do not use raw SQL in request slices; raw SQL belongs only in explicitly scoped migration/maintenance tooling when Prisma cannot express the operation.

### Models and validation

- API DTOs and domain/application types must not expose Prisma model types.
- Map Prisma rows to API DTOs within the owning service/slice.
- New domain identifiers use `id`, `ownerId`, `tripId`, `pointId`, `targetId`, and `targetTypeId`; do not add legacy underscore-prefixed identifiers.
- Use strict Zod schemas for request bodies/queries/params where the slice already follows that convention. Generic string/number parsing stays generic; business rules stay in services.

## Routing and middleware

The source mounts `src/index.ts -> /api -> /v1 -> feature routers`. Current routes are listed in `docs/ARCHITECTURE.md`; do not restore legacy root-level routers without first checking the current mounts and API contract.

The application pipeline starts with the public `x-hacktrip-client: web` noise filter (it is not authentication), then CORS, bounded JSON/urlencoded parsers, HSTS, proxy trust, and `/api`. The final application error handler handles parser/pre-router errors. Feature routers add their own API error handling and scoped 404 diagnostics where applicable.

## Authentication, authorization, and ownership

- Protected v1 routes use `Authorization: Bearer <access token>` through `src/middlewares/authBoundary.ts`.
- The JWT identifies the subject; the boundary resolves the user from the database on each request and uses the database row for current account status and role.
- Services receive the authenticated actor (`id`, `role`). Ownership and authorship derive from this actor, never from client-supplied `ownerId`, `authorId`, or user identity fields.
- Public reads may use optional authentication for viewer-specific response state. Do not make optional auth an authorization bypass.
- Admin authorization is role-based at the boundary; preserve the specific route role requirements.
- Refresh tokens travel in an HttpOnly cookie scoped to `/api/v1/auth`; they are not returned in response bodies. Production must keep the cookie `Secure`. `COOKIE_SECURE` cannot disable it when `NODE_ENV=production`.

## Configuration and external services

- `DATABASE_URL` configures Prisma/MySQL.
- Auth configuration uses `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN`, `AUTH_APP_URL`, `AUTH_VERIFY_EMAIL_PATH`, `AUTH_PASSWORD_RESET_PATH`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `AUTH_MAIL_TRANSPORT`, `EMAIL_USER`, `PASS_EMAIL`, and `AUTH_RATE_LIMIT_*` variables. Document variable names only; never commit values.
- Runtime CORS and dynamic-config refresh use `NODE_ENV` and `CONFIG_SLOW_REFRESH_SECONDS`.
- Migration gates use `MIGRATION_ALLOW_PRODUCTION` and `MIGRATION_BACKUP_REF`; consult the migration README before invoking write modes.
- The app uses Google Cloud Storage for images and Nodemailer for email. Never add credentials or private environment values to source or documentation.
- Image upload uses Multer 2 and Sharp. Preserve server-generated object keys, create-only GCS writes, current format/size limits, generated thumbnails, and cleanup/ownership checks unless a task explicitly changes the contract.

## Security and operational constraints

- Express currently trusts one proxy hop (`TRUST_PROXY_HOPS = 1`). This is matched to the stated deployment of one Nginx proxy before Node. `req.ip`/`req.ips` depend on that topology; verify the real proxy chain before changing the setting.
- Raw forwarded IP headers in route-not-found diagnostics are forensic evidence only. Never use them for authentication, authorization, ownership, or rate-limit identity; use Express-derived `req.ip` for client identity.
- CORS uses environment-specific allowlists with credentials; do not replace it with a wildcard for convenience.
- HSTS is set in application code. API errors return the API error contract and must not expose stack traces, database details, filesystem paths, or secrets.
- Route-not-found logging deliberately omits request body, query, params, Authorization, Cookie, and credentials. Preserve its data minimization and IP bounding/redaction behavior.
- The supplied deployment topology is Internet -> Nginx -> Node/Express on port 8080. Nginx, PM2, firewall, and actual production database state are not repository configuration unless a checked-in file says otherwise.

## Changes requiring prior analysis

Before changing a route, DTO, validation schema, Prisma model, migration, authentication behavior, ownership rule, cookie, rate limit, image key/format, logging field, or proxy trust, inspect its callers and current contract. Do not infer production database state from `schema.prisma` alone. Do not edit generated `build/` output. Avoid unrelated cleanup and broad refactors.

## Commands

- `npm run build`: compile TypeScript to `build/`.
- `npx tsc --noEmit`: typecheck without emitting.
- `npm run lint`: ESLint across the repository.
- `npm audit` and `npm audit --omit=dev`: dependency audits.
- `npm run server`: run the TypeScript entry using `ts-node` with the Node inspector; development only.
- `npm run dev`: run the nodemon development command.
- `npm run start`: compile and start the generated entry with PM2.
- `npm run migration:phase4:dry-run` and `npm run migration:phase4:verify`: read-only migration checks; inspect `src/migration/README.md` before any write command.
- `npm run db:clone-test:dry-run`: inspect the guarded database clone plan. The live clone command can drop/recreate its configured target; verify it is disposable before running.

The old source test suite and its helpers/scripts have been removed. No test framework or automated test command is currently configured; test strategy is a separate task. Do not recreate tests or add a testing dependency as part of an unrelated slice change.
