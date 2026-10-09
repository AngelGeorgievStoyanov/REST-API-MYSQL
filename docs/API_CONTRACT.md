# HackTrip Backend API Contract

This document is the authoritative, finalized production API contract of the HackTrip backend, derived from the current implemented source code (`feature/backend-modernization`) plus the explicitly defined API additions in this contract. It describes the backend API behavior and the rules that the Frontend and Backend must follow.

Repository source code is authoritative for implementation details. This document is the authoritative API contract between Frontend and Backend.

The documented production request path is:

```text
Frontend -> Nginx -> Express -> middleware -> Controller -> Service -> Repository -> Prisma -> MySQL
```

All API endpoints live under the versioned prefix:

```text
/api/v1
```

---

## 1. Global API Rules

### 1.1 Client marker header

Every Frontend API request to `/api/v1` must carry the client marker header. This applies to every endpoint, including every authentication endpoint (`register`, `login`, `verify-email`, `resend-verification`, `forgot-password`, `reset-password`, `refresh`, `logout`, `me`, and all profile endpoints). It is required independently of `Authorization`:

```http
x-hacktrip-client: web
```

This is a public, copyable request-shape filter — NOT authentication and NOT authorization.

* A request without this header to a `/api/v1` or `/api/v1/...` path is answered with `404` and the standard API error body `{ "error": { "code": "NOT_FOUND", "message": "Resource not found." } }`.
* A request without this header to a non-`/api/v1` path is answered with an empty `404` body (`.end()`).
* `OPTIONS` (CORS preflight) cannot carry custom headers, so it bypasses this filter and is handled by CORS.

### 1.2 Public frontend bearer token

The anonymous/public Frontend context uses:

```http
Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>
```

* Default value: `hacktrip-public-v1` (overridable via `PUBLIC_FRONTEND_TOKEN`).
* The token is public, non-secret, copyable, and is not a JWT, a user credential, a session, or an ownership identity.
* It is compared by raw string equality only and is never passed to JWT verification.
* It grants anonymous, read-only access only; it grants no user, session, or ownership identity and no write capability.
* **Every public/anonymous GET endpoint defined by this contract requires this bearer token.**
* The Frontend must send the public token even when the visitor is completely anonymous.
* The public token must never be treated as evidence of a logged-in user.

### 1.3 CORS

* Production origins: `https://hack-trip.com`, `https://www.hack-trip.com`.
* Development origin: `http://localhost:3000` (only outside production).
* Methods: `GET,POST,PUT,DELETE`.
* Allowed headers: `x-hacktrip-client`, `Content-Type`, `Authorization`.
* `credentials: true` (the refresh-token cookie is HttpOnly and requires credentialed cross-origin requests).

### 1.4 Security headers

* `X-Powered-By` is disabled.
* HSTS: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.
* Proxy trust: 1 hop (`trust proxy = 1`).

### 1.5 Request body limits

* JSON: `1mb`.
* URL-encoded: `100kb` with `parameterLimit: 1000`.
* Multipart (images only): handled by a route-specific Multer configuration; one binary part, `25 MB` per file (see Images).

### 1.6 Rate limits

Public API rate limit (applied to everything under `/api`):

* Fixed window `60s`, `120` requests per client IP.
* Exceeding it produces `403` with error code `FORBIDDEN` (the contract has no `429`).

Authentication rate limit (applied only to auth endpoints):

* Default window `15 * 60s` (900s), default `10` attempts per window for credential/token endpoints (`register`, `verify-email`, `login`, `refresh`, `confirm-password`, `change-password`, `reset-password`).
* Default `5` attempts per window for email-sending endpoints (`resend-verification`, `forgot-password`).
* Exceeding it produces `403` with error code `FORBIDDEN`.
* Keyed by client IP + route bucket. Values are configurable via `AUTH_RATE_LIMIT_WINDOW_SECONDS`, `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_EMAIL_MAX`.

Administrative rate limit (applied to every admin endpoint):

* `120` requests per window per client IP (window = auth rate-limit window, default 900s).
* Exceeding it produces `403 FORBIDDEN`.

### 1.7 Validation model

* Request validation uses Zod with `.strict()` on every body/params/query schema: undeclared body fields, query parameters, and route parameters are rejected with `400 VALIDATION_ERROR`.
* Endpoints that declare no body/query/params must receive an empty corresponding part; a non-empty undeclared part is rejected with `400 VALIDATION_ERROR`.
* A rejected request is `400` with code `VALIDATION_ERROR` and a message naming the offending field. At most 3 issues are reported per validation failure.
* Numeric fields in a JSON body must use actual JSON numbers; numeric strings and booleans are rejected. Integer fields reject fractional values. `null` is rejected unless that specific schema explicitly allows it (for example, `lat` and `lng` in `PUT /points/:pointId`, where `null` clears the coordinate).
* Numeric query parameters arrive as strings and are parsed to numbers by their query schemas; route parameters are validated as digit strings (positive integer ids) or UUID strings (`userId`).
* Validated request parts are handed to the service layer, which re-reads them through its own domain parsers (dynamic-config select resolution, rejection of client-controlled ownership/parent/sequence fields) before persistence.

### 1.8 Strictness summary

* All request bodies are `.strict()`: unknown JSON keys are rejected.
* All query schemas are `.strict()`: unknown query parameters are rejected.
* All route-parameter schemas are `.strict()`.

---

## 2. Authentication Contract

### 2.1 Access token

* Type: JWT (HS256).
* Secret: `JWT_ACCESS_SECRET` (required; the API refuses to start without it).
* Payload claims: `{ sub: <userId>, type: 'access' }`.
* `sub` is the user id (UUID string). Role and status are NOT taken from token claims; they are always read from the database row.
* Expiry: `ACCESS_TOKEN_EXPIRES_IN` seconds; default `900` (15 minutes).

### 2.2 Refresh token

* Type: opaque random token, 32 bytes hex-encoded = 64 characters.
* Only its SHA-256 hash is stored in the database (`refresh_tokens.tokenHash`).
* Delivered via an HttpOnly cookie and never in a response body.

Refresh cookie:

| Property   | Value                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| name       | `hack_trip_refresh`                                                                      |
| HttpOnly   | `true`                                                                                   |
| Secure     | `true` in production (or when `COOKIE_SECURE=true`)                                      |
| SameSite   | `none` in production (default), `lax` in development; overridable via `COOKIE_SAME_SITE` |
| Path       | `/api/v1/auth`                                                                           |
| Expiration | `refreshTokenExpiresAt` (now + `REFRESH_TOKEN_EXPIRES_IN` seconds)                       |
| maxAge     | `REFRESH_TOKEN_EXPIRES_IN * 1000` ms                                                     |

`REFRESH_TOKEN_EXPIRES_IN` default: `2592000` seconds (30 days).

Rotation behavior:

* Every successful `login` and `refresh` issues a NEW refresh token (the old one is revoked on refresh).
* A `refresh` that finds a token whose `revokedAt` is already set treats it as REUSE: all active refresh sessions of that account are revoked, and the request is answered with `401 UNAUTHORIZED` (message "The refresh session was already revoked. All sessions of this account were revoked.").
* An expired refresh token is `401 UNAUTHORIZED` ("The refresh session has expired.").
* A missing/unknown refresh token is `401 UNAUTHORIZED` ("The refresh session is not valid.").

### 2.3 Account status rules (enforced on every authenticated request and every login/refresh)

* `PENDING_VERIFICATION` or `emailVerifiedAt === null`: `403 EMAIL_NOT_VERIFIED`.
* `SUSPENDED`: `403 ACCOUNT_SUSPENDED`.
* `DEACTIVATED`: `403 ACCOUNT_DEACTIVATED`.
* Missing user (valid token but account deleted): `401 UNAUTHORIZED`.

### 2.4 Email / password-reset tokens

* Email verification token TTL: `86400` seconds (24h).
* Password reset token TTL: `3600` seconds (1h).
* Tokens are one-time; only the SHA-256 hash is stored.

### 2.5 Auth email links

The emailed verification and password-reset links are constructed as `<appUrl><path>?token=<rawToken>` (the raw token is URL-encoded).

* `appUrl` = `AUTH_APP_URL` (default `https://www.hack-trip.com`; trailing slash trimmed).
* Verification path = `AUTH_VERIFY_EMAIL_PATH` (default `/verify-email`).
* Password-reset path = `AUTH_PASSWORD_RESET_PATH` (default `/reset-password`).
* A leading `/` is added to the path when it is not already present.

The raw token only appears inside the email sent to the account owner; it is never logged or returned in an API response.


### 2.6 Session presence probe

The Frontend may use the following read-only endpoint to determine whether the browser currently has a valid refresh session before deciding to call POST /auth/refresh:

```text
GET /auth/session
```

Request requirements:

```http
x-hacktrip-client: web
Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>
```

The request must be sent with credentials enabled so the browser may include the HttpOnly `hack_trip_refresh` cookie.

The endpoint:

* is read-only and must not rotate, revoke, create, or modify a refresh token;
* must not return an access token, refresh token, user id, email, role, account status, or other user/account data;
* The `hasSession` value is determined from the refresh cookie and its stored refresh-token/user state, not access-token identity; `optionalAuthentication` validates any supplied bearer before the handler, so an invalid/expired user JWT or unusable account may return `401`/`403` before the cookie probe runs.
* returns only whether the current browser request has a valid refresh session;
* returns the same response shape whether the session is absent or invalid, without exposing why it is unavailable;
* does not require a user access JWT, but the required `Authorization` header cannot be omitted because the shared boundary rejects a missing bearer.

Response:

```json
{ "hasSession": true }
```

or:

```json
{ "hasSession": false }
```

A `false` result must not cause POST /auth/refresh. A `true` result allows the Frontend to intentionally attempt the normal refresh flow.

The endpoint is protected by the normal public API rate limit and requires the public Frontend bearer token. The public token remains non-secret and is never treated as proof of a user session.

---

## 3. Headers

### 3.1 Required request headers

| Header              | Required                                                  | Value            | Purpose                |
| ------------------- | --------------------------------------------------------- | ---------------- | ---------------------- |
| `x-hacktrip-client` | Always (except `OPTIONS`)                                 | `web`            | Frontend client marker |
| `Authorization`     | At every authentication boundary (including public reads) | `Bearer <token>` | Bearer classification  |

### 3.2 Authentication outcomes (shared v1 boundary)

| Request state                                        | Result                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| No `Authorization` header                            | `404 NOT_FOUND` (never anonymous)                                                 |
| `Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>`      | Anonymous context on optional-auth routes; `401 UNAUTHORIZED` on protected routes |
| `Authorization: Bearer <USER_ACCESS_TOKEN>` (valid)  | Authenticated user context                                                        |
| Invalid/expired user access JWT                      | `401 UNAUTHORIZED` (never anonymous)                                              |
| Valid JWT + suspended/deactivated/unverified account | `403` with the relevant account-status code                                       |

The public token is never passed to JWT verification. An invalid user JWT is never downgraded to anonymous.

---

## 4. Error Contract

Errors emitted by the versioned API use the following JSON shape, including API route-not-found and rate-limit responses. The deliberate empty `404` for non-`/api/v1` paths with a missing client marker is the exception described in §1.1:

```json
{ "error": { "code": "<CODE>", "message": "<message>" } }
```

### 4.1 Error codes and HTTP status

| Code                    | HTTP | Notes                                                                                                              |
| ----------------------- | ---- | ------------------------------------------------------------------------------------------------------------------ |
| `VALIDATION_ERROR`      | 400  | Validation failures (incl. bad tokens, oversized/parse-failed bodies)                                              |
| `UNAUTHORIZED`          | 401  | Missing/invalid token, invalid credentials, account gone, refresh failures                                         |
| `FORBIDDEN`             | 403  | Role/ownership/authorization denial; rate limiting (no 429 in contract)                                            |
| `EMAIL_NOT_VERIFIED`    | 403  | Correct password but email unverified                                                                              |
| `ACCOUNT_SUSPENDED`     | 403  | Suspended account                                                                                                  |
| `ACCOUNT_DEACTIVATED`   | 403  | Deactivated account                                                                                                |
| `NOT_FOUND`             | 404  | Generic not found; also missing client header and missing Authorization on auth boundaries                         |
| `TRIP_NOT_FOUND`        | 404  | Trip (group) not found / ownerless trip during modification                                                        |
| `CONFLICT`              | 409  | Duplicate/conflict (image limit, last-day delete, duplicate report, user still owns content, duplicate day number) |
| `INTERNAL_SERVER_ERROR` | 500  | Unexpected errors (details logged server-side only)                                                                |

### 4.2 Status codes used

