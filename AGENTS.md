# Backend Contributor Instructions

This repository contains the HackTrip backend API. It is the server-side source of truth for the production API contract, authentication/authorization behavior, business rules, persistence, image storage, and public configuration consumed by the HackTrip frontend.

The backend is a Node.js 22+ / TypeScript / Express 4 application using Prisma Client with MySQL. The production request path is:

`Frontend -> Nginx -> Express -> middleware -> Controller -> Service -> Repository -> Prisma -> MySQL`

The frontend and backend are separate applications, and the frontend integrates with the production API contract described here.

## Source of truth

Repository source code is authoritative for implemented behavior. `docs/ARCHITECTURE.md` is the canonical architectural description and API contract documentation.

When code and documentation disagree, inspect the implementation and update the documentation in the same change when the documented behavior is intended to remain authoritative.

Do not document temporary workarounds, historical implementation states, future migration plans, or planned frontend changes as current architecture.

## Stack and runtime

* Node.js `>=22`
* TypeScript
* Express 4
* Prisma Client
* MySQL
* Zod
* JWT access tokens
* HttpOnly refresh-token cookies
* Google Cloud Storage for images
* Multer 2 and Sharp for image processing
* Nodemailer for authentication email

Application source is under `src/`.

* `src/index.ts` is the HTTP entry point.
* TypeScript emits to `build/`.
* `src/container.ts` is the composition root.
* `src/clients/prisma.ts` provides the single shared Prisma client.
* Never create another request-path Prisma client.
* Never edit generated `build/` output by hand.

## Project structure

* `src/controllers/`: HTTP route handlers and response delivery.
* `src/services/`: business rules, authorization, ownership checks, orchestration, and API response preparation.
* `src/repositories/`: Prisma queries and persistence.
* `src/model/`: application/domain contracts and API DTOs.
* `src/mappers/`: API and persistence mapping.
* `src/validation/`: request validation middleware and Zod schemas.
* `src/middlewares/`: client marker, authentication/authorization, rate limiting, errors, and route diagnostics.
* `src/routes/`: `/api` and `/v1` router composition.
* `src/clients/`: shared external clients.
* `src/config/`: environment reading and validation.
* `src/constants/`: reusable application constants and policy defaults.
* `src/storage/`: image validation and storage.
* `src/startup/`: runtime initialization and cleanup.
* `src/migration/`: guarded migration tooling.
* `src/db/cloneTestDatabase.ts`: guarded disposable database-clone tooling.
* `src/utils/`: shared helpers.
* `prisma/`: schema, seed data, and migrations.
* `scripts/`: repository maintenance scripts.
* `build/`: generated output.

## Architecture boundaries

### Controllers

Controllers are thin HTTP adapters.

They:

* receive validated HTTP input;
* rely on authentication/role middleware;
* call services;
* return prepared service results with `res.json(...)`.

Controllers must not:

* query Prisma;
* contain business rules;
* perform ownership decisions;
* construct repositories or services;
* perform DTO mapping;
* perform response-specific transformations.

### Services

Services own:

* business validation;
* authorization and ownership checks;
* orchestration;
* API boundary preparation;
* API mapper invocation where required.

Dependencies are constructor-injected.

Services must not instantiate repositories, Prisma clients, or other application dependencies.

### Repositories

Repositories own persistence.

They:

* use the shared Prisma client;
* perform Prisma queries;
* translate application contracts into persistence representations where required.

Do not introduce generic CRUD/query-builder abstractions.

Raw SQL is restricted to explicitly scoped migration or maintenance tooling.

### Mapping

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

All mapper modules belong in `src/mappers/`.

API mappers:

* accept application/domain contracts;
* perform transformation only;
* do not query databases;
* do not call services or repositories;
* do not contain business rules;
* do not perform authorization or ownership decisions;
* do not depend on Express or Prisma.

Persistence mappers are distinct from API mappers.

## Public API contract (V6)

The production anonymous/public Frontend request uses both headers:

```http
x-hacktrip-client: web
Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>
```

