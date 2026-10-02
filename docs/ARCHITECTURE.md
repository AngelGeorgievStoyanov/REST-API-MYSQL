# Backend Architecture

This document describes the current production architecture and API contract of the HackTrip backend.

The backend is a Node.js 22+ application written in TypeScript. Express handles HTTP, Prisma Client is the request-path data layer, and MySQL is the configured datasource.

Repository source code is authoritative for implemented behavior. This document describes the production architecture and API contract implemented by the current source.

The documented production deployment path is:

```text
Frontend -> Nginx -> Express -> Controller -> Service -> Repository -> Prisma -> MySQL
```

Nginx, firewall, PM2, and deployed database state are infrastructure concerns and are not established by this repository unless explicitly represented by checked-in configuration.

## Architecture

```text
Browser / Frontend
        ->
Nginx
        ->
Express
        ->
Middleware
        ->
Controller
        ->
Service
        ->
Repository
        ->
Prisma
        ->
MySQL
```

External storage and email integrations are reached through their application adapters/services.

`src/index.ts` configures the HTTP middleware stack, mounts `/api`, initializes runtime configuration before the server listens, and releases application resources during shutdown.

### Request lifecycle

1. Express security configuration is applied, including disabled `X-Powered-By`, proxy trust, and HSTS.
2. `clientHeaderMiddleware` requires the Frontend client marker:

   ```http
   x-hacktrip-client: web
   ```

   A request without the required marker is rejected according to the production route-not-found behavior. The marker is a public request-shape filter and is not authentication.
3. CORS applies the environment-specific origin allowlist and credential policy.
4. The public API rate limit bounds traffic arriving under `/api`.
5. JSON and URL-encoded parsers enforce bounded request sizes. Multipart image requests are handled separately by their route-specific Multer configuration.
6. Requests under `/api` enter the version router and feature routers.
7. Route validation runs at the request boundary.
8. Authentication, optional authentication, and role authorization run according to the route contract.
9. Controllers receive validated and authorized input, call services, and return prepared service results.
10. Services perform business validation, authorization/ownership checks, orchestration, and API response preparation.
11. Repositories perform persistence operations through the shared Prisma client.
12. Prepared response data returns through the service and controller to `res.json(...)`.

### Dependency flow

Controllers are thin HTTP adapters.

Services own business rules, authorization, ownership checks, orchestration, and API boundary preparation.

Repositories own Prisma persistence.

`src/container.ts` is the composition root and constructs the application dependency graph.

Request-path repositories use the single shared Prisma client from `src/clients/prisma.ts`.

Migration and maintenance tools are separate from the request path and may use narrowly scoped raw SQL where explicitly required.

### Mapping boundaries

The normal response flow is:

```text
Prisma / Repository
        ->
persistence-to-application mapping
        ->
Service
        ->
API mapper
        ->
Controller
        ->
res.json(preparedResult)
```

All mapper modules are located under `src/mappers/`.

API mappers:

* accept application/domain contracts;
* perform transformation only;
* do not query databases;
* do not call services or repositories;
* do not contain business rules;
* do not perform authorization or ownership decisions;
* do not depend on Express or Prisma.

Persistence mappers are separate from API mappers and convert persistence representations into application contracts where required.

### Project structure

* `src/index.ts`: Express application setup and server lifecycle.
* `src/routes/`: `/api` and `/v1` router composition.
* `src/controllers/`: HTTP route handlers and response delivery.
* `src/services/`: business logic, authorization, ownership checks, orchestration, and API response preparation.
* `src/repositories/`: Prisma queries and persistence mapping.
* `src/mappers/`: API/resource mappers and persistence-oriented mappers.
* `src/model/`: application/domain contracts and API DTOs.
* `src/validation/`: request validation middleware and Zod schemas.
* `src/middlewares/`: client marker, authentication/authorization, rate limiting, error handling, and route diagnostics.
* `src/clients/`: shared Prisma and external service clients.
* `src/config/`: environment reading and validation.
* `src/constants/`: reusable application constants and policy defaults.
* `src/storage/`: image validation and object-storage adapters.
* `src/startup/`: runtime initialization and cleanup.
* `src/db/cloneTestDatabase.ts`: guarded disposable database-clone tooling.
* `src/migration/`: guarded database migration tooling.
* `src/utils/`: shared helpers.
* `prisma/`: Prisma schema, seed data, and migrations.
* `scripts/`: repository maintenance scripts.
* `build/`: generated TypeScript output and is not source of truth.

## Public API contract (V6)

The production anonymous/public Frontend request uses both headers:

```http
x-hacktrip-client: web
Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>
```

Both headers are part of the production API contract.

### Frontend client marker

`x-hacktrip-client: web` is the required Frontend client marker.

It identifies the expected HackTrip web-client request shape.

It is:

* public;
* copyable;
* not authentication;
* not authorization;
* not a user credential;
* not a session.

The marker remains required independently of the public bearer token.

### Public frontend bearer token

The public Frontend sends:

```http
Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>
```

`PUBLIC_FRONTEND_TOKEN` identifies the anonymous/public Frontend API context.

It is:

* public;
* non-secret;
* visible in browser DevTools;
* copyable;
* not a password;
* not a user credential;
* not a JWT;
* not a session;
* not an ownership identity;
* not an authorization credential;
* not a security boundary.

The default value is:

```text
hacktrip-public-v1
```

The value can be overridden using the `PUBLIC_FRONTEND_TOKEN` environment variable.

The public token is never hashed, generated as a secret, treated as a credential, or stored with JWT/signing secrets.

### Authentication outcomes

For requests reaching an authentication boundary, bearer authentication has the following production behavior:

| Request authentication state                          | Result                                              |
| ----------------------------------------------------- | --------------------------------------------------- |
| No `Authorization` header                             | `404`                                               |
| `Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>`       | Anonymous context                                   |
| Valid `Authorization: Bearer <USER_ACCESS_TOKEN>`     | Authenticated user context                          |
| Invalid user access JWT                               | Existing unauthorized/404 behavior; never anonymous |
| Valid user access JWT with suspended/deactivated user | Existing account-status authentication behavior     |

A request without `Authorization` is not treated as successful anonymous authentication.

An invalid user JWT is not treated as the public frontend token and never falls back to anonymous authentication.

A valid JWT does not override the current database account status.

### Bearer token classification

The authentication boundary classifies the bearer value before attempting JWT verification:

```text
Authorization: Bearer <token>
                |
                +-- no Authorization
                |       |
                |       +-- 404
                |
                +-- token === PUBLIC_FRONTEND_TOKEN
                |       |
                |       +-- anonymous context
                |           authenticated = false
                |           actor = anonymous
                |           no user
                |           no session
                |           no ownership identity
                |
                +-- otherwise
                        |
                        +-- verify as user access JWT
                            |
                            +-- valid
                            |   authenticated user context
                            |
                            +-- invalid
                            |   existing unauthorized/404 behavior
                            |   never anonymous
                            |
                            +-- valid JWT + suspended/deactivated user
                                existing account-status behavior
```

The public token is never passed to JWT verification.

A normal authenticated request uses:

```http
Authorization: Bearer <USER_ACCESS_TOKEN>
```

A valid user access token identifies the authenticated user.

The database user row remains the authority for current account status and role.

### Anonymous request context

When the bearer token equals `PUBLIC_FRONTEND_TOKEN`, the authentication boundary creates an anonymous request context:

```text
authenticated = false
actor = anonymous
user = none
session = none
ownership identity = none
```

No default application user is created or associated with the request.

The public token therefore does not establish identity or ownership.

### Anonymous permissions

Anonymous/public access is read-only.

Public access includes the explicitly exposed public resources such as:

* public trip reads;
* public day and point data included in public trip responses;
* public point reads;
* public comment reads;
* public like counts/state;
* public favorite counts/state where exposed publicly;
* public-safe configuration;
* public image metadata exposed by public DTOs.

Anonymous access cannot:

* create or modify trips;
* create or modify points;
* create or modify comments;
* create or delete likes;
* create or delete favorites;
* submit reports;
* access admin endpoints;
* access private user data;
* access user-specific private resources;
* perform ownership-sensitive operations.

The public token grants no write capability and never bypasses authorization.

### Public reads and optional authentication

Public read routes are explicitly declared.

A route is not public merely because it lacks authentication middleware.

Routes that support public reads and may return viewer-specific state use optional authentication.

For an anonymous request:

```text
authenticated = false
actor = anonymous
```

No user, session, or ownership identity exists.

For a valid user access token, optional authentication resolves the current database user and may provide viewer-specific response state such as:

```text
likedByMe
favoritedByMe
```

The presence of optional authentication does not weaken authorization.

Backend authorization is always the final authority. Frontend visibility restrictions are never a security boundary.

## API

The current HTTP route chain is:

```text
src/index.ts
    ->
/api
    ->
apiRouter
    ->
/v1
    ->
apiRouterV1
    ->
feature routers/controllers
```