`200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `500`.

There is no `429`: rate limiting is reported as `403 FORBIDDEN`.

### 4.3 Body-parser failures

* `entity.too.large` -> `400 VALIDATION_ERROR` "The request body is too large."
* `entity.parse.failed` -> `400 VALIDATION_ERROR` "The request body is not valid JSON."
* `encoding.unsupported` -> `400 VALIDATION_ERROR` "The request body encoding is not supported."

---

## 5. Access Control Matrix

Roles: `user`, `admin`, `manager`.

* `MODERATOR_ROLES` = `admin`, `manager` (may modify any trip/day/point/image and perform admin reads + moderation).
* `ADMIN_ROLES` = `admin` (full account administration: user updates).
* `ADMIN_OR_MODERATOR_ROLES` = `admin`, `manager`.

Authorization model:

* `requireAuthentication`: bearer required; public token -> `401`; invalid token -> `401`; account status enforced; role is NOT checked.
* `optionalAuthentication`: bearer required; public token -> anonymous; valid token -> authenticated viewer; invalid token -> `401`; no bearer -> `404`.
* `requireRole([...roles])`: `requireAuthentication` + the database row's role must be in the given list, else `403 FORBIDDEN`.
* Ownership (`canModifyTrip`): the actor may modify a trip/day/point/image only when `ownerId === actor.id` OR the actor's role is `admin` or `manager`.

### 5.1 Matrix

| Endpoint                                  | Anonymous          | Authenticated                        | Owner | Manager | Admin |
| ----------------------------------------- | ------------------ | ------------------------------------ | ----- | ------- | ----- |
| GET `/auth/me`                            | NO (404/401)       | YES                                  | —     | —       | —     |
| GET `/auth/session`                       | YES (public token + cookie probe) | YES (valid JWT accepted; result remains cookie-based) | — | — | — |
| PUT `/auth/me`                            | NO                 | YES (self only)                      | —     | —       | —     |
| GET/POST/DELETE `/auth/me/image`          | NO                 | YES (self only)                      | —     | —       | —     |
| GET `/config/selects`                     | YES (public token) | YES                                  | —     | —       | —     |
| GET `/config/services`                    | YES (public token) | YES                                  | —     | —       | —     |
| GET `/trips`                              | YES (public token) | YES                                  | —     | —       | —     |
| GET `/trips/:tripGroupId`                          | YES (public token) | YES                                  | —     | —       | —     |
| GET `/trips/top`                     | YES (public token) | YES                                  | —     | —       | —     |
| GET `/trips/background`              | YES (public token) | YES                                  | —     | —       | —     |
| GET `/me/trips`                | NO                 | YES                                  | YES*  | —       | —     |
| GET `/me/favorites`            | NO                 | YES                                  | —     | —       | —     |
| POST `/trips`                             | NO                 | YES                                  | —     | —       | —     |
| DELETE `/trips/:tripGroupId`                       | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| POST `/trips/:tripGroupId/days`            | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| PUT `/trips/:tripGroupId/days/reorder`     | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| PUT `/trips/:tripGroupId/days/:tripId`     | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| DELETE `/trips/:tripGroupId/days/:tripId`  | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| POST `/trips/:tripGroupId/days/:tripId/images` | NO             | CONDITIONAL                          | YES   | YES     | YES   |
| GET `/trips/:tripId/points`               | YES (public token) | YES                                  | —     | —       | —     |
| GET `/points/:pointId`                    | YES (public token) | YES                                  | —     | —       | —     |
| POST `/points`                            | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| PUT `/points/:pointId`                    | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| DELETE `/points/:pointId`                 | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| POST `/points/:pointId/images`            | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| DELETE `/points/:pointId/images/:imageId` | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| PUT `/days/:tripId/points/reorder`         | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| DELETE `/images/:imageId`                 | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| GET (comments)                            | YES (public token) | YES                                  | —     | —       | —     |
| POST (comments)                           | NO                 | YES                                  | —     | —       | —     |
| PUT `/comments/:commentId`                | NO                 | CONDITIONAL (author/moderator)       | —     | YES     | YES   |
| DELETE `/comments/:commentId`             | NO                 | CONDITIONAL (author/moderator)       | NO    | YES     | YES   |
| POST/DELETE `/likes`                     | NO                 | YES                                  | —     | —       | —     |
| POST/DELETE `/favorites`                 | NO                 | YES                                  | —     | —       | —     |
| POST `/reports`                          | NO                 | YES                                  | —     | —       | —     |
| DELETE `/reports/:reportId`                | NO                 | CONDITIONAL (own report only)        | —     | CONDITIONAL (own report only) | CONDITIONAL (own report only) |
| GET `/admin/users`                        | NO                 | NO                                   | NO    | YES     | YES   |
| PUT `/admin/users/:userId`                | NO                 | NO                                   | NO    | PARTIAL (no role/password) | YES |
| DELETE `/admin/users/:userId`             | NO                 | NO                                   | NO    | YES     | YES   |
| GET/DELETE `/admin/failed-login-logs`     | NO                 | NO                                   | NO    | YES     | YES   |
| GET `/admin/route-not-found-logs`         | NO                 | NO                                   | NO    | YES     | YES   |
| GET `/admin/images/cloud`                 | NO                 | NO                                   | NO    | YES     | YES   |
| GET `/admin/images/database`              | NO                 | NO                                   | NO    | YES     | YES   |
| GET `/admin/images/orphans`               | NO                 | NO                                   | NO    | YES     | YES   |
| GET `/admin/reports`                      | NO                 | NO                                   | NO    | YES     | YES   |
| DELETE `/admin/reports/:reportId`         | NO                 | NO                                   | NO    | YES     | YES   |

`*` The authenticated actor is the owner being used to scope the result. The request does not contain a user id.

> CONDITIONAL on trip/day/point/image mutation endpoints means: the authenticated actor must be the trip-group owner OR have role `admin`/`manager`. On `PUT /comments/:commentId` and `DELETE /comments/:commentId` it means: the actor must be the comment author or a moderator (`admin`/`manager`); the trip-group owner has no special comment right beyond being the author or a moderator.

---

## 6. Auth Endpoints

All auth routes are mounted at `/api/v1/auth`.

> `Auth: none` in this section means no `Authorization` token is required. The `x-hacktrip-client: web` header is STILL required for every auth endpoint, exactly as for every other `/api/v1` endpoint (see §1.1).

### 6.1 POST `/auth/register`

* Auth: none. Rate-limited (`register` bucket).
* Body (strict): `{ email, password, firstName, lastName }`.
* Response `201`: `{ "message": "..." }` (`MessageResponse`).
* Anti-enumeration: an already-registered email and a successful registration return the same message ("If the address can be registered, verification instructions will be sent.").

### 6.2 POST `/auth/verify-email`

* Auth: none. Rate-limited (`verify-email` bucket).
* Body (strict): `{ token }`.
* Response `200`: `{ "user": ProfileDto }`.
* Errors: unknown/used/expired token -> `400 VALIDATION_ERROR`.

### 6.3 POST `/auth/resend-verification`

* Auth: none. Rate-limited (email, `resend-verification` bucket).
* Body (strict): `{ email }`.
* Response `200`: `{ "message": "..." }`.
* Anti-enumeration: unknown/verified accounts answer the same message.

### 6.4 POST `/auth/login`

* Auth: none. Rate-limited (`login` bucket).
* Body (strict): `{ email, password }`.
* Response `200`: `AuthSessionDto` and sets the refresh cookie.
* Errors: invalid credentials -> `401 UNAUTHORIZED`; suspended -> `403 ACCOUNT_SUSPENDED`; deactivated -> `403 ACCOUNT_DEACTIVATED`; unverified -> `403 EMAIL_NOT_VERIFIED`.

`AuthSessionDto`:

```text
{ "accessToken": "<jwt>", "tokenType": "Bearer", "expiresIn": 900, "user": ProfileDto }
```

### 6.5 POST `/auth/refresh`

* Auth: none (reads the refresh cookie). Rate-limited (`refresh` bucket). No body/query/params.
* Response `200`: `AuthSessionDto` and rotates (sets a new) refresh cookie.
* Errors: missing/unknown -> `401 UNAUTHORIZED`; expired -> `401 UNAUTHORIZED`; reuse -> `401 UNAUTHORIZED` (all sessions revoked); unusable account -> `403` account-status code. On refusal, the stale cookie is cleared.

### 6.6 POST `/auth/logout`

* Auth: none (reads the refresh cookie). No body/query/params.
* Response `200`: `{ "message": "Logged out." }` and clears the refresh cookie. Idempotent.

### 6.7 GET `/auth/me`

* Auth: `requireAuthentication`. No body/query/params.
* Response `200`: `{ "user": ProfileDto }`.

### 6.8 PUT `/auth/me`

* Auth: `requireAuthentication`.
* Body (strict): `{ firstName, lastName }`.
* Response `200`: `{ "user": ProfileDto }`.

### 6.9 POST `/auth/confirm-password`

* Auth: `requireAuthentication`. Rate-limited (`confirm-password` bucket).
* Body (strict): `{ password }`.
* Response `200`: `{ "valid": true|false }`.

### 6.10 PUT `/auth/me/password`

* Auth: `requireAuthentication`. Rate-limited (`change-password` bucket).
* Body (strict): `{ currentPassword, newPassword }`.
* Response `204` (empty). Revokes all refresh sessions of the account.
* Errors: wrong current password -> `401 UNAUTHORIZED`.

### 6.11 GET `/auth/me/image`

* Auth: `requireAuthentication`. No body/query/params.
* Response `200`: `ImageDto` or `null` (no profile image).

### 6.12 POST `/auth/me/image`

* Auth: `requireAuthentication`. Multipart upload (field `file`, exactly one file).
* Response `201`: `ImageDto`. Replaces any previous profile image (the previous file is removed).

### 6.13 DELETE `/auth/me/image`

* Auth: `requireAuthentication`. No body/query/params.
* Response `204` (empty). Error: no profile image -> `404 NOT_FOUND`.

### 6.14 POST `/auth/forgot-password`

* Auth: none. Rate-limited (email, `forgot-password` bucket).
* Body (strict): `{ email }`.
* Response `200`: `{ "message": "..." }` (anti-enumeration: "If the account exists, a password reset email was sent.").

### 6.15 POST `/auth/reset-password`

* Auth: none. Rate-limited (`reset-password` bucket).
* Body (strict): `{ token, password }`.
* Response `200`: `{ "message": "..." }`. Revokes all refresh sessions of the account.
* Errors: unknown/used/expired token -> `400 VALIDATION_ERROR`.

### 6.16 `ProfileDto` and `AuthUserDto`

The auth/profile endpoints return `ProfileDto` (inside `{ "user": ... }` and inside `AuthSessionDto`):

```json
{
  "email": "<string>",
  "firstName": "<string>",
  "lastName": "<string>",
  "permissions": { "isManager": true, "isAdmin": true }
}
```

* `permissions` is present only for `manager`/`admin` accounts; regular users receive no `permissions` field.
* `id`, `role`, `status` and verification state are NOT part of `ProfileDto`.

`AuthUserDto` is returned only by the admin user endpoints (`GET/PUT /admin/users`):

```text
{
  "id": "<uuid>",
  "email": "<string>",
  "firstName": "<string>",
  "lastName": "<string>",
  "role": "user" | "admin" | "manager",
  "status": "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED",
  "emailVerified": true | false
}
```

---

## 7. Config Endpoints

Mounted at `/api/v1/config`. Auth: `optionalAuthentication` (public token = anonymous; a valid user token is accepted but not required).

### 7.1 GET `/config/selects`

* Query/body/params: none.
* Response `200`: `SelectConfig[]`.

`SelectConfig`:

```json
{
  "id": 0,
  "key": "<string>",
  "name": "<string>",
  "isActive": true,
  "options": [
    { "id": 0, "selectTypeId": 0, "key": "<string>", "value": "<string>", "sortOrder": 0, "isActive": true }
  ]
}
```

### 7.2 GET `/config/services`

* Query/body/params: none.
* Response `200`: `PublicServiceConfig[]` (public-safe subset only).

`PublicServiceConfig`:

```text
{
  "id": 0,
  "key": "google_maps" | "mui" | "ui" | "visual" | "routing",
  "name": "<string>",
  "isActive": true,
  "configs": [
    { "id": 0, "serviceTypeId": 0, "key": "<string>", "value": "<string>", "type": "string"|"number"|"boolean"|"json", "isActive": true }
  ]
}
```

### Public service-config key whitelist

`GET /config/services` returns only the following per-service keys (from `src/mappers/publicConfigMapper.ts`). All other service-config rows are filtered out of the public response:

```text
google_maps:  map_width, map_height, zoom_control, gesture_handling,
              point_map_height, point_map_type_control
mui:          theme_direction
ui:           page_size_options, page_size_default
visual:       image_base_url, background_images_base_url, thumb_width,
              thumb_height, thumb_quality, thumb_fit, thumb_auto
