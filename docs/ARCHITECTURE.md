# Backend Architecture

This document describes the current TypeScript source under `src/`. It is not a statement that production Nginx, firewall, PM2, or database state has been inspected. The repository can establish application behavior and intended Prisma mappings; deployed infrastructure must be verified independently.

## Architecture

The backend is a Node.js 22+ application written in TypeScript. Express handles HTTP, Prisma Client is the request-path data layer, and MySQL is the configured datasource.

```text
Browser/FE -> Nginx -> Express -> Controller -> Service -> Repository -> Prisma -> MySQL
                                              |                    |
                                              +-> middleware       +-> external storage/email through service adapters
```

`src/index.ts` configures the middleware stack, mounts `/api`, initializes dynamic configuration before listening on port `8080`, and releases Prisma/config resources during shutdown.

### Request lifecycle

1. `clientHeaderMiddleware` rejects requests without `x-hacktrip-client: web` with an empty 404; this public marker is a noise filter, not authentication. CORS preflights are allowed through it.
2. CORS applies the environment-specific origin allowlist and credential policy.
3. JSON and URL-encoded parsers enforce bounded request sizes. Multipart image requests are handled separately by Multer.
4. The application adds HSTS and sets Express proxy trust to one hop.
5. Requests under `/api` enter the version router and feature routers. Validation and auth/role middleware run at the route boundary; services enforce domain rules and ownership.
6. Feature routers map API errors and scoped unmatched paths. The application-level error middleware handles errors raised before a feature router.

### Dependency flow

Controllers are thin HTTP adapters. Services own business validation, access/ownership checks, orchestration, and return API-ready results. Repositories own Prisma queries and persistence boundaries. `src/container.ts` constructs the shared graph. Request-path repositories use the shared client from `src/clients/prisma.ts`; migration/maintenance tools are separate and may use narrowly scoped raw SQL.

### Mapping boundaries

The response flow is:

```text
Repository / Prisma persistence
    -> persistence-to-application mapping (when required)
    -> Service
    -> API mapper
    -> Controller
    -> res.json(preparedResult)
```

- All mapper modules live in `src/mappers/`, not `src/services/`.
- API mappers accept domain/application contracts from `src/model/`; they must not import repository-owned `*Row` types or repository-specific DTO/input types.
- API mappers contain transformation logic only. They do not call repositories or services, depend on controllers/Express, perform database operations, read service runtime state, or make business, authorization, or ownership decisions.
- Persistence mapping is separate from API mapping. `configMapper` converts Prisma config models/relations into application config contracts and is used by `ConfigRepository`. `pointPersistenceMapper` converts persisted point fields into the `PointRecord` application contract and is used by point/trip repositories.
- Current API/resource mapper modules include `tripMapper`, `pointMapper`, `commentMapper`, `imageMapper`, `reportMapper`, `userMapper`, `socialMapper`, `adminMapper`, `routeNotFoundLogMapper`, and `imageInventoryMapper`. Persistence mapper modules are `configMapper` and `pointPersistenceMapper`.
- Put shared boundary contracts in `src/model/` when they are needed by repository, service, and mapper layers. Avoid duplicate types created only to satisfy formal layering; a repository may return an existing application contract when its shape already matches.
- Write mappers target application/domain input contracts. The repository translates those contracts into Prisma field names and storage representations where needed. Validation and business rules remain outside mappers.
- Controllers do not perform DTO mapping or response-specific transformations. They pass the prepared service result to the HTTP response. This refactor must preserve endpoint paths/methods, status codes, response JSON shape, and business behavior.

### Project structure

- `src/index.ts`: Express application setup and server lifecycle.
- `src/routes/`: `/api` and `/v1` router composition.
- `src/controllers/`: auth, admin, config, trips/days, points, comments, likes, favorites, reports, and images.
- `src/controllers/`: auth, admin, config, trips/days, points, comments, likes, favorites, reports, and images; HTTP adapters that send service results.
- `src/services/`: slice business logic, API boundary orchestration, dynamic config cache, auth mailer, image inventory/attachment.
- `src/repositories/`: Prisma queries and persistence-to-application boundary mapping for each slice.
- `src/mappers/`: resource/API mappers plus explicitly persistence-oriented mappers such as `configMapper` and `pointPersistenceMapper`.
- `src/model/`: domain/application contracts and API DTO/request/response types.
- `src/validation/`: request validation middleware and Zod schemas.
- `src/middlewares/`: client marker, auth/role boundary, rate limiting, error handling, route-not-found diagnostics.
- `src/clients/`: shared Prisma and Google Cloud Storage clients.
- `src/storage/`: image validation, upload, object storage, and inventory adapters.
- `src/config/`, `src/constants/`: environment-derived settings and stable application policy.
- `src/startup/`: dynamic-config initialization and resource cleanup.
- `src/db/cloneTestDatabase.ts`: guarded database-clone CLI for disposable test/dev databases.
- `src/migration/`: database migration CLI and its operational documentation.
- `src/utils/`: shared parsing, auth, error, and request-data helpers.
- `src/utils/`: shared parsing, auth, error, and request-data helpers.
- `src/utils/`: shared parsing, auth, error, and request-data helpers.
- `prisma/`: Prisma schema, seed SQL, and Prisma migrations.
- `scripts/`: repository maintenance scripts.
- `build/`: generated TypeScript output; not source of truth.