The `/api/v1` endpoint inventory below is derived from the mounted routers and controller declarations.

`GET /` is a separate application greeting and is not a versioned API endpoint.

| Resource       | Methods and paths relative to `/api/v1`                                                                                                                                                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth           | `POST /auth/register`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/confirm-password`, `/auth/forgot-password`, `/auth/reset-password`; `GET /auth/me`, `/auth/me/image`; `PUT /auth/me`, `/auth/me/password`; `POST /auth/me/image`; `DELETE /auth/me/image` |
| Admin          | `GET /admin/users`; `PUT` and `DELETE /admin/users/:userId`; `GET /admin/failed-login-logs`; `DELETE /admin/failed-login-logs`; `GET /admin/route-not-found-logs`; `GET /admin/images/cloud`, `/admin/images/database`, `/admin/images/orphans`                                                                            |
| Config         | `GET /config/selects`, `/config/services`                                                                                                                                                                                                                                                                                  |
| Comments       | `GET` and `POST /trip-groups/:tripGroupId/comments`; `/trips/:tripId/days/:dayId/comments`; `/points/:pointId/comments`; `/images/:imageId/comments`; `PUT` and `DELETE /comments/:commentId`                                                                                                                              |
| Trips and days | `GET /trips`, `/trips/:id`; `POST /trips`, `/trips/:tripId/days`, `/trips/:tripId/days/:dayId/images`; `PUT /trips/:id`, `/trips/:tripId/days/reorder`, `/trips/:tripId/days/:dayId`; `DELETE /trips/:id`, `/trips/:tripId/days/:dayId`                                                                                    |
| Points         | `POST /points`; `GET /points/:pointId`; `PUT` and `DELETE /points/:pointId`; `POST /points/:pointId/images`; `DELETE /points/:pointId/images/:imageId`; `PUT /days/:dayId/points/reorder`                                                                                                                                  |
| Images         | `DELETE /images/:imageId`                                                                                                                                                                                                                                                                                                  |
| Likes          | `POST` and `DELETE /likes`                                                                                                                                                                                                                                                                                                 |
| Favorites      | `POST` and `DELETE /favorites`                                                                                                                                                                                                                                                                                             |
| Reports        | `POST /reports`                                                                                                                                                                                                                                                                                                            |

Comments are mounted at the v1 root because their collections span several resource prefixes.

The comment 404 logger is scoped to `/comments`; other feature routers install their own scoped error and 404 middleware.

No legacy `/users`, `/data/*`, or root-level `/config` router is mounted by the current TypeScript entry point.

### Request and response models

Request bodies, queries, and route parameters are validated by Zod schemas under `src/validation/schemas/`.

Important DTO families include:

* `AuthSessionDto` contains a bearer access token and public `AuthUserDto`; refresh tokens are delivered only through an HttpOnly cookie.
* `TripListResponse` contains paginated `TripListItem` values.
* Trip details contain group, day, point, image, and social-state data according to the public/private route contract.
* `CommentListResponse` is paginated.
* Comment writes use `{ text }`; authorship comes from the authenticated actor.
* `ImageDto` contains `id`, `url`, and `thumbnailUrl`; storage object paths are not exposed as the API image contract.
* Social mutations identify a target using target type and ID; the acting user comes from authentication.
* Admin lists return bounded items with pagination metadata.
* Configuration responses use the application configuration models.

API-facing services return prepared response contracts through API mappers. Controllers do not reconstruct DTOs.

## Authentication and authorization

Protected API requests carry:

```http
Authorization: Bearer <USER_ACCESS_TOKEN>
```

The authentication boundary:

1. extracts and classifies the bearer value;
2. handles an absent bearer according to the production 404 behavior;
3. resolves `PUBLIC_FRONTEND_TOKEN` as anonymous;
4. otherwise verifies the value as a user access JWT;
5. rejects invalid JWTs using the existing unauthorized/404 behavior;
6. resolves the current user from the database;
7. applies the existing account-status authentication behavior;
8. uses the database row as the authority for current account status and role.

JWT claims do not override current database state.

Ownership and authorship derive from the authenticated actor.

Client-supplied identity fields are never treated as proof of identity.

The following values cannot establish ownership or authorization by themselves:

* `ownerId`;
* `authorId`;
* client-supplied user IDs;
* client-supplied role values;
* client-supplied account status.

Admin and moderator permissions are route-specific and role-based.

## Refresh authentication

Refresh tokens are delivered through an HttpOnly cookie.

The refresh cookie:

* is scoped to `/api/v1/auth`;
* is host-only;
* does not use a `Domain` attribute;
* is not returned in response bodies;
* uses `Secure` in production;
* remains inaccessible to client-side JavaScript;
* uses the configured `SameSite` policy.

Production security requirements cannot be weakened through environment configuration.

## Configuration

Environment values are read and validated by `src/config/`.

Reusable application defaults belong in `src/constants/`.

Current constant ownership includes:

* `src/constants/environment.ts`
* `src/constants/auth.ts`
* `src/constants/http.ts`
* `src/constants/imageStorage.ts`

Configuration modules import reusable defaults rather than defining duplicate fallback constants locally.

The public frontend token default is defined in `src/constants/environment.ts`.

Authentication defaults such as access-token TTL, refresh-token TTL, and authentication rate-limit defaults are defined in `src/constants/auth.ts`.

Environment configuration includes the public frontend token through:

```text
PUBLIC_FRONTEND_TOKEN
```

The default public token is:

```text
hacktrip-public-v1
```

The public token is not a secret and must not be treated as one.

Private configuration values such as database credentials, JWT signing secrets, SMTP passwords, and GCS credentials are supplied through the environment and are not committed to source control.

## Request pipeline

The production request pipeline is:

```text
Express security setup
        ->
x-hacktrip-client: web
        ->
CORS
        ->
public API rate limit
        ->
JSON / URL-encoded body limits
        ->
/api
        ->
/v1
        ->
request validation
        ->
authentication / optional authentication / role authorization
        ->
controller
        ->
service
        ->
repository
        ->
Prisma / external adapters
        ->
prepared response
```

The `x-hacktrip-client: web` marker is evaluated before CORS and is a public request-shape filter.

Multipart image requests use route-specific Multer handling rather than the general JSON body parser.

The public bearer token is classified inside the authentication boundary.

There is no separate custom public-token request header.

## Validation

Request validation uses strict Zod schemas where required by the route contract.

Validation covers:

* request bodies;
* query parameters;
* route parameters;
* identifiers;
* pagination;
* request size;
* image payloads.

Undeclared fields are rejected where strict schemas are used.

Generic parsing remains separate from domain/business validation.

Business rules remain in services rather than validation schemas or mappers.

## Rate limiting

Rate limits are operational protections.

They are not authentication and are not authorization boundaries.

The public API rate limit applies to traffic under `/api`.

Authentication and authorization remain correct independently of rate-limit enforcement.

Client identity for rate limiting uses Express-derived request identity according to the configured proxy topology.

Raw forwarded IP headers are not used directly for authentication, authorization, ownership, or rate-limit identity.

## Security

The application enforces server-side authorization and ownership checks.

Current security invariants include:

* database-backed role resolution;
* registration anti-enumeration;
* password re-authentication for password changes;
* HttpOnly refresh-token cookies;
* secure production cookies;
* bounded request bodies;
* strict request validation;
* API error contracts;
* generic production 500 responses;
* no stack traces or database internals in API responses;
* route-not-found logging data minimization;
* server-generated image object keys;
* create-only GCS writes;
* sanitized/re-encoded image output;
* thumbnail generation;
* image ownership checks;
* transactional image attachment and cleanup.

### Proxy trust

Express trusts one proxy hop:

```text
TRUST_PROXY_HOPS = 1
```

This corresponds to the documented deployment topology:

```text
Internet -> Nginx -> Node/Express :8080
```

`req.ip` and `req.ips` are Express-derived values and depend on the actual proxy chain and forwarded-header behavior.

If the deployment topology changes, proxy trust must be reviewed.

### Error handling

API errors use the application's API error contract.

Production responses do not expose:

* stack traces;
* database errors;
* filesystem paths;
* credentials;
* JWT secrets;
* request cookies;
* authorization credentials.

Route-not-found diagnostics apply data minimization and do not record sensitive request values such as:

* request body;
* query;
* params;
* `Authorization`;
* `Cookie`;
* passwords;
* tokens;
* API keys.

Raw forwarded IP headers are retained only as bounded forensic diagnostic evidence.

## Images

The image architecture uses Google Cloud Storage with server-generated object keys.

Image upload processing uses Multer 2 and Sharp.

The current image contract preserves:

* one image per upload request;
* maximum image count per entity;
* maximum upload size;
* Sharp byte-level image validation;
* server-generated GCS object names;
* create-only GCS writes;
* sanitized/re-encoded image output;
* thumbnails;
* transactional attachment;
* cleanup on partial upload failure;
* ownership checks.

Client filenames are not used as GCS object keys.

The original image and its generated thumbnail are managed together.

Accepted image formats and size limits are enforced by the current image-validation/storage implementation.

## External services

### Google Cloud Storage

`@google-cloud/storage` provides image object storage.

Storage object keys are generated by the server.

Create-only writes use a GCS generation precondition to prevent accidental overwrite of an existing object.

### Image processing

Sharp performs image decoding, validation, sanitization, re-encoding, and thumbnail generation.

Multipart upload parsing is performed by Multer 2.

The image storage flow preserves ownership and cleanup guarantees.

### Email

Nodemailer provides authentication email delivery.

Verification and password-reset emails use environment-provided SMTP configuration.

Development mail transport may write generated messages to the operating-system temporary directory.

## Database

The application uses Prisma Client with a MySQL datasource configured through `DATABASE_URL`.

The request path uses the shared Prisma client from:

```text
src/clients/prisma.ts
```

Principal database entities include:

* `User`;
* `TripGroup`;
* `Trip`;
* `Point`;
* `Comment`;
* `Like`;
* `Favorite`;
* `Report`;
* `Image`;
* authentication token records;
* `FailedLog`;
* `RouteNotFoundLog`;
* configuration entities.

User IDs remain UUID strings.

Resource IDs use the existing Prisma model types, including integer resource identifiers where defined by the schema.

Polymorphic social/report targets use target type plus `targetId` where defined by the current model.

Production database state cannot be inferred solely from `schema.prisma`.

Migration state must be verified using the migration history and migration documentation.

## Runtime configuration

Runtime configuration is loaded before the server begins accepting requests.

Dynamic configuration is maintained through the application's configuration service/cache lifecycle.

Reusable fallback and policy defaults are defined under `src/constants/`.

Current configuration defaults include:

```text
DEFAULT_SLOW_REFRESH_SECONDS
DEFAULT_PUBLIC_FRONTEND_TOKEN
DEFAULT_ACCESS_TOKEN_TTL_SECONDS
DEFAULT_REFRESH_TOKEN_TTL_SECONDS
DEFAULT_RATE_LIMIT_WINDOW_SECONDS
DEFAULT_RATE_LIMIT_MAX
DEFAULT_RATE_LIMIT_EMAIL_MAX
```

The source of environment values remains under `src/config/`.

## Deployment context

The documented production topology is:

```text
Internet
    ->
Nginx :80 / :443
    ->
Node / Express :8080
```

The application source does not establish:

* firewall configuration;
* PM2 runtime state;
* actual Nginx configuration;
* actual production database state;
* external proxy layers not represented in the repository.

Infrastructure must therefore be verified independently when operational changes are made.

## Development and operations

Build and verification commands include:

```bash
npm run build
npx tsc --noEmit
npm run lint
npm audit
npm audit --omit=dev
```

Read-only migration checks:

```bash
npm run migration:phase4:dry-run
npm run migration:phase4:verify
```

Database clone inspection:

```bash
npm run db:clone-test:dry-run
```

The live database-clone operation is guarded and may drop/recreate its configured disposable target. It must not be run against a non-disposable database.

Generated `build/` output is not edited manually.

There is currently no automated application test suite configured.

## Architecture invariants

The following are part of the current production architecture:

* `x-hacktrip-client: web` is the required Frontend client marker;
* anonymous/public Frontend requests carry `Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>`;
* no `Authorization` at an authentication boundary results in `404`;
* the public bearer token identifies anonymous context only;
* the public bearer token is never treated as a JWT;
* the public bearer token does not authenticate a user;
* the public bearer token does not establish ownership;
* invalid user JWTs never fall back to anonymous authentication;
* invalid user JWTs use the existing unauthorized/404 behavior;
* valid JWTs are evaluated against current database account status;
* suspended/deactivated users follow the existing account-status authentication behavior;
* anonymous/public permissions are read-only;
* authenticated requests use user access JWTs;
* current user status and role come from the database;
* ownership and authorship derive from the authenticated actor;
* refresh tokens use protected HttpOnly cookies;
* controllers remain thin;
* services own business rules and authorization;
* repositories own persistence;
* API mappers perform transformation only;
* persistence mapping remains separate from API mapping;
* request-path Prisma access uses the shared Prisma client;
* image object keys are server-generated;
* image writes are create-only;
* image processing sanitizes and re-encodes accepted images;
* API errors do not expose internal implementation details;
* generated `build/` output is not source code.

This document describes the current production architecture and contract. It does not describe migration plans, temporary implementation states, obsolete API mechanisms, or planned frontend changes.