routing:      home_path, login_path, not_found_path, verify_email_path
```

---

## 8. Trip Endpoints

Mounted at `/api/v1/trips`.

### Data model note (critical)

* A **Trip Group** = one `trip_groups` row. Its integer `id` is the `tripGroupId` used to associate its days.
* A **Day** = one `trips` row belonging to that trip group. The day row has its own integer `id`.
* `dayNumber` is the displayed/order number of the day and is not the day identifier.
* Trip Group itself has only group-level social state in the new GET response; day metadata belongs to each day row.
* `group` and `transport` are dynamic-config select values resolved to `{ key, name }`.
* `currency` is resolved from the dynamic-config `currency` select to `{ id, code, name }`.
* Days are returned in `dayNumber` ascending order (tie-break `id` ascending).
* Points within a day are returned in `pointNumber` ascending order (tie-break `id` ascending).

### Canonical TripGroupResponse structure

The following three public trip-group GET endpoints use the same unified TripGroupResponse structure. The authenticated `/me/trips` and `/me/favorites` reads and specified trip/day write endpoints reuse this canonical response shape as documented below:

```text
GET /api/v1/trips
GET /api/v1/trips/top
GET /api/v1/trips/:tripGroupId
```

A **Trip Group** is only the grouping container. It has no title, description, transport, group, currency, author, cover image, or other day metadata.

The **`tripGroupId`** identifies the grouping record. It is an integer database id. Every day in `days[]` belongs to that trip group through this id. In the response JSON the trip group is serialized as the `id` field of the `TripGroupResponse` root (next to `permissions` and `social`); there is no `tripGroupId` field in the response body.

Every day row must have a non-null `dayNumber`. Day numbers are explicitly selected and may contain gaps; the server does not generate or fill them automatically. For example, a trip group may contain Day 1, Day 3, and Day 5.

### Shared response shape

The following example uses an actor who can edit and delete the trip group. The backend computes `permissions` for the requesting actor; this value is passed consistently to the trip-group root, its days, and the nested points.

For `GET /trips` and `GET /trips/top`:

```json
[
  {
    "id": 123,
    "permissions": { "canEdit": true, "canDelete": true },
    "social": {
      "likes": 25,
      "likedByMe": true,
      "comments": { "count": 8 },
      "reportedByMe": false,
      "favorites": 3,
      "favoritedByMe": false
    },
    "days": [
      {
        "id": 1001,
        "dayNumber": 1,
        "permissions": { "canEdit": true, "canDelete": true },
        "title": "Day 1 title",
        "description": "Day description",
        "countPeoples": 2,
        "destination": "Sofia, Bulgaria",
        "lat": 42.6975,
        "lng": 23.3241,
        "price": 250,
        "currency": {
          "id": 22,
          "code": "BGN",
          "name": "Bulgarian Lev"
        },
        "transport": {
          "key": "car",
          "name": "Car"
        },
        "group": {
          "key": "friends",
          "name": "Friends"
        },
        "images": [
          {
            "id": 5001,
            "url": "<url>",
            "thumbnailUrl": "<url>",
            "social": {
              "likes": 5,
              "likedByMe": false,
              "comments": { "count": 2 },
              "reportedByMe": false
            }
          }
        ],
        "social": {
          "likes": 10,
          "likedByMe": false,
          "comments": { "count": 3 },
          "reportedByMe": false
        },
        "points": [
          {
            "id": 2001,
            "name": "Point title",
            "description": "Point description",
            "lat": 42.6975,
            "lng": 23.3241,
            "pointNumber": 1,
            "tripId": 1001,
            "createdAt": "2026-01-15T10:30:00.000Z",
            "updatedAt": "2026-01-20T14:45:00.000Z",
            "images": [
              {
                "id": 5002,
                "url": "<url>",
                "thumbnailUrl": "<url>",
                "social": {
                  "likes": 2,
                  "likedByMe": false,
                  "comments": { "count": 1 },
                  "reportedByMe": false
                }
              }
            ],
            "permissions": { "canEdit": true, "canDelete": true },
            "social": {
              "likes": 4,
              "likedByMe": false,
              "comments": { "count": 2 },
              "reportedByMe": false
            }
          }
        ],
        "createdAt": "2026-01-15T10:30:00.000Z",
        "updatedAt": "2026-01-20T14:45:00.000Z"
      }
    ]
  }
]
```

For `GET /trips/:tripGroupId`, the same `TripGroupResponse` object shape is returned instead of an array. Its `days` property contains the same `TripGroupDay` objects shown above; the literal string placeholder is not a response value.

### TripGroupDay

Each element of `days[]` represents one existing day row belonging to the trip group.

```text
{
  "id": 1001,
  "dayNumber": 1,
  "permissions": { "canEdit": true, "canDelete": true },
  "title": "Day 1 title",
  "description": "Day description",
  "countPeoples": 2,
  "destination": "Sofia, Bulgaria",
  "lat": 42.6975,
  "lng": 23.3241,
  "price": 250,
  "currency": {
    "id": 22,
    "code": "BGN",
    "name": "Bulgarian Lev"
  },
  "transport": {
    "key": "car",
    "name": "Car"
  },
  "group": {
    "key": "friends",
    "name": "Friends"
  },
  "images": [ SocialImageDto ],
  "social": SocialState,
  "points": [ TripPoint ],
  "createdAt": "ISO 8601 timestamp",
  "updatedAt": "ISO 8601 timestamp"
}
```

The `currency` object is resolved from the backend `currency` select options:

```json
{
  "id": 22,
  "code": "BGN",
  "name": "Bulgarian Lev"
}
```

The Frontend displays `code` and may use `name` as the hover/tooltip text. Currency options are loaded from the Backend; the Frontend must not hard-code the currency list.

The complete TripGroupDay response includes all public day-level data stored on the `trips` row that is part of the API contract: `id`, `dayNumber`, `permissions`, `title`, `description`, `countPeoples`, `destination`, `lat`, `lng`, `price`, `currency`, `transport`, `group`, `images`, `social`, `points`, `createdAt`, and `updatedAt`. `countEdited`, `tripGroupId`, and `ownerId` are not part of the public day response.

Field semantics:
* `countPeoples`: integer number of people for this day/trip row.
* `destination`: destination text stored on the day/trip row; nullable.
* `lat`: day/trip-level latitude; nullable.
* `lng`: day/trip-level longitude; nullable.
* These four fields belong to the day level (the `trips` row), not the trip-group level.
* `ownerId` is intentionally NOT part of the response. Ownership is resolved server-side and must never be serialized into the public TripGroup response.

Day images and point images keep the existing `SocialImageDto` structure:

```text
{
  "id": 5001,
  "url": "<url>",
  "thumbnailUrl": "<url>",
  "social": SocialState
}
```

Social state is present at:
* trip-group level;
* day level;
* point level;
* image level.

The trip-group social state is the global social state for the whole trip. In particular, trip-group likes, reports and favorites are scoped to the trip group, not to an individual day.

Day comments remain day-scoped. There is no separate day-independent comment count used for the trip-group like/favorite behavior.

Days are ordered by `dayNumber ASC`, with `id ASC` as the tie-breaker. Gaps in the `dayNumber` sequence are preserved; day numbers are never generated or defaulted by the server.

Points are ordered by `pointNumber ASC`, with `id ASC` as the tie-breaker.

### 8.1 GET `/trips`

* Auth: `optionalAuthentication`.
* Query: `page`, `limit`, `search`, `group`, `transport`, `sort`.
* Response `200`: raw `TripGroupResponse[]`.
* There is no `items` wrapper and no `pagination` object in the response.
* Query pagination/filtering is used only to select which trip groups are returned.

### 8.2 GET `/trips/top`

* Auth: `optionalAuthentication`.
* No query/body/params are required.
* Response `200`: raw `TripGroupResponse[]`.
* Returns at most 5 trip groups with at least one persisted like on the trip-group target; groups with zero trip-group likes are omitted by the query.
* Orders the returned groups by descending trip-group like count.
* May return fewer than 5 even when more than 5 trip groups exist, if fewer than 5 groups have at least one group-level like.
* Tie ordering is not guaranteed because the query has no secondary sort.
* A trip group is returned only once regardless of how many day rows it contains.
* The response structure is exactly the same as `GET /trips`.

### 8.3 GET `/trips/:tripGroupId`

* Auth: `optionalAuthentication`.
* Path parameter `id` is the **`tripGroupId` (INT)**, not a day id.
* Response `200`: one `TripGroupResponse`.
* The response contains the complete trip group: `id` (the trip-group id), `permissions`, trip-group `social`, and all existing `days[]`.
* The Frontend may open a specific day from the returned `days[]`; the Backend still returns the complete trip group.
* Missing trip group -> `404 TRIP_NOT_FOUND`.

All three endpoints therefore share exactly the same nested data model; only the cardinality differs:
* `/trips` -> array of trip groups;
* `/trips/top` -> array of up to 5 trip groups;
* `/trips/:tripGroupId` -> one trip group.

### 8.4 GET `/me/trips`

This is the authenticated user's own trip-group list.

* Auth: `requireAuthentication`.
* Anonymous/public token -> `401 UNAUTHORIZED`.
* No `userId` is accepted in the path, query, or body.
* The backend obtains the authenticated user's UUID exclusively from the authenticated request context.
* The backend must return only trip groups actually owned by that authenticated user.
* Ownership is determined from the trip-group ownership relation (`trip_groups.ownerId`), never from a client-supplied identifier.
* Response `200`: raw `TripGroupResponse[]`.
* The response uses the exact same unified trip-group structure as `GET /trips`, `GET /trips/top`, and `GET /trips/:tripGroupId`.
* Each item contains only `id` (the trip-group id), server-computed `permissions`, trip-group `social`, and the existing `days[]` structure.
* The response contains **no `userId`, `ownerId`, or author/owner object**.
* The authenticated user's UUID is used only server-side for ownership filtering and is never serialized into the response.
* A user cannot use this endpoint to request another user's trips.
* If the authenticated user owns no trip groups, response is `200` with an empty array:

```json
[]
```

### 8.5 GET `/me/favorites`

This is the authenticated user's favorite trip-group list.

* Auth: `requireAuthentication`.
* Anonymous/public token -> `401 UNAUTHORIZED`.
* No `userId` is accepted in the path, query, or body.
* The backend obtains the authenticated user's UUID exclusively from the authenticated request context.
* Favorites exist **only at trip-group level**.
* The backend resolves the authenticated user's favorite records by the authenticated actor's server-side user id and then resolves the corresponding `tripGroupId` values.
* A favorite points to a trip group, never to an individual day/trip row.
* Response `200`: raw `TripGroupResponse[]`.
* The response uses the exact same unified trip-group structure as `GET /trips`, `GET /trips/top`, and `GET /trips/:tripGroupId`.
* Each item contains only `id` (the trip-group id), server-computed `permissions`, trip-group `social`, and the existing `days[]` structure.
* The response contains **no `userId`, `ownerId`, or author/owner object**, including the owner id of a trip created by another user.
* The authenticated user's UUID and all favorite-record ownership fields are used only server-side and are never serialized into the response.
* The backend must never accept a client-supplied `userId` to retrieve another user's favorites.
* If the user has no favorites, response is `200` with an empty array:

```json
[]
```

### 8.6 GET `/trips/background`

This is the public random background-image endpoint.

* Auth: `optionalAuthentication`.
* Anonymous access uses `Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>`.
* A logged-in user may also call the endpoint with their valid access token.
* No user identity is required for selecting a background.
* No background image records are stored in the database.
* Background image names are loaded from the Google Cloud Storage bucket:

```text
hack-trip-background-images
```

* The legacy source of the background list is equivalent to:

```ts
await storageGoogle
  .bucket('hack-trip-background-images')
  .getFiles()