## API

The current source route chain is:

```text
src/index.ts -> /api -> apiRouter -> /v1 -> apiRouterV1 -> feature routers/controllers
```

The `/api/v1` endpoint inventory below is derived from the mounted routers and controller declarations. `GET /` is a separate application greeting, not a versioned API endpoint.

| Resource | Methods and paths (relative to `/api/v1`) |
|---|---|
| Auth | `POST /auth/register`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/confirm-password`, `/auth/forgot-password`, `/auth/reset-password`; `GET /auth/me`, `/auth/me/image`; `PUT /auth/me`, `/auth/me/password`; `POST /auth/me/image`; `DELETE /auth/me/image` |
| Admin | `GET /admin/users`; `PUT` and `DELETE /admin/users/:userId`; `GET /admin/failed-login-logs`; `DELETE /admin/failed-login-logs`; `GET /admin/route-not-found-logs`; `GET /admin/images/cloud`, `/admin/images/database`, `/admin/images/orphans` |
| Config | `GET /config/selects`, `/config/services` |
| Comments | `GET` and `POST /trip-groups/:tripGroupId/comments`; `/trips/:tripId/days/:dayId/comments`; `/points/:pointId/comments`; `/images/:imageId/comments`; `PUT` and `DELETE /comments/:commentId` |
| Trips and days | `GET /trips`, `/trips/:id`; `POST /trips`, `/trips/:tripId/days`, `/trips/:tripId/days/:dayId/images`; `PUT /trips/:id`, `/trips/:tripId/days/reorder`, `/trips/:tripId/days/:dayId`; `DELETE /trips/:id`, `/trips/:tripId/days/:dayId` |
| Points | `POST /points`; `GET /points/:pointId`; `PUT` and `DELETE /points/:pointId`; `POST /points/:pointId/images`; `DELETE /points/:pointId/images/:imageId`; `PUT /days/:dayId/points/reorder` |
| Images | `DELETE /images/:imageId` |
| Likes | `POST` and `DELETE /likes` |
| Favorites | `POST` and `DELETE /favorites` |
| Reports | `POST /reports` |

Comments are mounted at the v1 root because their collections span several resource prefixes. The comment 404 logger is scoped to `/comments`; other feature routers install their own scoped error/404 middleware. No legacy `/users`, `/data/*`, or root `/config` router is mounted by the current TypeScript entry point.

### Request and response models

Request bodies, queries, and route parameters are validated by Zod schemas in `src/validation/schemas/`. Schemas generally reject undeclared fields. Important DTO families include:

- `AuthSessionDto` contains a bearer access token and public `AuthUserDto`; the refresh token is delivered only as an HttpOnly cookie.
- `TripListResponse` contains paginated `TripListItem` values; trip details contain a group, day rows, points, images, and social state.
- `CommentListResponse` is paginated; comment writes use `{ text }` and authors come from the authenticated actor.
- `ImageDto` contains `id`, `url`, and `thumbnailUrl`; object file paths are not exposed as the API image contract.
- Social mutations identify a target by target type and ID; the acting user comes from authentication.
- Admin lists return bounded `items` plus pagination metadata.
- Config responses use `SelectConfig` and `ServiceConfig` models.

API-facing services return these prepared response contracts through API mappers; controllers do not reconstruct DTOs. The mapper refactor is structural only and does not redesign the API contract.

## Authentication and authorization

Protected v1 requests carry `Authorization: Bearer <access token>`. The token identifies its subject; `authBoundary` verifies it and resolves the current user row on each request. Account status and role used for authorization come from that row, not untrusted role claims. Optional authentication is used only for public reads that may return viewer-specific state.

Services receive the resulting actor (`id`, `role`). The authenticated actor supplies ownership and authorship. A request's owner/author/user ID must not be treated as proof of identity. Admin routes apply role checks at the auth boundary; the admin controller distinguishes admin-only mutations from admin/moderator operations.

The refresh cookie is HttpOnly, host-only (no `Domain` option), and scoped to `/api/v1/auth`. Production uses `Secure`; `COOKIE_SECURE` cannot disable it when `NODE_ENV=production`. `SameSite` defaults to `none` in production and `lax` in development, with the configured enum override.

## Database

The application uses `@prisma/client` with the MySQL datasource from `DATABASE_URL`. The Prisma schema models these principal entities:

- `User` owns trip groups, trips, points, comments, images, and social records; user IDs are UUID strings while resource IDs are integer keys.
- `TripGroup` represents a multi-day trip and has `Trip` day rows. A day row owns points and may have images.
- `Point` belongs to a day (`Trip`) and may have images.
- `Comment`, `Like`, and `Report` use `TargetType` plus `targetId` for supported polymorphic targets. The polymorphic `targetId` intentionally has no ordinary resource foreign key.
- `Favorite` links a user to a trip group.
- `Image` rows refer to generated GCS object paths and may be associated with a user, trip/day, or point.
- Email-verification, password-reset, and refresh-token rows store token hashes and expiry/consumption state. The legacy `Verify` model remains represented separately.
- `FailedLog` and `RouteNotFoundLog` hold operational diagnostics; `SelectType`/`SelectOption` and `ServiceType`/`ServiceConfig` back runtime configuration.

The schema file includes live-mapping caveats and migration-target details. Repository contents alone do not prove which migration steps have been applied to a production database; verify the deployed database separately. Runtime configuration is loaded by `dynamicConfig` before the server listens and refreshed from its cache lifecycle.

## External services and images

- **Google Cloud Storage:** `@google-cloud/storage` accesses the image bucket configured in `src/constants/imageStorage.ts`. Object keys are generated server-side; writes use a create-only generation precondition. The original and `_thumb.webp` sidecar are managed together, with cleanup on partial upload failure.
- **Image processing:** Multer 2 parses one multipart file (`file`), no text fields, up to 25 MiB. Sharp validates the actual image bytes and re-encodes accepted JPEG, PNG, WebP, or GIF images; thumbnails are resized and encoded as WebP. Trip-day and point image counts are capped at nine per entity.
- **Email:** Nodemailer sends verification and password-reset mail using environment-provided SMTP account settings. Development file transport writes messages under the operating-system temp directory.
- No Google Maps SDK/API client is used by the current runtime source. The Prisma configuration tables can contain service settings, but that is not evidence of a Maps integration in this backend.

## Security, logging, and deployment

- CORS allows only the configured production or development origins and enables credentials; it is not a wildcard policy. The first `x-hacktrip-client` filter is public and is not an auth factor.
- HSTS is emitted by the application. The source does not currently register Helmet.
- Express `trust proxy` is one hop (`TRUST_PROXY_HOPS = 1`). This assumes one Nginx proxy directly before Node. `req.ip` and `req.ips` are Express-derived values and depend on the real proxy chain and Nginx forwarded-header behavior.
- Raw forwarded IP headers are preserved only as forensic diagnostic evidence in the scoped 404 logger. They must not be used for authentication, authorization, ownership, or other security decisions. The auth rate limiter uses `req.ip`.
- The 404 diagnostic omits request body, query, params, Authorization, Cookie, and password/token/API-key fields. It records bounded IP evidence and selected non-sensitive headers. API error responses use the API error format and generic 500 messages rather than returning stack traces or database internals.
- Image object keys are random and server-generated; client filenames are used only for validating declared extension, not for the GCS key.

Known deployment topology supplied for this project is `Internet -> Nginx :80/:443 -> Node/Express :8080`, with Nginx proxying to `http://localhost:8080`. This is deployment context, not checked-in Nginx configuration. The repository does not establish firewall state, origin reachability, PM2 runtime state, or whether another proxy exists before Nginx. Proxy trust must be revisited if topology changes.

## Package inventory

Major direct dependencies from `package.json` (transitive packages omitted):

| Group | Dependency | Use |
|---|---|---|
| Runtime / HTTP | `express` | HTTP server and routers |
| Runtime / HTTP | `body-parser`, `cors`, `dotenv` | Request parsing, CORS, environment-file loading |
| Database | `@prisma/client` | Request-path ORM/client for MySQL |
| Database tooling | `mysql` | Connection used by the guarded database-clone CLI; request repositories use Prisma |
| Authentication / security | `bcrypt` | Password hashing and verification |
| Authentication / security | `jsonwebtoken` | Signed access JWTs |
| Email | `nodemailer` | Auth verification/reset email transport |
| Validation | `zod` | Request schema validation |
| Cloud / storage | `@google-cloud/storage` | GCS bucket operations |
| Cloud / storage | `multer` | Multipart upload parsing with the custom GCS storage engine |
| Cloud / storage | `sharp` | Image decoding, re-encoding, and thumbnails |
| Tooling | `typescript`, `ts-node`, `nodemon` | Compilation, CLI/dev TypeScript execution, and development reload |
| Tooling | `eslint`, `@eslint/js`, `@typescript-eslint/*`, `globals` | Static linting |
| Types | `@types/*` packages | Type declarations for Node and runtime packages |

The removed suite used Node's built-in `node:test`; it had no test-only third-party dependency. No automated test scripts are currently configured. The test strategy is intentionally deferred to a separate task.

## Development and operations commands

- `npm run build`: emit TypeScript into `build/`.
- `npx tsc --noEmit`: typecheck without output.
- `npm run lint`: run ESLint.
- `npm audit` and `npm audit --omit=dev`: audit all and production dependency trees.
- `npm run dev`: nodemon development server; `npm run server` runs the source through `ts-node` and enables the Node inspector, so keep it local.
- `npm start`: compile and start `build/index.js` with PM2.
- `npm run migration:phase4:dry-run`, `npm run migration:phase4:verify`: read-only migration checks. Review [src/migration/README.md](../src/migration/README.md) before write-mode migration commands.
- `npm run db:clone-test:dry-run`: inspect the clone plan. The live clone utility can drop/recreate only its explicitly configured target; verify the target is disposable before running.