Both headers are part of the production API contract.

### Frontend client marker

`x-hacktrip-client: web` is required for normal Frontend API requests.

It is a public request marker and is not authentication.

It identifies the expected HackTrip web-client request shape.

The public bearer token does not replace this header.

A request without the required client marker is rejected according to the production route-not-found behavior.

### Public frontend bearer token

`Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>` identifies an anonymous/public Frontend API context.

`PUBLIC_FRONTEND_TOKEN`:

* is public;
* is non-secret;
* is visible in browser DevTools;
* is copyable;
* is not a password;
* is not a user credential;
* is not a JWT;
* is not a session;
* is not an ownership identity;
* does not grant privileges;
* does not bypass authorization;
* is not a security boundary.

The default value is:

```text
hacktrip-public-v1
```

It can be overridden with the `PUBLIC_FRONTEND_TOKEN` environment variable.

Do not hash it, rotate it as a credential, store it with JWT/signing secrets, or treat possession of it as proof of user identity.

### Authentication outcomes

For requests reaching the authentication boundary, bearer authentication has the following production behavior:

| Request state                                         | Result                                              |
| ----------------------------------------------------- | --------------------------------------------------- |
| No `Authorization` header                             | `404`                                               |
| `Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>`       | Anonymous context                                   |
| Valid `Authorization: Bearer <USER_ACCESS_TOKEN>`     | Authenticated user context                          |
| Invalid user access JWT                               | Existing unauthorized/404 behavior; never anonymous |
| Valid user access JWT with suspended/deactivated user | Existing account-status authentication behavior     |

Absence of `Authorization` is not treated as successful anonymous authentication.

An invalid user access JWT is not treated as the public frontend token and does not fall back to anonymous authentication.

A valid JWT does not override the current database account status.

### Bearer token classification

The authentication boundary classifies the bearer value before attempting JWT verification:

```text
Authorization: Bearer <token>
                |
                +-- no Authorization
                |       |
                |       +-- production 404
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

The current database user row remains authoritative for current account status and role.

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

Public access may include:

* public trip reads;
* public day/point data included in public trip responses;
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

The public token never grants write capability.

### Public reads and optional authentication

Public read routes are explicit.

A route is not public merely because it lacks an authentication middleware.

Routes that support public reads use the optional-authentication boundary when viewer-specific state can be returned.

For an anonymous request:

```text
authenticated = false
actor = anonymous
```

No user, session, ownership identity, or default application user is created.

For a valid user access token, optional authentication resolves the current database user and may provide viewer-specific state such as `likedByMe` or `favoritedByMe`.

Backend authorization is always the final authority. Frontend visibility restrictions are never a security boundary.

## Authentication and authorization

Protected API requests use:

```http
Authorization: Bearer <USER_ACCESS_TOKEN>
```

The authentication boundary:

1. extracts the bearer value;
2. handles an absent bearer according to the production 404 behavior;
3. resolves `PUBLIC_FRONTEND_TOKEN` as anonymous;
4. otherwise verifies the value as a user access JWT;
5. rejects invalid JWTs using the existing unauthorized/404 behavior;
6. resolves the current user from the database;
7. applies the existing account-status authentication behavior;
8. uses the database row as the authority for current account status and role.

JWT claims do not override current database state.

Ownership and authorship always derive from the authenticated actor.

Never trust client-supplied:

* `ownerId`;
* `authorId`;
* user IDs;
* role values;
* account status.

Authorization is enforced server-side.

Admin and moderator permissions remain route-specific and role-based.

## Refresh authentication

Refresh tokens:

* are delivered through an HttpOnly cookie;
* are scoped to `/api/v1/auth`;
* are not returned in response bodies;
* use `Secure` in production;
* must remain protected from client-side JavaScript.

Production security settings must not be weakened through environment configuration.

## Configuration

`src/config/` reads and validates environment values.

Reusable defaults belong in `src/constants/`.

Examples:

* `src/constants/environment.ts`
* `src/constants/auth.ts`

Configuration modules must import reusable defaults rather than defining duplicate fallback constants locally.

The public frontend token default belongs in `src/constants/environment.ts`.

Authentication fallback values such as access-token TTL, refresh-token TTL, and authentication rate-limit defaults belong in `src/constants/auth.ts`.

Do not duplicate these values across configuration modules.

Never commit credentials, API keys, JWT secrets, SMTP passwords, GCS credentials, or other private environment values.

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

Multipart image uploads are handled by their route-specific Multer configuration.

The public bearer token is classified by the authentication boundary.

There is no separate custom public-token request header.

## Validation

Request schemas use strict validation where the route contract requires it.

Reject:

* undeclared body fields;
* undeclared query fields;
* undeclared route parameters;
* malformed IDs;
* invalid pagination;
* oversized request bodies;
* invalid image payloads.

Do not weaken strict validation to accommodate undocumented frontend behavior.

If a valid client contract requires a new field or query parameter, update the API contract and frontend integration together rather than silently accepting arbitrary input.

## Rate limiting

Rate limits are operational protections, not authentication.

The public API rate limit must not be treated as an authorization boundary.

Authentication and authorization must remain correct even if rate limiting is bypassed or unavailable.

Do not use forwarded IP headers directly for security decisions. Use Express-derived client identity according to the configured proxy topology.

## Security invariants

Preserve the following unless a task explicitly changes the contract:

* server-side authorization;
* server-side ownership checks;
* user role resolution from the database;
* registration anti-enumeration behavior;
* password re-authentication for password changes;
* HttpOnly refresh-token cookies;
* secure production cookies;
* bounded request bodies;
* strict request validation;
* API error contract;
* generic production 500 responses;
* no stack traces or database internals in API responses;
* route-not-found logging data minimization;
* server-generated image object keys;
* create-only GCS writes;
* EXIF stripping/re-encoding;
* image format and size limits;
* thumbnail generation;
* image ownership checks;
* transactional image attachment and cleanup.

## Images

The existing image architecture is authoritative.

Preserve:

* one image per upload request;
* maximum image count per entity;
* maximum upload size;
* Sharp byte-level validation;
* server-generated GCS object names;
* create-only GCS writes;
* sanitized/re-encoded image output;
* thumbnails;
* transactional attachment;
* cleanup on partial failure;
* ownership checks.

Do not use client filenames as storage object keys.

## Database

Use Prisma through the shared client.

User IDs remain UUID strings.

Resource IDs may use integer keys according to the existing Prisma model.

Do not infer production database state from `schema.prisma` alone.

Before changing a schema or migration, inspect the existing migration history and migration documentation.

## Changes requiring analysis first

Before changing any of the following, inspect callers and the current contract:

* routes;
* DTOs;
* validation schemas;
* authentication;
* authorization;
* ownership rules;
* cookies;
* rate limits;
* image storage;
* logging fields;
* proxy trust;
* Prisma models;
* migrations;
* public API behavior.

Do not perform unrelated cleanup or broad refactors as part of a focused task.

Do not edit generated `build/` output.

## Verification

Use the smallest appropriate verification for the change.

Available commands:

```bash
npm run build
npx tsc --noEmit
npm run lint
npm audit
npm audit --omit=dev
npm run migration:phase4:dry-run
npm run migration:phase4:verify
npm run db:clone-test:dry-run
```

Do not run destructive migration or database-clone commands without explicit authorization and confirmation that the target is disposable.

There is currently no automated application test suite configured. Do not recreate a removed test suite or add a testing dependency as an unrelated change.

## Documentation invariant

Documentation describes the current production contract.

The V6 public API contract is:

```text
x-hacktrip-client: web
Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>
```

Both headers are required for the anonymous/public Frontend API request.

The production authentication outcomes are:

```text
No Authorization
    -> 404

PUBLIC_FRONTEND_TOKEN
    -> anonymous

Valid USER_ACCESS_TOKEN
    -> authenticated user

Invalid USER_ACCESS_TOKEN
    -> existing unauthorized/404 behavior
       never anonymous