```

* The resulting object names are stored in the backend dynamic configuration during the slow configuration refresh.
* `refreshSlow()` is responsible for loading/reloading this background-image name list.
* A successful refresh replaces the current in-memory/dynamic-config list with the newly retrieved list.
* A failed refresh MUST NOT clear a previously successful list.
* If a later refresh fails, the last successfully loaded list remains available.
* Refresh failure MUST NOT fail application startup solely because the background-image bucket could not be read.
* Refresh failure SHOULD be logged at `warn` level with enough context for operational diagnosis, without exposing secrets.
* The background service selects one entry randomly from the currently available dynamic-config list.
* The controller returns only the selected background value required by the Frontend, not the complete GCS file list.
* The returned value must be usable by the Frontend as the background image URL.
* Background image URLs are public GCS objects and do not require a user session.
* The exact public base URL is supplied by the image/dynamic configuration rather than hard-coded into the controller.
* If the dynamic configuration currently contains no background entries because no successful load has ever completed, the service returns an appropriate `404 NOT_FOUND` response rather than generating an invalid URL.
* The controller returns JSON only.

Response:

```json
{
  "url": "<public-background-image-url>"
}
```

The controller must not contain GCS access logic, random-selection logic, file-list loading logic, or response mapping/business logic. Those responsibilities belong to the service/configuration layers.

### 8.7 POST `/trips`

* Auth: `requireAuthentication`.
* Body (strict): `{ dayNumber, title, description, group, transport }`.
* `dayNumber` is REQUIRED: the user-selected ordinal of the initial day row (true JSON integer, 1..500). A missing, null, boolean, string, zero, negative, fractional or out-of-range value -> `400 VALIDATION_ERROR`. The server never defaults it.
* Response `201`: `TripGroupResponse` (same complete trip-group response structure as the GET endpoints).

### 8.8 DELETE `/trips/:tripGroupId`

* Auth: `requireAuthentication` + owner/moderator.
* Path params (strict): `{ tripGroupId }` — the `trip_groups.id` of the whole trip.
* Response `204` (empty).

### 8.9 POST `/trips/:tripGroupId/days`

* Auth: `requireAuthentication` + owner/moderator.
* Path params (strict): `{ tripGroupId }` — the `trip_groups.id` of the trip the day is added to.
* Body (strict): `{ dayNumber, title?, description? }`.
* `dayNumber` is REQUIRED: the user-selected ordinal of the new day row (true JSON integer, 1..500). A missing, null, boolean, string, zero, negative, fractional or out-of-range value -> `400 VALIDATION_ERROR`. The server never assigns `max(dayNumber)+1` or any other default.
* Response `201`: `TripGroupResponse` (same complete trip-group response structure as `GET /trips/:tripGroupId`).
* Duplicate `dayNumber` within the same trip group -> `409 CONFLICT` ("Day N already exists in this trip."); the same number in a different trip group is allowed.

### 8.10 PUT `/trips/:tripGroupId/days/reorder`

* Auth: `requireAuthentication` + owner/moderator.
* Path params (strict): `{ tripGroupId }`. Body (strict): `{ tripIds: number[] }` — every entry must be a true JSON number (integer id).
* Response `200`: `TripDay[]` (re-ordered).
* Each `tripIds` entry is the primary key `trips.id` of one day row of the trip group — never a `dayNumber` and never a `trip_groups.id`. The list must contain exactly all day ids of the trip group; otherwise `400 VALIDATION_ERROR`. Days are renumbered to their position in the submitted order.

### 8.11 PUT `/trips/:tripGroupId/days/:tripId`

* Auth: `requireAuthentication` + owner/moderator.
* Path params (strict): `{ tripGroupId, tripId }` (`tripId` = the day row's `Trip.id`).
* Body (strict): `{ title?, description? }` (at least one required).
* Response `200`: `TripGroupResponse` (same complete trip-group response structure as `GET /trips/:tripGroupId`).

### 8.12 DELETE `/trips/:tripGroupId/days/:tripId`

* Auth: `requireAuthentication` + owner/moderator.
* Path params (strict): `{ tripGroupId, tripId }` (`tripId` = the day row's `Trip.id`).
* Response `204` (empty).
* Error: deleting the last remaining day -> `409 CONFLICT` ("The last day of a trip cannot be deleted.").

### 8.13 POST `/trips/:tripGroupId/days/:tripId/images`

* Auth: `requireAuthentication` + owner/moderator (ownership checked BEFORE the file is stored).
* Path params (strict): `{ tripGroupId, tripId }` (`tripId` = the day row's `Trip.id`).
* Multipart: field `file`, exactly one file.
* Response `201`: `ImageDto`.
* Error: day already has 9 images -> `409 CONFLICT`.

### 8.14 GET `/trips/:tripId/points`

* Auth: `optionalAuthentication` (public read; an anonymous request uses the public Frontend token).
* Path params (strict): `{ tripId }`; `tripId` is the day row's `Trip.id`. Every point belongs to exactly one day row and carries that day's `Trip.id` in its `TripPoint.tripId` field (`points.tripId` is required and is never null).
* Response `200`: raw `TripPoint[]` — the complete point collection of that day, in `pointNumber` order.
* Every element is the full `TripPoint` response DTO (§10.7): `images` with image social state, point `social` state and server-computed `permissions` included.
* A missing day -> `404 NOT_FOUND`; an existing day without points -> `200` with an empty array.

---

## 9. Day Endpoints

Mounted at `/api/v1/days`.

### 9.1 PUT `/days/:tripId/points/reorder`

* Auth: `requireAuthentication` + owner/moderator.
* Path params (strict): `{ tripId }` (`tripId` = the day row's `Trip.id`).
* Body (strict): `{ pointIds: number[] }` — every entry must be a true JSON number (integer id).
* Response `200`: `TripPoint[]` (re-ordered).
* `pointIds` must contain exactly all point ids of the day (may be an empty array for zero points); otherwise `400 VALIDATION_ERROR`.

---

## 10. Point Endpoints

Mounted at `/api/v1/points`.

### 10.1 POST `/points`

* Auth: `requireAuthentication` + owner/moderator (of the day's trip group).
* Body (strict): `{ tripId, name, description?, lat, lng }` — `tripId`, `lat` and `lng` must be true JSON numbers (strings/booleans are rejected).
* Response `201`: `TripPoint[]` — the complete current point collection of the day the point was created in, in `pointNumber` order (same full DTO as §10.7).
* `tripId` is the primary key `trips.id` of the day row the point belongs to — never the trip-group id and never `trips.dayNumber`.
* `pointNumber` MUST NOT be sent: it is generated by the server as `max(existing pointNumber) + 1` of that day. Client-controlled ownership/sequence/legacy fields (`ownerId`, `userId`, `dayId`, `pointNumber`, `numberPoint`, `_ownerId`, `_ownerTripId`) are rejected.

### 10.2 GET `/points/:pointId`

* Auth: `optionalAuthentication`.
* Path params (strict): `{ pointId }`.
* Response `200`: `TripPoint`. Missing -> `404 NOT_FOUND`.

### 10.3 PUT `/points/:pointId`

* Auth: `requireAuthentication` + owner/moderator.
* Path params (strict): `{ pointId }`.
* Body (strict): `{ name?, description?, lat?, lng? }` (at least one required). `lat`/`lng` must be true JSON numbers within their bounds or `null` (which clears the coordinate); strings/booleans are rejected.
* Response `200`: `TripPoint[]` — the complete current point collection of the day the updated point belongs to, in `pointNumber` order (same full DTO as §8.14).
* `pointNumber`/`numberPoint` cannot be changed (rejected).

### 10.4 DELETE `/points/:pointId`

* Auth: `requireAuthentication` + owner/moderator.
* Path params (strict): `{ pointId }`.
* Response `204` (empty).

### 10.5 POST `/points/:pointId/images`

* Auth: `requireAuthentication` + owner/moderator (ownership checked BEFORE the file is stored).
* Path params (strict): `{ pointId }`.
* Multipart: field `file`, exactly one file.
* Response `201`: `ImageDto`.
* Error: point already has 9 images -> `409 CONFLICT`.

### 10.6 DELETE `/points/:pointId/images/:imageId`

* Auth: `requireAuthentication` + owner/moderator.
* Path params (strict): `{ pointId, imageId }`.
* Response `204` (empty).

### 10.7 `TripPoint` (point response DTO)

The point response keeps the public database-aligned field names and types for the point data. `tripId` is required (non-null) and identifies the parent day row (`points.tripId` = `trips.id`); every point is attached to exactly one day. Internal fields `ownerId` and `countEdited` are never exposed. `createdAt`/`updatedAt` are returned as ISO strings. Social and image data are API-level additions.

 ```text
{
  "id": 2001,
  "name": "Point title",
  "description": null,
  "lat": 42.6975,
  "lng": 23.3241,
  "pointNumber": 1,
  "tripId": 1001,
  "createdAt": null | "<iso>",
  "updatedAt": null | "<iso>",
  "images": [ SocialImageDto ],
  "permissions": {
    "canEdit": true,
    "canDelete": true
  },
  "social": SocialState
}
```

Non-negotiable point field rules:

* `name` is the database `Point.name` field; do not rename it to `title`.
* `lat` and `lng` are the database coordinate fields; do not rename them to `latitude` / `longitude`.
* `pointNumber` is returned as a JSON **number**: the column is a signed INT managed entirely by the backend (`max + 1` on create, renumbering on reorder/delete).
* `tripId` is required (non-null) in `TripPoint`; it is always the parent day-row reference (`trips.id`). It is required from the client in `POST /points` (as the day the point belongs to) and is never accepted in point update requests.
* `ownerId` is never returned to the Frontend. Ownership is resolved server-side.
* `permissions` is the server-computed edit/delete right of the requesting actor; anonymous callers receive `canEdit: false` and `canDelete: false`.
* `images` and `social` remain API-level nested fields.

### 10.8 `TripDay` (day response DTO)

```text
{
  "id": 0,
  "dayNumber": 1,
  "title": null | "<string>",
  "images": [ SocialImageDto ],
  "points": [ TripPoint ],
  "permissions": {
    "canEdit": true,
    "canDelete": true
  },
  "social": SocialState
}
```

### 10.9 `SocialState`

```json
{
  "likes": 0,
  "likedByMe": false,
  "comments": { "count": 0 },
  "reportedByMe": false,
  "favorites": 0,
  "favoritedByMe": false
}
```

`favorites` and `favoritedByMe` are present only on trip-group targets. `reportedByMe` reflects whether the authenticated actor has reported the target and is `false` for anonymous callers.

### 10.10 `ImageDto` / `SocialImageDto`

```text
// ImageDto
{ "id": 0, "url": "<url>", "thumbnailUrl": "<url>" }

// SocialImageDto
{ "id": 0, "url": "<url>", "thumbnailUrl": "<url>", "social": SocialState }
```

---

## 11. Image Endpoints

Mounted at `/api/v1/images`.

### 11.1 DELETE `/images/:imageId`

* Auth: `requireAuthentication` + owner/moderator (the image must be attached to a day of a trip group; a profile image or unattached image is `404 NOT_FOUND`).
* Path params (strict): `{ imageId }`.
* Response `204` (empty). The original object and its thumbnail sidecar are deleted from storage before the row is removed.

### 11.2 Image upload contract (all image uploads)

Applies to `POST /auth/me/image`, `POST /trips/:tripGroupId/days/:tripId/images`, and `POST /points/:pointId/images`.

* Multipart field name: `file`.
* Exactly one binary part per request; no text fields are part of the contract (`files: 1`, `fields: 0`, `parts: 1`).
* Max file size: `25 MB` (`MAX_UPLOAD_BYTES`).
* Accepted MIME (declared): `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
* Accepted extensions: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`.
* Decoded format (authoritative; bytes are inspected with Sharp): `jpeg`, `png`, `webp`, `gif`. HEIC/HEIF, SVG, TIFF, AVIF are not accepted.
* Decoded dimension ceilings: width/height <= `10000`, total pixels <= `50_000_000` (counting all frames).
* Processing: the backend re-encodes/sanitizes the image (EXIF orientation applied via `rotate()`; re-encoded per format). The frontend is expected only to stay within the 25 MB upload cap; the backend does its own sanitizing/re-encoding and thumbnail generation.
* Storage: the processed full-size image is stored at the server-generated object key `images/<uuid>.<ext>` using create-only writes (`ifGenerationMatch: 0`); a thumbnail sidecar `<name>_thumb.webp` (800x600, `fit: inside`, quality 80, webp) is generated.
* Max images per entity: `9` per day row and `9` per point (a day image row has `Image.tripId` = day row id; a point image row has `Image.pointId`).
* Oversized/unsupported uploads are `400 VALIDATION_ERROR`; a generated-key collision is `409 CONFLICT`.

### 11.3 Image URL construction

`ImageDto.url` and `ImageDto.thumbnailUrl` are built from the stored `images.filePath` (`src/mappers/imageMapper.ts`):

* If `filePath` already starts with `http://` or `https://`, it is returned unchanged.
* Otherwise it is prefixed with `visual.image_base_url` (trailing slashes trimmed): `<image_base_url>/<filePath>`.
* The thumbnail URL uses the thumbnail sidecar name `<base>_thumb.webp` (see section 11.2).
* `image_base_url` is read from the runtime dynamic config (`visual` service, key `image_base_url`).

---

## 12. Comment Endpoints

Mounted at the v1 root (`commentController` spans several prefixes). Reading is public (`optionalAuthentication`); writing requires authentication.

### 12.1 List comments (GET)

* `GET /trip-groups/:tripGroupId/comments`

* `GET /trips/:tripGroupId/days/:tripId/comments`

* `GET /points/:pointId/comments`

* `GET /images/:imageId/comments`

* Auth: `optionalAuthentication`.

* Query (strict): `{ page?, limit? }` (`page` default `1`, max `10000`; `limit` default `10`, max `100`).

* Response `200`: `CommentListResponse`.

* Ordering: newest first (`createdAt DESC`, tie-break `id DESC`).

`CommentListResponse`:

```text
{ "items": [ CommentDto ], "page": 1, "limit": 10, "total": 0 }
```

`CommentDto`:

```text
{
  "id": 0,
  "author": { "name": "<string>" },
  "comment": "<string>",
  "permissions": { "canEdit": true, "canDelete": true },
  "social": { "reportedByMe": false },
  "createdAt": null | "<iso>",
  "updatedAt": null | "<iso>"
}
```

* `comment` is the text field of the DTO and of the request body (the database column is `comments.comment`); do not rename it to `text`.
* `author` carries only the server-side `name` snapshot — no user id is exposed.
* The internal edit counter is not part of the response.

