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
| Auth           | `POST /auth/register`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/confirm-password`, `/auth/forgot-password`, `/auth/reset-password`; `GET /auth/session`, `/auth/me`, `/auth/me/image`; `PUT /auth/me`, `/auth/me/password`; `POST /auth/me/image`; `DELETE /auth/me/image` |
| Admin          | `GET /admin/users`; `PUT` and `DELETE /admin/users/:userId`; `GET /admin/failed-login-logs`; `DELETE /admin/failed-login-logs`; `GET /admin/route-not-found-logs`; `GET /admin/images/cloud`, `/admin/images/database`, `/admin/images/orphans`                                                                            |
| Config         | `GET /config/selects`, `/config/services`                                                                                                                                                                                                                                                                                  |
| Comments       | `GET` and `POST /trip-groups/:tripGroupId/comments`; `/trips/:tripGroupId/days/:tripId/comments`; `/points/:pointId/comments`; `/images/:imageId/comments`; `PUT` and `DELETE /comments/:commentId`                                                                                                                              |
| Trips and days | `GET /trips`, `/trips/:tripGroupId`; `POST /trips`, `/trips/:tripGroupId/days`, `/trips/:tripGroupId/days/:tripId/images`; `PUT /trips/:tripGroupId/days/reorder`, `/trips/:tripGroupId/days/:tripId`; `DELETE /trips/:tripGroupId`, `/trips/:tripGroupId/days/:tripId` |
| Trip discovery/social | `GET /trips/top`, `GET /trips/background`; public discovery endpoints use the public Frontend token |
| Current-user trips/favorites | `GET /me/trips`, `GET /me/favorites`; authenticated user-specific endpoints resolve the user from authentication and do not accept a `userId` route parameter |
| Points         | `POST /points`; `GET /trips/:tripId/points`, `GET /points/:pointId`; `PUT` and `DELETE /points/:pointId`; `POST /points/:pointId/images`; `DELETE /points/:pointId/images/:imageId`; `PUT /days/:tripId/points/reorder`                                                                                                                                  |
| Images         | `DELETE /images/:imageId`                                                                                                                                                                                                                                                                                                  |
| Likes          | `POST` and `DELETE /likes`                                                                                                                                                                                                                                                                                                 |
| Favorites      | `POST` and `DELETE /favorites`                                                                                                                                                                                                                                                                                             |
| Reports        | `POST /reports`; `DELETE /reports/:reportId` (author withdraw); anonymous contexts cannot create reports                        |
| Admin reports | `GET /admin/reports`, `DELETE /admin/reports/:reportId`; moderation access is restricted to `admin` and `manager` |

Comments are mounted at the v1 root because their collections span several resource prefixes.

The comment 404 logger is scoped to `/comments`; other feature routers install their own scoped error and 404 middleware.

No legacy `/users`, `/data/*`, or root-level `/config` router is mounted by the current TypeScript entry point.

### Request and response models

Request bodies, queries, and route parameters are validated by Zod schemas under `src/validation/schemas/`.

Important DTO families include:

* `AuthSessionDto` contains a bearer access token and the public `ProfileDto` (email, names, optional `permissions`); refresh tokens are delivered only through an HttpOnly cookie.
* The three trip GET endpoints (`GET /trips`, `GET /trips/top`, `GET /trips/:tripGroupId`) use the shared Trip Group response structure defined in the Trip GET response contract below.
* Trip GET and trip write responses use the Trip Group response model described in the trip response sections. The response root contains only `id` (the trip-group id), server-computed `permissions`, global `social`, and `days[]`; day-specific metadata belongs inside each Day.
* `CommentListResponse` is paginated.
* Comment writes use `{ comment }`; authorship comes from the authenticated actor.
* `ImageDto` contains `id`, `url`, and `thumbnailUrl`; storage object paths are not exposed as the API image contract.
* Social mutations identify a target using target type and ID; the acting user comes from authentication.
* Admin lists return bounded items with pagination metadata.
* Configuration responses use the application configuration models.

API-facing services return prepared response contracts through API mappers. Controllers do not reconstruct DTOs.

## Trip GET response structure (three endpoints)

The following three GET endpoints use the same Trip Group response structure:

```text
GET /api/v1/trips
GET /api/v1/trips/top
GET /api/v1/trips/:tripGroupId
```

A **Trip Group** is only the grouping container. It does not have its own title, description, group, transport, author, cover image, or other day metadata.

The `tripGroupId` identifies the trip group. All `trips` rows belonging to that `tripGroupId` are returned as `days[]`.

A missing day number is not generated. For example, a trip group may contain exactly Day 1, Day 3, and Day 5.

### Shared response shape

For `GET /trips` and `GET /trips/top`:

```json
[
  {
    "id": 123,
    "permissions": { "canEdit": false, "canDelete": false },
    "social": SocialState,
    "days": [ TripGroupDay ]
  }
]
```

For `GET /trips/:tripGroupId`:

```json
{
  "id": 123,
  "permissions": { "canEdit": false, "canDelete": false },
  "social": SocialState,
  "days": [ TripGroupDay ]
}
```

The trip-group identifier is serialized as the `id` field of the response root; there is no `tripGroupId` field in the response JSON.

### TripGroupDay

```json
{
  "id": 0,
  "dayNumber": 1,
  "permissions": { "canEdit": false, "canDelete": false },
  "title": null,
  "description": null,
  "price": 0,
  "countPeoples": 1,
  "destination": null,
  "lat": null,
  "lng": null,
  "currency": {
    "id": 0,
    "code": "<string>",
    "name": "<string>"
  },
  "transport": {
    "key": "<string>",
    "name": "<string>"
  },
  "group": {
    "key": "<string>",
    "name": "<string>"
  },
  "images": [ SocialImageDto ],
  "social": SocialState,
  "points": [ TripPoint ],
  "createdAt": null,
  "updatedAt": null
}
```

The complete `TripGroupDay` response contains the public day-level fields from the `trips` database row: `id`, `dayNumber`, `permissions`, `title`, `description`, `countPeoples`, `destination`, `lat`, `lng`, `price`, `currency`, `transport`, `group`, `images`, `social`, `points`, `createdAt`, and `updatedAt`.

These fields belong to `days[]`, not to the Trip Group root. The grouping identifier is exposed only as `TripGroupResponse.id` at the response root (next to `permissions` and `social`); `permissions` is the server-computed edit/delete right of the requesting actor.

The `currency` object is resolved from backend configuration and is returned as:

```json
{
  "id": 22,
  "code": "BGN",
  "name": "Bulgarian Lev"
}
```

The Frontend displays `code` (for example `BGN`) and may use `name` as the hover/tooltip text. Currency options are not hard-coded in the Frontend.

Day images keep the existing `SocialImageDto` structure:

```json
{
  "id": 0,
  "url": "<url>",
  "thumbnailUrl": "<url>",
  "social": SocialState
}
```

Points use the following public `TripPoint` structure. Field names follow the database/API contract naming; coordinates use `lat`/`lng`, not `latitude`/`longitude`. `tripId` is the day row the point belongs to (`points.tripId` = `trips.id`). Internal fields `countEdited` and `ownerId` are excluded; `createdAt`/`updatedAt` are returned as ISO strings.

```json
{
  "id": 2001,
  "name": "Point title",
  "description": "Point description",
  "lat": 42.6975,
  "lng": 23.3241,
  "pointNumber": 1,
  "tripId": 1001,
  "images": [ SocialImageDto ],
  "permissions": {
    "canEdit": true,
    "canDelete": true
  },
  "social": SocialState
}
```

`pointNumber` is a JSON number: the column is a signed INT managed entirely by the backend.

`permissions` is server-computed per request from the resource owner and the authenticated actor; anonymous callers receive `canEdit: false` and `canDelete: false`.

`ownerId` is intentionally excluded from both Day and Point API responses. It remains server-side ownership data and must never be serialized to the Frontend.

Social state is present at:
* trip-group level;
* day level;
* point level;
* image level.

The existing `SocialState` structure is unchanged.

Days are ordered by `dayNumber` ascending, with `id` ascending as the tie-break. Points remain ordered by numeric `pointNumber`.

The endpoint-level contracts of these reads — query parameters, pagination, the Top-5 like ranking, and error statuses — are defined in `docs/API_CONTRACT.md` §8 and are not repeated here.

### GET /trips/:tripGroupId

* Auth: `optionalAuthentication`.
* Path parameter `tripGroupId` is the `trip_groups.id` (INT, autoincrement), not a day row id.
* Missing trip group -> `404 TRIP_NOT_FOUND`.
* Response `200`: one `TripGroupResponse`.
* The response always contains the complete trip group: `id` (the trip-group id), `permissions`, trip-group `social`, and all of its `days[]`.
* If the Frontend opens a specific day, it may select that day from the returned `days[]`, but the backend still returns the complete trip group.
* Missing trip group -> `404 TRIP_NOT_FOUND`.

All three endpoints therefore share the same nested data model; only the cardinality differs:
* `/trips` -> array of trip groups;
* `/trips/top` -> array of up to 5 trip groups;
* `/trips/:tripGroupId` -> one trip group.


## Trip and point write endpoints

Trip groups are grouping containers only. A trip group has no title, description, transport, group, price, currency, or day content of its own. Those fields belong to individual days (`trips` rows). The trip group owns only its global social state and connects its days through `trips.tripGroupId`.

Write-side architecture rules:

* `POST /api/v1/trips` creates the trip group plus its initial day row in one Prisma create: if the day row cannot be written, the trip group is not created either. `dayNumber` is required and user-selected; the server never defaults it.
* Trip metadata written by `POST /api/v1/trips` is stored on the canonical (lowest `dayNumber`) day row of the group; `POST /api/v1/trips/:tripGroupId/days` inherits the canonical day's group/transport values.
* A day is addressed by its `trips` row id. There is no `PUT /api/v1/trips/:tripGroupId`: the group itself has no editable metadata.
* Day writes (`POST .../days`, `PUT .../days/:tripId`) answer with the complete `TripGroupResponse` of the group after the change; day reorder answers with `TripDay[]`.
* Point writes answer with the complete `TripPoint[]` collection of the affected day, in `pointNumber` order. `pointNumber` is server-generated (`max(existing pointNumber) + 1` on create, renumbered on reorder/delete) and is never accepted from the client.
* Deletes remove image objects from storage before the database transaction starts, so a storage failure leaves the database untouched; the row deletes run the social cleanup of "Social cleanup on resource deletion" inside the same transaction.

The endpoint-level contracts (request bodies, validation, statuses, response examples) are defined in `docs/API_CONTRACT.md` §8–§11 and are not repeated here.

## Social cleanup on resource deletion

No delete flow leaves a polymorphic social record behind that points at a resource that no longer exists. The cleanup is centralised in `src/repositories/polymorphicTargets.ts` (`deleteSocialRecordsForTargets`) and runs inside the same database transaction as the resource row delete it belongs to.

The resource hierarchy is:

```text
TRIP_GROUP
    └── DAY
          └── POINT
                └── IMAGE
```

Deleting a resource removes the social records of every level that is being removed:

| Delete | Social records removed |
| ------ | ---------------------- |
| `DELETE /api/v1/images/:imageId`, `DELETE /api/v1/points/:pointId/images/:imageId` | the image's (likes/comments/reports and any future relationship) |
| `DELETE /api/v1/points/:pointId` | the point's and every image's of that point |
| `DELETE /api/v1/trips/:tripGroupId/days/:tripId` | the day's, its points' and all of their images' |
| `DELETE /api/v1/trips/:tripGroupId` | the trip group's, its days', points' and images' |
| `DELETE /api/v1/comments/:commentId` | the reports targeting the comment |

Favorites are trip-group scoped (`favorites.tripGroupId`, FK NO ACTION). They are removed by the same cleanup before the trip group row is deleted, so a favorite can never survive as an orphan and can never block a group delete. Profile image removal and profile image replacement delete the replaced image's social records the same way.

The cleanup is registry driven: every social relationship registers one batch deleter in `SOCIAL_RELATION_DELETERS`. A new social feature is integrated by adding its deleter there; the resource delete flows remain unchanged. All cleanup queries are batched (one `deleteMany` per relationship with a single `(targetTypeId, targetId IN (...))` filter), so deleting a day with many points and images does not issue per-row deletes.

Comments removed by the cleanup are themselves report targets: their reports are collected and deleted in the same pass. This cascade is the one structural addition a relationship needs beyond its own batch deleter.

The storage order is unchanged: image objects are removed from the bucket before the database transaction starts, so a storage failure leaves the database (and its social state) untouched.

## Session presence probe

The backend exposes the read-only session-presence endpoint:

```text
GET /api/v1/auth/session
```

This endpoint exists so the Frontend can determine whether the browser currently has a valid refresh session before deciding whether to call `POST /api/v1/auth/refresh` after a page reload.

The request uses the normal public Frontend request contract:

```http
x-hacktrip-client: web
Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>
```

The request must be sent with credentials enabled so the browser may include the HttpOnly `hack_trip_refresh` cookie.

Architecture and security requirements:

* the endpoint is read-only;
* it must not rotate, revoke, create, or modify refresh tokens;
* it must not return an access token, refresh token, user id, email, role, account status, or other user/account data;
* the response does not use access-token identity to determine session presence and does not return user/account data. The route uses `optionalAuthentication`: the public frontend token is sufficient; when a user access JWT is supplied, the shared boundary validates it and attaches the actor to the request, but the probe result still depends only on the refresh cookie;
* it returns only whether the current browser request has a valid refresh session;
* absent and invalid sessions use the same response shape and do not reveal why the session is unavailable;
* it does not require a user access JWT, but the shared boundary rejects a missing `Authorization` bearer;
* the response is exactly one boolean session-presence value, for example `{ "hasSession": true }` or `{ "hasSession": false }`;
* `hasSession: false` must never cause the Frontend to call `POST /api/v1/auth/refresh`;
* `hasSession: true` only permits the Frontend to intentionally start the normal refresh flow;
* the endpoint is protected by the normal public API rate limit;
* the public bearer token remains non-secret and is never treated as proof of a user session.

The endpoint is specifically designed to separate anonymous public-page refresh from authenticated session restoration without exposing the HttpOnly refresh cookie to client-side JavaScript and without using `localStorage` or `sessionStorage` as authentication/session state.

The request flow is:

```text
public page reload
    ->
GET /api/v1/auth/session
    ->
{ hasSession: false }
    ->
remain anonymous
    ->
no POST /api/v1/auth/refresh
```

or, when a valid refresh session exists:

```text
public page reload
    ->
GET /api/v1/auth/session
    ->
{ hasSession: true }
    ->
intentional POST /api/v1/auth/refresh
    ->
memory-only access token
```

The session-presence endpoint does not replace the refresh endpoint. It only provides a safe read-only decision point before refresh.

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
### Dynamic background-image configuration

The existing `refreshSlow()` lifecycle also loads the available background-image object names from Google Cloud Storage.

The background-image list is not stored in MySQL. Its source is the GCS bucket:

```text
hack-trip-background-images
```

The refresh lifecycle is:

```text
refreshSlow()
    ->
background-image storage service/adapter
    ->
Google Cloud Storage
    ->
list object names
    ->
dynamic configuration
```

Rules:

* background-image names are loaded through the existing `refreshSlow()` lifecycle;
* a successful refresh replaces the current in-memory list with the newly loaded list;
* a failed refresh does not clear a previously successful list;
* background-image discovery failure must not fail application startup or a later slow refresh;
* failures are logged at `warn` level;
* the last successful list remains available until a later successful refresh;
* request-path code does not call GCS for every background request;
* the list is runtime configuration/cache data, not a database entity.

A dedicated background-image storage service/adapter owns GCS access. Controllers do not access Google Cloud Storage directly.

The request path is:

```text
GET /api/v1/trips/background
    ->
authentication boundary
    ->
background-image service
    ->
dynamic configuration list
    ->
random selection
    ->
controller
    ->
JSON
```

The service reads the cached dynamic configuration, selects one available object at random, and prepares the public value returned to the controller. The controller returns JSON only; it does not access GCS, read storage directly, perform random selection, or perform response mapping.

The endpoint is public/anonymous and follows the existing public Frontend request contract:

```http
x-hacktrip-client: web
Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>
```

The public token establishes no user identity or ownership.

If no successful background-image list has ever been loaded and the cached list is empty, the service follows the API contract's defined error behavior rather than fabricating an image URL.

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

Request validation runs in two layers.

The first layer is the request boundary: strict Zod schemas under `src/validation/schemas/` validate the request body, query, and route parameters, reject undeclared fields, and hand the parsed values to the rest of the chain.

Numeric typing rules of the Zod layer:

* JSON-body numeric fields (`dayNumber`, `tripId`, `targetId`, `tripGroupId`, `lat`, `lng`, reorder id lists) accept true JSON numbers; numeric strings and booleans are rejected, and integer fields reject fractions. `null` is accepted only where the specific schema explicitly permits it (for example, `lat`/`lng` in `PUT /points/:pointId` to clear coordinates).
* Query schemas (`page`, `limit`, `pageSize`, and the DELETE target ids) parse their string values into numbers.
* Route parameters are validated as digit strings (positive integer ids) or UUID strings (`userId`).

The second layer is the service boundary: domain parsers under `src/utils/` (`trip.ts`, `point.ts`, `social.ts`, `validation.ts`) re-read the validated request parts, resolve dynamic-config select values, and reject client-controlled ownership, parent, and sequence fields.

Validation covers request bodies, query parameters, route parameters, identifiers, pagination, request size, and image payloads. Generic parsing remains separate from domain/business validation, and business rules remain in services rather than in validation schemas or mappers.

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

### Background-image discovery

Background-image discovery is a separate read-only GCS integration from the uploaded trip/point/profile image flow.

The dynamic-configuration service requests object names from the background-image storage adapter. It does not create database records for these objects and does not download image bytes during refresh.

The adapter:

* uses the configured GCS client;
* lists object names from `hack-trip-background-images`;
* returns object names to the dynamic-configuration service;
* propagates discovery failures so the refresh layer can preserve the previous successful value and emit a warning;
* is never called directly by an HTTP controller.

The public background value is prepared by the background-image service from the cached object name and the configured/public storage URL rules.

### Image processing

Sharp performs image decoding, validation, sanitization, re-encoding, and thumbnail generation.

Multipart upload parsing is performed by Multer 2.

The image storage flow preserves ownership and cleanup guarantees.

### Email

Nodemailer provides authentication email delivery.

Verification and password-reset emails use environment-provided SMTP configuration.

Development mail transport may write generated messages to the operating-system temporary directory.

## User-specific reads and reports

### User-specific trip discovery

`GET /api/v1/me/trips`:

* requires authenticated user context;
* does not accept a `userId` route parameter, query parameter, or body field;
* resolves the current user exclusively from the authenticated request context;
* returns only trip groups owned by that authenticated user;
* uses the authenticated user's UUID only server-side for ownership filtering;
* returns raw `TripGroupResponse[]`;
* uses exactly the same unified trip-group response structure as `GET /trips`, `GET /trips/top`, and `GET /trips/:tripGroupId`;
* serializes only `id` (the trip-group id), server-computed `permissions`, trip-group `social`, and the existing `days[]` structure;
* never serializes `userId`, `ownerId`, or an author/owner object;
* never uses a client-supplied user id to establish ownership;
* returns `200 []` when the authenticated user owns no trip groups.

`GET /api/v1/me/favorites`:

* requires authenticated user context;
* does not accept a `userId` route parameter, query parameter, or body field;
* resolves the current user exclusively from the authenticated request context;
* reads the authenticated user's persisted `Favorite` records server-side;
* favorites are associated with `tripGroupId`;
* resolves the corresponding trip groups/trips from those persisted favorite relationships;
* returns raw `TripGroupResponse[]`;
* uses exactly the same unified trip-group response structure as `GET /trips`, `GET /trips/top`, and `GET /trips/:tripGroupId`;
* serializes only `id` (the trip-group id), server-computed `permissions`, trip-group `social`, and the existing `days[]` structure;
* never serializes `userId`, `ownerId`, or an author/owner object, including the owner id of a favorited trip created by another user;
* never serializes the authenticated user's UUID or favorite-record ownership fields;
* never accepts a client-supplied user id to retrieve another user's favorites;
* returns `200 []` when the authenticated user has no favorites.

Both endpoints return `TripGroupResponse[]` and share the normal trip response preparation after their repository queries. Controllers remain thin HTTP adapters; services enforce current-actor ownership/favorite relationships, and user/owner IDs are never serialized.

### Top trips

`GET /api/v1/trips/top` is public and may be requested anonymously with the public Frontend bearer token.

Initial ranking rules:

* count likes for each `TripGroup`;
* select at most 5 trip groups;
* order by descending like count;
* return fewer than 5 when fewer than 5 trip groups exist;
* equal like counts have equal ranking semantics and are not a business-level distinction;
* return the normal trip response structure rather than the legacy `/top/:id` representation.

The ranking is based on persisted social data and is independent of the requesting user.

### Reports and moderation

Reports are created by authenticated users and persisted as report records targeting supported resources.

The moderation boundary is separate from report creation:

* `POST /api/v1/reports` creates a report for the authenticated actor;
* `DELETE /api/v1/reports/:reportId` lets the report's author withdraw their own report; it is separate from the moderation queue;
* `GET /api/v1/admin/reports` lists persisted reports for moderation triage;
* `DELETE /api/v1/admin/reports/:reportId` removes a report record;
* report listing and admin deletion are restricted to `admin` and `manager`;
* ordinary users cannot read or delete the moderation queue.

Report authorization is role-based and independent from ownership of the reported target. Exact target types, duplicate-report behavior, DTOs, pagination, and error responses remain defined by the API contract.

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
* deleting a resource removes every social record targeting it and its descendants in the same database transaction;
* API mappers perform transformation only;
* persistence mapping remains separate from API mapping;
* request-path Prisma access uses the shared Prisma client;
* image object keys are server-generated;
* image writes are create-only;
* image processing sanitizes and re-encodes accepted images;
* API errors do not expose internal implementation details;
* generated `build/` output is not source code.

This document describes the current production architecture and contract. It does not describe migration plans, temporary implementation states, obsolete API mechanisms, or planned frontend changes.