Valid JWT + suspended/deactivated user
    -> existing account-status authentication behavior
```

The public bearer token is public, non-secret, copyable, and never represents a user identity or authorization credential.

The public bearer token is never passed to JWT verification.

The documentation must describe implemented production behavior directly.

Do not describe the V6 contract as future work, a migration plan, a transitional mechanism, a WIP state, or a planned frontend change.

Do not document `x-hacktrip-public-token` as part of the production API contract.

When implementation and documentation are changed together, implementation, frontend integration, and documentation must describe the same current production behavior.

## Trip discovery, user-specific trips, favorites, backgrounds, and reports

### Top 5 trips

The Top 5 trips endpoint is a public read and may be requested by an anonymous context.

It:

* does not accept a `userId` route parameter;
* returns at most 5 trip groups;
* ranks trip groups by the total number of likes for each trip group;
* uses the trip-group ID as the grouping identity;
* if fewer than 5 trip groups are available, returns only the available trip groups;
* does not require an authenticated user;
* preserves the normal public trip response structure for the returned trip groups.

Ties in like counts do not require an application-level tie-break rule unless the API contract explicitly defines one. Database ordering may determine the order of equally ranked groups.

### My Trips

My Trips is a protected user-specific read.

The endpoint must not accept a client-supplied `userId` in the request URL for determining ownership.

The authenticated user is determined exclusively from the authenticated request context. The backend then returns trip groups whose ownership belongs to that authenticated user, with the normal trip response structure.

Never trust a user ID supplied by the frontend to determine which trips belong to the authenticated user.

### My Favorites

My Favorites is a protected user-specific read.

The endpoint must not accept a client-supplied `userId` in the request URL for determining the requesting user.

Favorites are stored per user and trip group. The backend uses the authenticated user identity to read that user's actual favorite records and resolves the corresponding trip groups.

The `favorites` persistence relationship is: `favorites.userId` -> authenticated user; `favorites.tripGroupId` -> trip group.

Only trip groups represented by actual favorite records for the authenticated user may be returned. If the authenticated user has no favorites, the endpoint returns the contract-defined empty collection rather than treating all trips as favorites.

Never trust a client-supplied user ID to determine favorite ownership.

### Background images

Background images are public data and may be requested by an anonymous context.

Background image filenames are stored in Google Cloud Storage and are not database records.

The slow dynamic configuration refresh is responsible for loading the current background-image filename list from the configured GCS bucket. A successful refresh replaces the in-memory configured list with the newly loaded list.

If a GCS refresh fails:

* the failure must not break application startup;
* the failure must not break a later dynamic-config refresh;
* if a previous successful list exists, it remains in use;
* the failure is logged at `warn` level as appropriate.

The background-image service owns selection of a random background from the currently available dynamic-config list. Controllers remain thin and return the service result as JSON; controllers must not query GCS, implement random selection, or perform response mapping.

The public background-image endpoint uses the normal public Frontend authentication contract:

    x-hacktrip-client: web
    Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>

The response contains one ready-to-use background image value for the Frontend, rather than the complete GCS filename list.

External GCS access belongs behind the appropriate backend service/client boundary. Do not access GCS directly from controllers or duplicate GCS listing logic in multiple request paths.

### Reports

Reports are user-generated moderation records for content such as trips and comments.

Authenticated users may create reports according to the API contract. Anonymous/public context cannot create reports.

Administrative report access is restricted to the roles authorized by the API contract, currently manager/admin moderation access.

The backend must support moderation workflows for reported trips and reported comments, including:

* listing/retrieving reports for administrative triage;
* identifying the reported resource and report context;
* deleting/removing a report as part of the moderation workflow.

Trip reports and comment reports remain distinguishable by their reported resource/type even if the API exposes them through a unified administrative reports endpoint.

Report creation and report removal are separate authorization-sensitive operations. Do not allow a normal authenticated user to access administrative report triage or delete arbitrary reports.

Administrative report operations must enforce role authorization server-side; Frontend route visibility is not a security boundary.