### 12.2 Create comment (POST)

* `POST /trip-groups/:tripGroupId/comments`

* `POST /trips/:tripGroupId/days/:tripId/comments`

* `POST /points/:pointId/comments`

* `POST /images/:imageId/comments`

* Auth: `requireAuthentication`.

* Body (strict): `{ comment }` (trimmed, 1..1000).

* Response `201`: `CommentDto`.

* The author name snapshot is built server-side from the user's `firstName lastName` (trimmed, max 45 chars).

### 12.3 PUT `/comments/:commentId`

* Auth: `requireAuthentication`; allowed for the comment author or a moderator (else `403 FORBIDDEN`).
* Path params (strict): `{ commentId }`.
* Body (strict): `{ comment }` (trimmed, 1..1000).
* Response `200`: `CommentDto`. The internal edit counter is incremented server-side (not exposed in the response).

### 12.4 DELETE `/comments/:commentId`

* Auth: `requireAuthentication`; allowed for the comment author or a moderator (`admin`/`manager`). The trip-group owner has no special deletion right beyond being the author or a moderator.
* Path params (strict): `{ commentId }`.
* Response `204` (empty).

---

## 13. Like Endpoints

Mounted at `/api/v1/likes`.

### 13.1 POST `/likes`

* Auth: `requireAuthentication`.
* Body (strict): `{ targetType, targetId }` — `targetId` must be a true JSON number (integer id).
* Response `200`: `SocialState` (idempotent; repeating a like is a no-op).
* The target must exist; otherwise `404 NOT_FOUND`.

### 13.2 DELETE `/likes`

* Auth: `requireAuthentication`.
* Query (strict): `{ targetType, targetId }` — query values arrive as strings; `targetId` must be a numeric string that parses to an integer id.
* Response `204` (empty). Idempotent.

### 13.3 Valid `targetType` values

Accepted input values (case-insensitive, trimmed, lowercased): `tripgroup`, `day`, `trip`, `point`, `image`.

Canonical mapping:

| Input       | Canonical `targetType` (returned in reports) | Target resource                 |
| ----------- | -------------------------------------------- | ------------------------------- |
| `tripgroup` | `tripGroup`                                  | a trip group (`trip_groups.id`) |
| `day`       | `trip`                                       | a day row (`trips.id`)          |
| `trip`      | `trip` (alias of `day`)                      | a day row (`trips.id`)          |
| `point`     | `point`                                      | a point (`points.id`)           |
| `image`     | `image`                                      | an image (`images.id`)          |

`targetId` is the numeric id of that resource. `trip` is the accepted alias of `day`.

---

## 14. Favorite Endpoints

Mounted at `/api/v1/favorites`. Favorites exist on trip groups only.

### 14.1 POST `/favorites`

* Auth: `requireAuthentication`.
* Body (strict): `{ tripGroupId }` — `tripGroupId` must be a true JSON number (integer id).
* Response `200`: `SocialState` (the group's state, including `favorites`/`favoritedByMe`). Idempotent.

### 14.2 DELETE `/favorites`

* Auth: `requireAuthentication`.
* Query (strict): `{ tripGroupId }` — the query value arrives as a numeric string that parses to an integer id.
* Response `204` (empty). Idempotent.

---

## 15. Report Endpoints

Mounted at `/api/v1/reports`.

### 15.1 POST `/reports`

* Auth: `requireAuthentication`.
* Body (strict): `{ targetType, targetId, reason? }` — `targetId` must be a true JSON number (integer id).
* Response `201`: `ReportDto`.
* Error: the same user already reported the same target -> `409 CONFLICT` ("You have already reported this resource.").
* Reports may target a trip group, trip/day, point, image, or comment.
* The reporting user is always taken from authentication context. `userId` must never be accepted from the request body.

`ReportDto`:

```text
{
  "id": 0,
  "targetType": "tripGroup" | "trip" | "point" | "image" | "comment",
  "targetId": 0,
  "reason": null | "<string>",
  "createdAt": null | "<iso>"
}
```

Reports are never read back through `/reports`: users never receive the administrative report queue; the queue is served only by `GET /admin/reports` (§16.10). A report's author may, however, withdraw their own report:

### 15.2 DELETE `/reports/:reportId`

* Auth: `requireAuthentication`; allowed only for the report's author (else `403 FORBIDDEN`).
* Path params (strict): `{ reportId }` (positive integer).
* Response `204` (empty). Removes the report record only; the reported content stays untouched.
* Errors: missing report -> `404 NOT_FOUND`; not the author -> `403 FORBIDDEN` ("Only the report author can delete this report.").
* This operation is separate from the administrative removal `DELETE /admin/reports/:reportId` (§16.11), which requires the `admin`/`manager` role and checks no authorship.

---

## 16. Admin Endpoints

Mounted at `/api/v1/admin`. Every admin endpoint is guarded by the admin rate limit (`120`/window/IP) and by role middleware. Role gates are defined in code (`ADMIN_ROLES` = `admin`; `ADMIN_OR_MODERATOR_ROLES` = `admin`, `manager`).

Admin pagination query (strict, shared by all admin list endpoints):

* `page`: positive integer, default `1`, max `10000`.
* `pageSize`: positive integer, default `50`, max `100`.

### 16.1 GET `/admin/users`

* Role: `admin` or `manager`.
* Response `200`: `AdminPage<AuthUserDto>` (ordered by email asc).

```text
{
  "items": [ AuthUserDto ],
  "pagination": { "page": 1, "pageSize": 50, "total": 0, "totalPages": 0 }
}
```

### 16.2 PUT `/admin/users/:userId`

* Role: `admin` or `manager` on the route. Assigning `role` or `password` additionally requires the `admin` role: a `manager` request whose body contains `role` or `password` is rejected with `403 FORBIDDEN` ("Only an admin can change role or password."). `firstName`, `lastName`, `email`, `status` and `emailVerified` are assignable by both roles.
* Path params (strict): `{ userId: UUID }`.
* Body (strict): `{ firstName?, lastName?, email?, role?, status?, emailVerified?, password? }` (at least one required).

  * `role` enum: `user` | `admin` | `manager` (admin only).
  * `status` enum: `PENDING_VERIFICATION` | `ACTIVE` | `SUSPENDED` | `DEACTIVATED`.
  * `email` is trimmed, lowercased and pattern-checked; a `emailVerified` boolean is stored as `emailVerifiedAt` (`true` -> now, `false` -> `null`).
  * `password` follows the account password policy (8..72 bytes) and is stored hashed.
* Response `200`: `AuthUserDto`.
* Errors: unknown user -> `404 NOT_FOUND`; email already used by another account -> `409 CONFLICT` ("Another account already uses this email address.").
* Identity/credential/verification columns (`id`, `hashedPassword`, `imageFile`, `verifyEmail`, `emailVerifiedAt`, `createdAt`) are not settable through this endpoint; the strict schema rejects every undeclared field.

### 16.3 DELETE `/admin/users/:userId`

* Role: `admin` or `manager`.
* Path params (strict): `{ userId: UUID }`.
* Response `204` (empty).
* Error: user still owns trips/days/points/comments -> `409 CONFLICT` ("The account still owns trips, days, points or comments.").

### 16.4 GET `/admin/failed-login-logs`

* Role: `admin` or `manager`.
* Response `200`: `AdminPage<FailedLogDto>` (newest first).

`FailedLogDto`:

```text
{
  "id": 0,
  "date": null | "<string>",
  "email": "<string>",
  "ip": "<string>",
  "userAgent": "<string>",
  "countryCode": null | "<string>",
  "countryName": null | "<string>",
  "city": null | "<string>",
  "postal": null | "<string>",
  "latitude": null | 0.0,
  "longitude": null | 0.0,
  "state": null | "<string>"
}
```

### 16.5 DELETE `/admin/failed-login-logs`

* Role: `admin` or `manager`.
* Body (strict): `{ ids: number[] }` (1..200 ids, no duplicates) — every entry must be a true JSON number.
* Response `200`: `{ "deleted": <number> }`.

### 16.6 GET `/admin/route-not-found-logs`

* Role: `admin` or `manager`.
* Response `200`: `AdminPage<RouteNotFoundLogDto>` (newest first).

`RouteNotFoundLogDto`:

```text
{
  "id": 0,
  "date": null | "<string>",
  "reqUrl": null,
  "reqMethod": null | "<string>",
  "reqHeaders": null,
  "reqQuery": null,
  "reqBody": null,
  "reqParams": null,
  "reqIp": null | "<string>",
  "reqUserId": null | "<uuid>",
  "reqUserEmail": null | "<string>"
}
```

> The detail fields (`reqUrl`, `reqHeaders`, `reqQuery`, `reqBody`, `reqParams`) are always `null` in the response: only the summary columns are returned.

### 16.7 GET `/admin/images/cloud`

* Role: `admin` or `manager`.
* Response `200`: `AdminPage<string>` (cursor-style: `{ items: string[], pagination: { page, pageSize, hasNext } }`).
* Items are sorted, deduplicated GCS object names.

### 16.8 GET `/admin/images/database`

* Role: `admin` or `manager`.
* Response `200`: `AdminPage<string>` (`{ items: string[], pagination: { page, pageSize, total, totalPages } }`).
* Items are `images.filePath` values ordered by id asc.

### 16.9 GET `/admin/images/orphans`

* Role: `admin` or `manager`.
* Response `200`: `ImageInventoryComparison`.

```json
{
  "cloudOnly": [ "<objectName>" ],
  "databaseOnly": [ "<filePath>" ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "cloudHasNext": false,
    "databaseHasNext": false,
    "databaseTotal": 0,
    "databaseTotalPages": 0
  }
}
```

### 16.10 GET `/admin/reports`

This is the administrative report queue.

* Role: `admin` or `manager`.
* Reports are automatically available here after a user successfully creates them through `POST /reports`.
* The Frontend does not need to manually move or copy a report into the admin area.
* The endpoint returns reports persisted in the `reports` table.
* The endpoint must support both trip reports and comment reports.
* The response is paginated using the existing admin pagination contract.
* Default ordering is newest reports first (`createdAt DESC`, tie-break `id DESC`).
* `page` and `pageSize` are the only pagination parameters in the initial contract.
* No user id is accepted as an authorization selector.
* The backend determines report ownership/author from the persisted report record.
* The reported target must be resolved server-side so the admin UI can identify whether the report concerns a trip group, trip/day, point, image, or comment.
* A report may remain in the queue until an administrator or manager deletes it.
* Listing reports does not delete, resolve, hide, or otherwise mutate the reported content.

Response:

```text
{
  "items": [ AdminReportDto ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "total": 0,
    "totalPages": 0
  }
}
```

`AdminReportDto`:

```text
{
  "id": 0,
  "targetType": "tripGroup" | "trip" | "point" | "image" | "comment",
  "targetId": 0,
  "reason": null | "<string>",
  "createdAt": null | "<iso>"
}
```

The initial report queue intentionally keeps the DTO minimal. The backend must not expose internal database models or arbitrary report-related columns merely because they exist in the database.

### 16.11 DELETE `/admin/reports/:reportId`

* Role: `admin` or `manager`.
* Path params (strict): `{ reportId: positive integer }`.
* Deletes the specific report record.
* It does **not** delete the reported trip, comment, point, image, or other target.
* Response `204` (empty).
* Missing report -> `404 NOT_FOUND`.
* The operation is intentionally a report-removal operation only.
* Content removal/takedown is a separate moderation capability and is not part of this initial reports contract.
* The Frontend may use this operation after the manager/admin has triaged the report.

---

## 17. Pagination

### 17.1 Trip list (`GET /trips`)

* `page`: default `1`, min `1`, max `10000`.
* `limit`: default `20`, min `1`, max `100`.
* These query parameters select which trip groups are returned.
* Response is a raw `TripGroupResponse[]`; there is no `items` wrapper and no `pagination` object.

### 17.2 Comment list (all comment GET endpoints)

* `page`: default `1`, min `1`, max `10000`.
* `limit`: default `10`, min `1`, max `100`.
* Response: `{ items, page, limit, total }` (no `totalPages`).

### 17.3 Admin list endpoints

* `page`: default `1`, min `1`, max `10000`.
* `pageSize`: default `50`, min `1`, max `100`.
* Response `pagination` for offset lists (`/admin/users`, `/admin/failed-login-logs`, `/admin/route-not-found-logs`, `/admin/images/database`, `/admin/reports`): `{ page, pageSize, total, totalPages }`.
* Response `pagination` for cursor lists (`/admin/images/cloud`): `{ page, pageSize, hasNext }`.
* Response `pagination` for orphans (`/admin/images/orphans`): `{ page, pageSize, cloudHasNext, databaseHasNext, databaseTotal, databaseTotalPages }`.

### 17.4 Shared limits

* Resource ids (`INT AUTO_INCREMENT`): `1..2147483647`.
* Page offset uses `(page - 1) * limit`.

---

## 18. Zod Request Schemas

All schemas are `.strict()` unless noted. Numeric fields in a JSON body must use actual JSON numbers; numeric strings and booleans are rejected, and integer fields reject fractional values. `null` is rejected unless the specific schema explicitly permits it (for example, `lat` and `lng` in `pointUpdateSchema`, where `null` clears the coordinate). Numeric query values arrive as strings and are parsed by the query schemas.

### 18.1 Shared helpers

* `trimmedString({max, min?, pattern?, patternMessage?})`: `z.string() -> trim() -> pipe(min/max/regex)`. Surrounding whitespace is removed before validation.
* `passwordString({min,max})`: `z.string().min(min).max(max).refine(byteLength <= max)`. Never trimmed.
* `optionalText({max,min?})`: `union(trimmedString, null).optional()` then transforms `undefined`/`null`/`''` -> `null`. Output `string | null`.
* `patchText({max,min?})`: same as optionalText but keeps `undefined` as `undefined` (partial update; blank clears to null).
* `requiredNumber({min,max})`: `number().min.max` — a true JSON number only; strings, booleans and `null` are rejected.
* `patchNumber({min,max})`: `union(number.min.max, null).optional()`. Output `number | null | undefined`; strings and booleans are rejected.
* `requiredInt({min,max})`: `number().int().min.max` — required; a missing, null, boolean, string, fractional or non-integer value is rejected (no default).
* `optionalInt({min,max})`: preprocess `''`/`null` -> `undefined`, then `coerce.number().int().min.max.optional()`.
* `positiveIdParam`: `z.string().regex(/^\d+$/)` and refine 1..2147483647.
* `userIdParam`: `z.string().regex(UUID)`.
* `positiveId`: `z.number().int().min(1).max(2147483647)` — a true JSON number id, used in JSON-body schemas.
* `positiveIdQuery`: `z.coerce.number().int().min(1).max(2147483647)` — the query-string variant used by the DELETE query schemas (query values arrive as strings).
* `targetTypeInput`: `z.string().trim().toLowerCase().pipe(z.enum(['tripgroup','day','trip','point','image']))`.
* `idList({min,max})`: `z.array(positiveId).min(min).max(max).refine(no duplicate ids)` — true JSON numbers only.

### 18.2 Auth schemas

| Schema                     | Fields (all required unless marked)          | Notes                                                                                                             |
| -------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `registerSchema`           | `email`, `password`, `firstName`, `lastName` | `email`: trimmed 1..45 + email pattern; `password`: 8..72 chars (72 bytes); `firstName`/`lastName`: trimmed 1..45 |
| `verifyEmailSchema`        | `token`                                      | trimmed 1..200                                                                                                    |
| `resendVerificationSchema` | `email`                                      | trimmed 1..45 + email pattern                                                                                     |
| `loginSchema`              | `email`, `password`                          | `password`: 1..200 (comparison only)                                                                              |
| `updateProfileSchema`      | `firstName`, `lastName`                      | trimmed 1..45                                                                                                     |
| `confirmPasswordSchema`    | `password`                                   | 1..200                                                                                                            |
| `changePasswordSchema`     | `currentPassword`, `newPassword`             | `currentPassword`: 1..200; `newPassword`: 8..72                                                                   |
| `forgotPasswordSchema`     | `email`                                      | trimmed 1..45 + email pattern                                                                                     |
| `resetPasswordSchema`      | `token`, `password`                          | `token`: 1..200; `password`: 8..72                                                                                |

### 18.3 Trip schemas

| Schema                | Fields                                                                                         | Notes                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `tripWriteSchema`     | `dayNumber` (1..500, required), `title` (1..60), `description` (optional/null, <=2000), `group` (1..45), `transport` (1..45) | `dayNumber` is the user-selected ordinal of the initial day row and is never defaulted; `group`/`transport` are validated against active dynamic-config select values at the service layer |
| `tripListQuerySchema` | `page?`, `limit?`, `search?`, `group?`, `transport?`, `sort?`                                  | `page` 1..10000; `limit` 1..100; `search` 1..200; `group`/`transport` 1..45; `sort` enum `newest`/`oldest` |
| `dayCreateSchema`     | `dayNumber` (1..500, required), `title?` (optional/null, 1..60), `description?` (optional/null, <=2000) | `dayNumber` is required and persisted unchanged; the server never assigns `max(dayNumber)+1` |
| `dayUpdateSchema`     | `title?`, `description?` (at least one)                                                        | patch semantics; `dayNumber` is rejected (use the reorder endpoint)                                        |
| `dayReorderSchema`    | `tripIds`                                                                                      | array 1..500 of `trips.id` day-row ids (true JSON numbers), no duplicates                                                      |
| `pointReorderSchema`  | `pointIds`                                                                                     | array 0..500 (true JSON numbers), no duplicates                                                                                |

The new trip-data endpoints do not accept query parameters unless explicitly documented in their endpoint sections. In particular:

* `/trips/top` accepts no user id or other selector.
* `/me/trips` accepts no user id.
* `/me/favorites` accepts no user id.
* `/trips/background` accepts no user id or background filename.

### 18.4 Point schemas

| Schema              | Fields                                                                                                           | Notes                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `pointCreateSchema` | `tripId` (positive int), `name` (1..100), `description` (optional/null, <=1050), `lat` (-90..90), `lng` (-180..180)  | `tripId` is the day row's `trips.id`; `tripId`/`lat`/`lng` must be true JSON numbers; `pointNumber` MUST NOT be sent                                        |
| `pointUpdateSchema` | `name?` (1..100), `description?` (patch, <=1050), `lat?` (patch, -90..90), `lng?` (patch, -180..180) | at least one required; `lat?`/`lng?` are true JSON numbers or `null` (clears); `pointNumber`/`numberPoint`/`tripId`/`dayId` rejected                                |

### 18.5 Social schemas

| Schema                    | Fields                                                       | Notes                                                                                   |
| ------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `socialTargetBodySchema`  | `targetType`, `targetId`                                     | `targetType` = `targetTypeInput`; `targetId` = positive id (true JSON number)                              |
| `socialTargetQuerySchema` | `targetType`, `targetId`                                     | same, but `targetId` uses the query-string id schema (numeric string)                                                     |
| `favoriteBodySchema`      | `tripGroupId`                                                | positive id (true JSON number)                                                                             |
| `favoriteQuerySchema`     | `tripGroupId`                                                | positive id (query-string variant: numeric string)                                                                             |
| `commentBodySchema`       | `comment` (1..1000)                                          | trimmed; the request field and DTO field are `comment` (never `text`)                                   |
| `reportBodySchema`        | `targetType`, `targetId`, `reason?` (optional/null, <=1000)  | Report target type additionally allows `comment`                                        |
| `reportTargetTypeInput`   | `tripgroup`, `day`, `trip`, `point`, `image`, `comment` | Case-insensitive, trimmed and lowercased; `day` and `trip` resolve to a trip/day target |
| `commentPageQuerySchema`  | `page?`, `limit?`                                            | `page` 1..10000; `limit` 1..100                                                         |

### 18.6 Admin schemas

| Schema                       | Fields                                                       | Notes                                                                                                         |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `adminUserUpdateSchema`      | `firstName?`, `lastName?`, `email?`, `role?`, `status?`, `emailVerified?`, `password?` (at least one) | `role` enum `user`/`admin`/`manager`; `status` enum `PENDING_VERIFICATION`/`ACTIVE`/`SUSPENDED`/`DEACTIVATED`; `emailVerified` boolean is stored as `emailVerifiedAt`; `role` and `password` changes are admin-only (a manager sending them receives `403 FORBIDDEN`) |
| `failedLogDeleteSchema`      | `ids`                                                        | array 1..200 (true JSON numbers), no duplicates                                                                                   |
| `adminPaginationQuerySchema` | `page?`, `pageSize?`                                         | transforms to defaults `page=1`, `pageSize=50`; `page` 1..10000, `pageSize` 1..100                            |
| `adminReportIdParams`        | `reportId`                                                   | positive integer                                                                                              |

### 18.7 Route-parameter schemas (all `.strict()`)

| Schema                | Params                                        |
| --------------------- | --------------------------------------------- |
| `userIdParams`        | `userId` (UUID)                               |
| `tripIdOnlyParams`    | `tripId` (positive int) — a day row's `trips.id` |
| `tripDayParams`       | `tripGroupId`, `tripId` (both positive int; `tripId` = the day row's `trips.id`) |
| `pointIdParams`       | `pointId` (positive int)                      |
| `pointImageParams`    | `pointId`, `imageId` (both positive int)      |
| `imageIdParams`       | `imageId` (positive int)                      |
| `commentIdParams`     | `commentId` (positive int)                    |
| `tripGroupIdParams`   | `tripGroupId` (positive int)                  |
| `reportIdParams`      | `reportId` (positive int) — author-facing report removal |
| `adminReportIdParams` | `reportId` (positive int)                     |

The new `/me/trips` and `/me/favorites` endpoints intentionally do not use `userIdParams`.

### 18.8 Server-generated / forbidden fields (must NOT be sent by the frontend)

* `ownerId`, `userId`, `_ownerId`, `_ownerTripId` — ownership always derives from the authenticated actor; rejected on any write.
* `dayId` — the legacy name of the point-create parent field; rejected (the contract uses `tripId`, the day row's `trips.id`).
* `pointNumber`, `numberPoint` — assigned by the server.
* `id`, `email`, `hashedPassword`, `password`, `imageFile`, `verifyEmail`, `emailVerifiedAt`, `createdAt` — never settable on admin user update.
* `days`, `points` — nested structures are rejected on trip writes.
* `userId` is not accepted as a selector for `/me/trips` or `/me/favorites`.

---

## 19. Response DTOs

The API returns DTOs, not database models. The following are the API response shapes (all documented above):

| DTO                                   | Where returned                                              |
| ------------------------------------- | ----------------------------------------------------------- |
| `AuthUserDto`                         | admin users list/update only                                 |
| `ProfileDto` (in `{ user }`)          | register/verify/login/refresh/me/update profile               |
| `AuthSessionDto`                      | login, refresh                                               |
| `AuthUserResponse` (`{ user }`)       | verify-email, me, update profile                            |
| `MessageResponse` (`{ message }`)     | register, resend, logout, forgot, reset                     |
| `ImageDto`                            | image create endpoints, profile image GET/POST              |
| `SocialImageDto`                      | trip/point image lists                                      |
| `SocialState`                         | trip detail, day, point, image, like/favorite responses     |
| `TripGroupResponse`                    | POST /trips, POST /trips/:tripGroupId/days, PUT /trips/:tripGroupId/days/:tripId, GET /trips, GET /trips/top, GET /trips/:tripGroupId, GET /me/trips, GET /me/favorites |
| `TripDay`                             | PUT /trips/:tripGroupId/days/reorder                         |
| `TripPoint`                           | point GET/POST/PUT, point reorder                           |
| `CommentDto`                          | comment list/create/update                                  |
| `CommentListResponse`                 | comment list                                                |
| `ReportDto`                           | report create                                               |
| `AdminReportDto`                      | admin report list                                           |
| `SelectConfig[]`                      | GET /config/selects                                         |
| `PublicServiceConfig[]`               | GET /config/services                                        |
| `AdminPage<T>`                        | admin list endpoints                                        |
| `FailedLogDto`                        | GET /admin/failed-login-logs                                |
| `RouteNotFoundLogDto`                 | GET /admin/route-not-found-logs                             |
| `DeleteCountResponse` (`{ deleted }`) | DELETE /admin/failed-login-logs                             |
| `ImageInventoryComparison`            | GET /admin/images/orphans                                   |

DATABASE MODELS (not returned by the API): `User`, `TripGroup`, `Trip`, `Point`, `Comment`, `Like`, `Favorite`, `Report`, `Image`, `TargetType`, `EmailVerificationToken`, `PasswordResetToken`, `RefreshToken`, `FailedLog`, `RouteNotFoundLog`, `SelectType`, `SelectOption`, `ServiceType`, `ServiceConfig`, `Verify`. The frontend must not rely on their column shapes.

---

## 20. Security Semantics

1. **Missing `x-hacktrip-client` header**: `404 NOT_FOUND` (with error body on `/api/v1*`, empty body otherwise). Not authenticated as anonymous.
2. **Invalid user access JWT**: `401 UNAUTHORIZED`. Never downgraded to anonymous.
3. **Missing `Authorization` at an authentication boundary** (including public reads): `404 NOT_FOUND`. Not anonymous.
4. **Expired user access JWT**: `401 UNAUTHORIZED`.
5. **Expired refresh token**: `401 UNAUTHORIZED` ("The refresh session has expired.").
6. **Refresh token reuse**: `401 UNAUTHORIZED`; all sessions of the account are revoked.
7. **Suspended account**: `403 ACCOUNT_SUSPENDED` (login/refresh and any authenticated request).
8. **Deactivated account**: `403 ACCOUNT_DEACTIVATED`.
9. **Unverified email**: `403 EMAIL_NOT_VERIFIED` (login/refresh and any authenticated request).
10. **Authenticated user requesting a resource they do not own** (trip/day/point/image mutation): `403 FORBIDDEN` ("Only the trip owner can modify this trip.").
11. **Manager accessing moderator functionality**: allowed — `manager` is in `MODERATOR_ROLES`.
12. **Admin accessing admin functionality**: allowed — `admin` is in both `ADMIN_ROLES` and `MODERATOR_ROLES`.
13. **Public GET with no Authorization**: `404 NOT_FOUND`.
14. **Public GET with a valid user access JWT**: authenticated viewer context; viewer-specific fields (`likedByMe`, `favoritedByMe`) are returned where the existing DTO supports them. The public frontend bearer token instead creates an anonymous context.
15. **Public GET with an invalid Authorization token**: `401 UNAUTHORIZED`; never silently turned anonymous.
16. **My Trips never accepts a user id from the Frontend**: the authenticated actor is always obtained server-side from the access token.
17. **My Favorites never accepts a user id from the Frontend**: the authenticated actor is always obtained server-side from the access token.
18. **Favorites are trip-group scoped**: `favorites.tripGroupId` is the only favorite resource reference.
19. **Top 5 is public**: anonymous users can request it with the public frontend bearer token.
20. **Background is public**: anonymous users can request a random background with the public frontend bearer token.
21. **Background refresh failure is non-fatal**: failure to refresh the GCS background list must preserve the last successful list and must not invalidate already loaded dynamic configuration.
22. **Admin/manager report access is protected**: normal authenticated users cannot list or delete administrative reports.
23. **Deleting a report does not delete the reported resource**: report removal and content moderation/removal are separate operations.

The frontend must preserve these semantics and must never silently turn an invalid authenticated request into an anonymous request.

---

## 21. Complete Endpoint Table

Base path: `/api/v1`. "Public" = public bearer token (anonymous read); "Auth" = user access token. "Owner/Mod" = owner or `admin`/`manager`.

| Method | Path                                  | Access           | Request                                                                 | Response                             | Errors                  |
| ------ | ------------------------------------- | ---------------- | ----------------------------------------------------------------------- | ------------------------------------ | ----------------------- |
| POST   | `/auth/register`                      | None             | `{ email, password, firstName, lastName }`                              | 201 `{ message }`                    | 400, 403                |
| POST   | `/auth/verify-email`                  | None             | `{ token }`                                                             | 200 `{ user }`                       | 400, 403                |
| POST   | `/auth/resend-verification`           | None             | `{ email }`                                                             | 200 `{ message }`                    | 400, 403, 500           |
| POST   | `/auth/login`                         | None             | `{ email, password }`                                                   | 200 `AuthSessionDto` + cookie        | 401, 403, 400           |
| POST   | `/auth/refresh`                       | Cookie           | none                                                                    | 200 `AuthSessionDto` + cookie        | 401, 403                |
| POST   | `/auth/logout`                        | Cookie           | none                                                                    | 200 `{ message }`                    | 500                     |
| GET    | `/auth/session`                       | Public/OptionalAuth | public token or valid user JWT; credentials enabled for refresh cookie | 200 `{ hasSession }`                 | 400, 401, 403, 404      |
| GET    | `/auth/me`                            | Auth             | none                                                                    | 200 `{ user }`                       | 401, 403                |
| PUT    | `/auth/me`                            | Auth             | `{ firstName, lastName }`                                               | 200 `{ user }`                       | 400, 401, 403           |
| POST   | `/auth/confirm-password`              | Auth             | `{ password }`                                                          | 200 `{ valid }`                      | 400, 401, 403           |
| PUT    | `/auth/me/password`                   | Auth             | `{ currentPassword, newPassword }`                                      | 204                                  | 400, 401, 403           |
| GET    | `/auth/me/image`                      | Auth             | none                                                                    | 200 `ImageDto` or null               | 401, 403                |
| POST   | `/auth/me/image`                      | Auth             | multipart `file`                                                        | 201 `ImageDto`                       | 400, 401, 403, 409      |
| DELETE | `/auth/me/image`                      | Auth             | none                                                                    | 204                                  | 401, 403, 404           |
| POST   | `/auth/forgot-password`               | None             | `{ email }`                                                             | 200 `{ message }`                    | 400, 403, 500           |
| POST   | `/auth/reset-password`                | None             | `{ token, password }`                                                   | 200 `{ message }`                    | 400, 403                |
| GET    | `/config/selects`                     | Public           | none                                                                    | 200 `SelectConfig[]`                 | 401                     |
| GET    | `/config/services`                    | Public           | none                                                                    | 200 `PublicServiceConfig[]`          | 401                     |
| GET    | `/trips`                              | Public           | query `page,limit,search,group,transport,sort`                          | 200 `TripGroupResponse[]`            | 400, 401                |
| GET    | `/trips/:tripGroupId`                 | Public           | param `tripGroupId` (INT)                                              | 200 `TripGroupResponse`              | 400, 401, 404           |
| GET    | `/trips/top`                           | Public           | none                                                                    | 200 `TripGroupResponse[]` (max 5)    | 401                     |
| GET    | `/me/trips`                | Auth             | none                                                                    | 200 `TripGroupResponse[]`            | 401, 403                |
| GET    | `/me/favorites`            | Auth             | none                                                                    | 200 `TripGroupResponse[]`            | 401, 403                |
| GET    | `/trips/background`              | Public           | none                                                                    | 200 `{ url }`                        | 401, 404                |
| POST   | `/trips`                              | Auth             | `{ dayNumber, title, description, group, transport }`                   | 201 `TripGroupResponse`              | 400, 401, 403           |
| DELETE | `/trips/:tripGroupId`                 | Owner/Mod        | param `tripGroupId`                                                     | 204                                  | 400, 401, 403, 404      |
| POST   | `/trips/:tripGroupId/days`            | Owner/Mod        | param `tripGroupId`; body `{ dayNumber, title?, description? }`         | 201 `TripGroupResponse`              | 400, 401, 403, 404, 409 |
| PUT    | `/trips/:tripGroupId/days/reorder`    | Owner/Mod        | param `tripGroupId`; body `{ tripIds }`                                 | 200 `TripDay[]`                      | 400, 401, 403, 404      |
| PUT    | `/trips/:tripGroupId/days/:tripId`    | Owner/Mod        | params `tripGroupId,tripId`; body `{ title?, description? }`            | 200 `TripGroupResponse`              | 400, 401, 403, 404      |
| DELETE | `/trips/:tripGroupId/days/:tripId`    | Owner/Mod        | params `tripGroupId,tripId`                                             | 204                                  | 400, 401, 403, 404, 409 |
| POST   | `/trips/:tripGroupId/days/:tripId/images` | Owner/Mod    | params `tripGroupId,tripId`; multipart `file`                           | 201 `ImageDto`                       | 400, 401, 403, 404, 409 |
| POST   | `/points`                             | Owner/Mod        | `{ tripId, name, description?, lat, lng }`                              | 201 `TripPoint[]`                    | 400, 401, 403, 404      |
| GET    | `/trips/:tripId/points`               | Public           | param `tripId` (day row id)                                             | 200 `TripPoint[]`                    | 400, 401, 404           |
| GET    | `/points/:pointId`                    | Public           | param `pointId`                                                         | 200 `TripPoint`                      | 400, 401, 404           |
| PUT    | `/points/:pointId`                    | Owner/Mod        | param `pointId`; body `{ name?, description?, lat?, lng? }`             | 200 `TripPoint[]`                    | 400, 401, 403, 404      |
| DELETE | `/points/:pointId`                    | Owner/Mod        | param `pointId`                                                         | 204                                  | 400, 401, 403, 404      |
| POST   | `/points/:pointId/images`             | Owner/Mod        | param `pointId`; multipart `file`                                       | 201 `ImageDto`                       | 400, 401, 403, 404, 409 |
| DELETE | `/points/:pointId/images/:imageId`    | Owner/Mod        | params `pointId,imageId`                                                | 204                                  | 400, 401, 403, 404      |
| PUT    | `/days/:tripId/points/reorder`        | Owner/Mod        | param `tripId`; body `{ pointIds }`                                     | 200 `TripPoint[]`                    | 400, 401, 403, 404      |
| DELETE | `/images/:imageId`                    | Owner/Mod        | param `imageId`                                                         | 204                                  | 400, 401, 403, 404      |
| GET    | `/trip-groups/:tripGroupId/comments`  | Public           | param `tripGroupId`; query `page,limit`                                 | 200 `CommentListResponse`            | 400, 401, 404           |
| POST   | `/trip-groups/:tripGroupId/comments`  | Auth             | param `tripGroupId`; body `{ comment }`                                 | 201 `CommentDto`                     | 400, 401, 404           |
| GET    | `/trips/:tripGroupId/days/:tripId/comments` | Public      | params `tripGroupId,tripId`; query `page,limit`                         | 200 `CommentListResponse`            | 400, 401, 404           |
| POST   | `/trips/:tripGroupId/days/:tripId/comments` | Auth        | params `tripGroupId,tripId`; body `{ comment }`                         | 201 `CommentDto`                     | 400, 401, 404           |
| GET    | `/points/:pointId/comments`           | Public           | param `pointId`; query `page,limit`                                     | 200 `CommentListResponse`            | 400, 401, 404           |
| POST   | `/points/:pointId/comments`           | Auth             | param `pointId`; body `{ comment }`                                     | 201 `CommentDto`                     | 400, 401, 404           |
| GET    | `/images/:imageId/comments`           | Public           | param `imageId`; query `page,limit`                                     | 200 `CommentListResponse`            | 400, 401, 404           |
| POST   | `/images/:imageId/comments`           | Auth             | param `imageId`; body `{ comment }`                                     | 201 `CommentDto`                     | 400, 401, 404           |
| PUT    | `/comments/:commentId`                | Author/Mod       | param `commentId`; body `{ comment }`                                   | 200 `CommentDto`                     | 400, 401, 403, 404      |
| DELETE | `/comments/:commentId`                | Author/Mod       | param `commentId`                                                       | 204                                  | 400, 401, 403, 404      |
| POST   | `/likes`                             | Auth             | `{ targetType, targetId }`                                              | 200 `SocialState`                    | 400, 401, 404           |
| DELETE | `/likes`                             | Auth             | query `targetType,targetId`                                             | 204                                  | 400, 401, 404           |
| POST   | `/favorites`                         | Auth             | `{ tripGroupId }`                                                       | 200 `SocialState`                    | 400, 401, 404           |
| DELETE | `/favorites`                         | Auth             | query `tripGroupId`                                                     | 204                                  | 400, 401, 404           |
| POST   | `/reports`                           | Auth             | `{ targetType, targetId, reason? }`                                     | 201 `ReportDto`                      | 400, 401, 404, 409      |
| DELETE | `/reports/:reportId`                  | Author           | param `reportId`                                                        | 204                                  | 400, 401, 403, 404      |
| GET    | `/admin/users`                        | admin/manager    | query `page,pageSize`                                                   | 200 `AdminPage<AuthUserDto>`         | 400, 401, 403           |
| PUT    | `/admin/users/:userId`                | admin/manager    | param `userId`; body `{ firstName?, lastName?, email?, role?, status?, emailVerified?, password? }` (role/password admin-only) | 200 `AuthUserDto`                    | 400, 401, 403, 404, 409 |
| DELETE | `/admin/users/:userId`                | admin/manager    | param `userId`                                                          | 204                                  | 400, 401, 403, 404, 409 |
| GET    | `/admin/failed-login-logs`            | admin/manager    | query `page,pageSize`                                                   | 200 `AdminPage<FailedLogDto>`        | 400, 401, 403           |
| DELETE | `/admin/failed-login-logs`            | admin/manager    | body `{ ids }`                                                          | 200 `{ deleted }`                    | 400, 401, 403           |
| GET    | `/admin/route-not-found-logs`         | admin/manager    | query `page,pageSize`                                                   | 200 `AdminPage<RouteNotFoundLogDto>` | 400, 401, 403           |
| GET    | `/admin/images/cloud`                 | admin/manager    | query `page,pageSize`                                                   | 200 `AdminPage<string>` (cursor)     | 400, 401, 403           |
| GET    | `/admin/images/database`              | admin/manager    | query `page,pageSize`                                                   | 200 `AdminPage<string>`              | 400, 401, 403           |
| GET    | `/admin/images/orphans`               | admin/manager    | query `page,pageSize`                                                   | 200 `ImageInventoryComparison`       | 400, 401, 403           |
| GET    | `/admin/reports`                      | admin/manager    | query `page,pageSize`                                                   | 200 `AdminPage<AdminReportDto>`      | 400, 401, 403           |
| DELETE | `/admin/reports/:reportId`            | admin/manager    | param `reportId`                                                        | 204                                  | 400, 401, 403, 404      |

---

## 22. Frontend Integration Notes

This section contains frontend-specific integration guidance. It does not change any API behavior; the rest of this document remains the authoritative behavioral contract.

### 22.1 Base URL

The frontend resolves the deployed backend API base URL from its own deployment environment (e.g. an environment variable or build-time runtime configuration). This document does not fix a production value because the production origin is deployment-specific. All paths in this document are relative to that base URL under `/api/v1`.

### 22.2 Credentials (refresh cookie)

* The refresh token is delivered in an HttpOnly cookie (`hack_trip_refresh`, scoped to `/api/v1/auth`) and never in a response body.
* Requests that must carry the cookie — `POST /auth/refresh` and `POST /auth/logout` — must be sent with credentials enabled: `credentials: 'include'` (Fetch) or `withCredentials: true` (Axios).
* The frontend never reads or stores the refresh cookie value; it is managed by the browser.
* **A completely anonymous public-page refresh must NOT cause the Frontend to call `POST /auth/refresh`.**
* Before attempting refresh on a public-page reload, the Frontend may call `GET /auth/session` with the public bearer token and credentials enabled.
* `GET /auth/session` is a read-only session-presence probe. It does not rotate or modify the refresh session and returns only `{ "hasSession": true|false }`.
* If `hasSession` is `false`, the Frontend must not call `POST /auth/refresh` and must continue as anonymous using the public bearer token.
* If `hasSession` is `true`, the Frontend may call the normal `POST /auth/refresh` flow to restore the in-memory access token.
* `POST /auth/refresh` is only relevant when the browser has an existing refresh session/cookie that the Frontend is intentionally attempting to restore.
* Public anonymous GET requests use the `PUBLIC_FRONTEND_TOKEN`; they do not require a refresh token.

### 22.3 Public anonymous request behavior

For public pages:

```http
x-hacktrip-client: web
Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>
```

The Frontend must send this public bearer token for public GET requests even when there is no logged-in user.

A public request must not attempt to manufacture or infer a user identity from the public token.

The following are public anonymous examples:

```text
GET /api/v1/trips
GET /api/v1/trips/:tripGroupId
GET /api/v1/points/:pointId
GET /api/v1/trips/top
GET /api/v1/trips/background
GET /api/v1/.../comments
```

The anonymous visitor can therefore browse public content without having a user access JWT or refresh session.

### 22.4 My Trips / My Favorites

The Frontend must not construct these URLs with a user id.

Correct:

```text
GET /api/v1/me/trips
GET /api/v1/me/favorites
```

Incorrect:

```text
GET /api/v1/me/trips/:userId
GET /api/v1/me/favorites/:userId
```

The backend obtains the current user from the authenticated access token.

### 22.5 Top 5

The Frontend can call:

```text
GET /api/v1/trips/top
```

with the public frontend token when anonymous:

```http
Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>
```

No login or refresh session is required.

The response uses the shared `TripGroupResponse[]` structure defined in section 8.

### 22.6 Background image

The Frontend can call:

```text
GET /api/v1/trips/background
```

with the public frontend token.

The response contains one selected public image URL:

```json
{
  "url": "<public-background-image-url>"
}
```

The Frontend does not need to know the GCS bucket name, list filenames, or perform GCS listing.

The Frontend must not repeatedly request the full background file list. Background discovery and random selection are backend responsibilities.

### 22.7 Dynamic configuration and background images

`GET /trips/background` returns one selected public image URL as `{ "url": "<public-background-image-url>" }`. The Frontend consumes that URL; it must not list GCS objects, choose object names, or hard-code bucket contents. Background discovery, caching, last-known-good behavior, warning logs, random selection, and URL construction are Backend responsibilities documented in §23.

### 22.8 Frontend Zod module map

The intended frontend validation organization mirrors the backend slices. The backend schemas (section 18) remain authoritative; the frontend must preserve `.strict()` behavior and exact field constraints.

```text
src/validations/
├── auth/
├── trips/
├── points/
├── comments/
├── social/
└── admin/
```

| Module      | Backend schemas                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/`     | `registerSchema`, `loginSchema`, `verifyEmailSchema`, `resendVerificationSchema`, `updateProfileSchema`, `confirmPasswordSchema`, `changePasswordSchema`, `forgotPasswordSchema`, `resetPasswordSchema` |
| `trips/`    | `tripWriteSchema`, `tripListQuerySchema`, `dayCreateSchema`, `dayUpdateSchema`, `dayReorderSchema`, `pointReorderSchema`                                                                                |
| `points/`   | `pointCreateSchema`, `pointUpdateSchema`                                                                                                                                                                |
| `comments/` | `commentBodySchema`, `commentPageQuerySchema`                                                                                                                                                           |
| `social/`   | `socialTargetBodySchema`, `socialTargetQuerySchema`, `favoriteBodySchema`, `favoriteQuerySchema`, `reportBodySchema`, `reportTargetTypeInput`                                                           |
| `admin/`    | `adminUserUpdateSchema`, `failedLogDeleteSchema`, `adminPaginationQuerySchema`, `adminReportIdParams`                                                                                                   |

Route-parameter schemas (section 18.7) are shared and used across modules: `userIdParams`, `tripIdOnlyParams`, `tripDayParams`, `pointIdParams`, `pointImageParams`, `imageIdParams`, `commentIdParams`, `tripGroupIdParams`, `reportIdParams`, `adminReportIdParams`.

### 22.9 API ownership rule

The Frontend must not send ownership fields to identify the current actor.

For authenticated endpoints:

```text
Frontend access token
        |
        v
Backend authentication middleware
        |
        v
authenticated user id
        |
        v
service ownership check
```

The following must never be used as a substitute:

```text
/frontend userId URL parameter
/frontend ownerId body field
/frontend userId body field
/frontend hidden ownership field
```

This applies particularly to:

```text
/me/trips
/me/favorites
```

---

## 23. Background Image Service Contract

This section documents the current backend architecture and behavior for background images.

### 23.1 Responsibilities

The architecture is intentionally separated:

```text
Dynamic Config
    |
    +--> Background loader/service
    |       |
    |       +--> Google Cloud Storage
    |       |
    |       +--> list object names
    |
    +--> stores latest successful names
    |
    v
Background Service
    |
    +--> reads names from dynamic config
    +--> chooses random name
    +--> builds/resolves public URL
    |
    v
Background Controller
    |
    +--> returns JSON only
```

### 23.2 Google Cloud Storage access

GCS access belongs in a dedicated service/helper responsible for Google Cloud Storage interaction.

The controller must not contain:

```text
bucket().getFiles()
random selection
GCS error handling
dynamic-config mutation
URL construction business logic
```

The service may use the existing Google Cloud Storage client infrastructure where available. A new duplicated storage client must not be introduced if the repository already has a centralized client.

### 23.3 Background object discovery

The legacy behavior lists objects from:

```text
hack-trip-background-images
```

Equivalent legacy operation:

```ts
const [files] = await storageGoogle
  .bucket('hack-trip-background-images')
  .getFiles();

return files.map((x) => x.name);
```

The current implementation preserves the object-name listing behavior while running it through the dynamic-config slow refresh architecture.

### 23.4 Last-known-good behavior

The background filename list is a cache/configuration value.

Successful load:

```text
old list -> replaced by new list
```

Failed load:

```text
old list -> retained
```

It must NOT behave as:

```text
failed load -> []
```

and it must NOT behave as:

```text
failed load -> throw -> application startup failure
```

unless the failure is caused by a completely independent startup-critical configuration requirement.

### 23.5 Logging

Background refresh failures should produce a warning log.

The warning should include enough information to identify the failed operation, for example:

```text
Failed to refresh background image configuration
```

The warning must not expose credentials, signed URLs, access tokens, or secrets.

### 23.6 Random selection

The background service receives the currently available list:

```text
[
  "IMG_0088.JPG",
  "IMG_0160.JPG",
  ...
]
```

and selects one entry randomly.

The service then resolves the selected object into the public URL expected by the Frontend.

The controller receives the final value and returns:

```json
{
  "url": "<url>"
}
```

### 23.7 No database persistence

Background images:

* are not stored in the application database;
* are not represented by `Image` records;
* do not require image IDs;
* do not require upload/delete endpoints;
* are discovered from GCS;
* are represented in dynamic configuration by object names;
* are resolved into public URLs when requested.

This is separate from normal trip/day/point images, which continue to use the existing database + GCS image architecture.

---

## 24. Trip Data Endpoint Rules

The new `/trips/*` endpoints are intentionally separated from the existing CRUD `/trips/*` endpoints.

### 24.1 Public data endpoints

These are anonymous/public:

```text
GET /trips/top
GET /trips/background
```

They require:

```http
x-hacktrip-client: web
Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>
```

They do not require:

* a logged-in user;
* a user access JWT;
* a refresh token;
* a user id.

### 24.2 Authenticated user-data endpoints

These are user-specific:

```text
GET /me/trips
GET /me/favorites
```

They require:

```http
x-hacktrip-client: web
Authorization: Bearer <USER_ACCESS_TOKEN>
```

They do not accept a user id.

The authenticated user is always obtained server-side.

### 24.3 Trip-group semantics

The three trip collection endpoints use trip-group semantics:

```text
Top 5       -> tripGroupId
My Trips    -> tripGroupId
Favorites   -> tripGroupId
```

A group can contain multiple day/trip rows.

The API must not accidentally return multiple Top 5 entries for multiple days belonging to the same group.

Favorites are always:

```text
userId + tripGroupId
```

not:

```text
userId + tripId
```

My Trips ownership is determined by:

```text
trip_groups.ownerId
```

and not by an arbitrary day row selected by the Frontend.

---

## 25. Report Moderation Rules

### 25.1 User report creation

A logged-in user can report supported content through:

```text
POST /api/v1/reports
```

The backend derives the reporting user from authentication.

A user cannot submit:

```json
{
  "userId": "..."
}
```

to impersonate another reporter.

### 25.2 Supported report targets

The current report contract supports these canonical targets:

```text
tripGroup
trip (a day row; `day` is also accepted as an input alias)
point
image
comment
```

This allows the Frontend to report inappropriate trip content and comments.

### 25.3 Automatic admin visibility

Once a report is successfully persisted:

```text
User
  |
  +--> POST /reports
          |
          v
       reports table
          |
          v
GET /admin/reports
```

No additional Frontend action is required to make the report appear in the administrative queue.

### 25.4 Admin/manager access

Only:

```text
admin
manager
```

may:

```text
GET /admin/reports
DELETE /admin/reports/:reportId
```

Normal users cannot access the report queue.

### 25.5 Delete report vs delete content

These are intentionally different:

```text
DELETE /admin/reports/:reportId
```

means:

```text
remove the report record
```

It does NOT mean:

```text
delete the reported trip
delete the reported comment
delete the reported point
delete the reported image
```

Actual content moderation/removal is a separate future capability and is not implicitly part of this report contract.

---

## 26. Current API Capabilities Summary

The following currently implemented capabilities are part of this API contract. Frontend integration must conform to them; the preceding sections define their behavior.

| Feature        | Endpoint                          | Access        | Main rule                             |
| -------------- | --------------------------------- | ------------- | ------------------------------------- |
| Top 5 trips    | `GET /trips/top`             | Public        | Up to 5 groups with at least one group-level like, sorted by like count |
| My Trips       | `GET /me/trips`        | Auth          | Current user's owned trip groups      |
| My Favorites   | `GET /me/favorites`    | Auth          | Current user's favorite trip groups   |
| Background     | `GET /trips/background`      | Public        | Random public GCS background          |
| Report list    | `GET /admin/reports`              | Admin/Manager | Automatically lists persisted reports |
| Delete report  | `DELETE /admin/reports/:reportId` | Admin/Manager | Deletes report record only            |
| Report comment | `POST /reports`                  | Auth          | `targetType=comment` supported        |
| Session probe | `GET /auth/session` | Public | Read-only refresh-session presence check; no token rotation or user data |

### Non-negotiable rules

1. **Do not add `userId` to My Trips or My Favorites URLs.**
2. **Favorites are only by `tripGroupId`.**
3. **My Trips is based on actual trip-group ownership.**
4. **Top 5 is grouped by trip group and limited to 5.**
5. **Top 5 is public and works for anonymous visitors.**
6. **Background is public and works for anonymous visitors.**
7. **All public anonymous GET requests still require `Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>`.**
8. **An anonymous visitor does not need a refresh token to use public GET endpoints.**
9. **Background filenames are loaded into dynamic config during `refreshSlow()`.**
10. **A failed background refresh keeps the last successful list and logs a warning.**
11. **Background GCS listing is not performed by the controller.**
12. **Background random selection is not performed by the controller.**
13. **The background controller returns JSON only.**
14. **Reports created by users automatically become visible to admin/manager through the report queue.**
15. **Deleting a report does not delete the reported content.**
16. **Existing endpoints continue to follow the authentication, security, image, comment, trip, schema, and DTO rules defined in this contract unless a specific section states otherwise.**
17. **Keep the endpoint inventory, schemas, DTOs, and security rules aligned with the implemented backend when they evolve.
18. **`GET /auth/session` is the only new session-presence probe: it is read-only, returns only `hasSession`, and must not rotate or expose refresh/access tokens or user identity.**
