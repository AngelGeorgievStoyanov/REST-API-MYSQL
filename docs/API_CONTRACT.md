# HackTrip Backend API Contract

This document is the authoritative, finalized production API contract of the HackTrip backend, derived from the current implemented source code (`feature/backend-modernization`). It describes what the backend currently does; it does not describe future plans, migration work, or recommendations.

Repository source code is authoritative. This document documents implemented behavior only.

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

Every Frontend API request must carry:

```http
x-hacktrip-client: web
```

This is a public, copyable request-shape filter — NOT authentication and NOT authorization.

- A request without this header to a `/api/v1` or `/api/v1/...` path is answered with `404` and the standard API error body `{ "error": { "code": "NOT_FOUND", "message": "Resource not found." } }`.
- A request without this header to a non-`/api/v1` path is answered with an empty `404` body (`.end()`).
- `OPTIONS` (CORS preflight) cannot carry custom headers, so it bypasses this filter and is handled by CORS.

### 1.2 Public frontend bearer token

The anonymous/public Frontend context uses:

```http
Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>
```

- Default value: `hacktrip-public-v1` (overridable via `PUBLIC_FRONTEND_TOKEN`).
- The token is public, non-secret, copyable, and is not a JWT, a user credential, a session, or an ownership identity.
- It is compared by raw string equality only and is never passed to JWT verification.
- It grants anonymous, read-only access only; it grants no user, session, or ownership identity and no write capability.

### 1.3 CORS

- Production origins: `https://hack-trip.com`, `https://www.hack-trip.com`.
- Development origin: `http://localhost:3000` (only outside production).
- Methods: `GET,POST,PUT,DELETE`.
- Allowed headers: `x-hacktrip-client`, `Content-Type`, `Authorization`.
- `credentials: true` (the refresh-token cookie is HttpOnly and requires credentialed cross-origin requests).

### 1.4 Security headers

- `X-Powered-By` is disabled.
- HSTS: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.
- Proxy trust: 1 hop (`trust proxy = 1`).

### 1.5 Request body limits

- JSON: `1mb`.
- URL-encoded: `100kb` with `parameterLimit: 1000`.
- Multipart (images only): handled by a route-specific Multer configuration; one binary part, `25 MB` per file (see Images).

### 1.6 Rate limits

Public API rate limit (applied to everything under `/api`):

- Fixed window `60s`, `120` requests per client IP.
- Exceeding it produces `403` with error code `FORBIDDEN` (the contract has no `429`).

Authentication rate limit (applied only to auth endpoints):

- Default window `15 * 60s` (900s), default `10` attempts per window for credential/token endpoints (`register`, `verify-email`, `login`, `refresh`, `confirm-password`, `change-password`, `reset-password`).
- Default `5` attempts per window for email-sending endpoints (`resend-verification`, `forgot-password`).
- Exceeding it produces `403` with error code `FORBIDDEN`.
- Keyed by client IP + route bucket. Values are configurable via `AUTH_RATE_LIMIT_WINDOW_SECONDS`, `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_EMAIL_MAX`.

Administrative rate limit (applied to every admin endpoint):

- `120` requests per window per client IP (window = auth rate-limit window, default 900s).
- Exceeding it produces `403 FORBIDDEN`.

### 1.7 Validation model

- Request validation uses Zod with `.strict()` on every body/params/query schema: undeclared body fields, query parameters, and route parameters are rejected with `400 VALIDATION_ERROR`.
- Endpoints that declare no body/query/params must receive an empty corresponding part; a non-empty undeclared part is rejected with `400 VALIDATION_ERROR`.
- A rejected request is `400` with code `VALIDATION_ERROR` and a message naming the offending field. At most 3 issues are reported per validation failure.

### 1.8 Strictness summary

- All request bodies are `.strict()`: unknown JSON keys are rejected.
- All query schemas are `.strict()`: unknown query parameters are rejected.
- All route-parameter schemas are `.strict()`.

---

## 2. Authentication Contract

### 2.1 Access token

- Type: JWT (HS256).
- Secret: `JWT_ACCESS_SECRET` (required; the API refuses to start without it).
- Payload claims: `{ sub: <userId>, type: 'access' }`.
- `sub` is the user id (UUID string). Role and status are NOT taken from token claims; they are always read from the database row.
- Expiry: `ACCESS_TOKEN_EXPIRES_IN` seconds; default `900` (15 minutes).

### 2.2 Refresh token

- Type: opaque random token, 32 bytes hex-encoded = 64 characters.
- Only its SHA-256 hash is stored in the database (`refresh_tokens.tokenHash`).
- Delivered via an HttpOnly cookie and never in a response body.

Refresh cookie:

| Property | Value |
| --- | --- |
| name | `hack_trip_refresh` |
| HttpOnly | `true` |
| Secure | `true` in production (or when `COOKIE_SECURE=true`) |
| SameSite | `none` in production (default), `lax` in development; overridable via `COOKIE_SAME_SITE` |
| Path | `/api/v1/auth` |
| Expiration | `refreshTokenExpiresAt` (now + `REFRESH_TOKEN_EXPIRES_IN` seconds) |
| maxAge | `REFRESH_TOKEN_EXPIRES_IN * 1000` ms |

`REFRESH_TOKEN_EXPIRES_IN` default: `2592000` seconds (30 days).

Rotation behavior:

- Every successful `login` and `refresh` issues a NEW refresh token (the old one is revoked on refresh).
- A `refresh` that finds a token whose `revokedAt` is already set treats it as REUSE: all active refresh sessions of that account are revoked, and the request is answered with `401 UNAUTHORIZED` (message "The refresh session was already revoked. All sessions of this account were revoked.").
- An expired refresh token is `401 UNAUTHORIZED` ("The refresh session has expired.").
- A missing/unknown refresh token is `401 UNAUTHORIZED` ("The refresh session is not valid.").

### 2.3 Account status rules (enforced on every authenticated request and every login/refresh)

- `PENDING_VERIFICATION` or `emailVerifiedAt === null`: `403 EMAIL_NOT_VERIFIED`.
- `SUSPENDED`: `403 ACCOUNT_SUSPENDED`.
- `DEACTIVATED`: `403 ACCOUNT_DEACTIVATED`.
- Missing user (valid token but account deleted): `401 UNAUTHORIZED`.

### 2.4 Email / password-reset tokens

- Email verification token TTL: `86400` seconds (24h).
- Password reset token TTL: `3600` seconds (1h).
- Tokens are one-time; only the SHA-256 hash is stored.

### 2.5 Auth email links

The emailed verification and password-reset links are constructed as `<appUrl><path>?token=<rawToken>` (the raw token is URL-encoded).

- `appUrl` = `AUTH_APP_URL` (default `https://www.hack-trip.com`; trailing slash trimmed).
- Verification path = `AUTH_VERIFY_EMAIL_PATH` (default `/verify-email`).
- Password-reset path = `AUTH_PASSWORD_RESET_PATH` (default `/reset-password`).
- A leading `/` is added to the path when it is not already present.

The raw token only appears inside the email sent to the account owner; it is never logged or returned in an API response.

---

## 3. Headers

### 3.1 Required request headers

| Header | Required | Value | Purpose |
| --- | --- | --- | --- |
| `x-hacktrip-client` | Always (except `OPTIONS`) | `web` | Frontend client marker |
| `Authorization` | At every authentication boundary (including public reads) | `Bearer <token>` | Bearer classification |

### 3.2 Authentication outcomes (shared v1 boundary)

| Request state | Result |
| --- | --- |
| No `Authorization` header | `404 NOT_FOUND` (never anonymous) |
| `Authorization: Bearer <PUBLIC_FRONTEND_TOKEN>` | Anonymous context on optional-auth routes; `401 UNAUTHORIZED` on protected routes |
| `Authorization: Bearer <USER_ACCESS_TOKEN>` (valid) | Authenticated user context |
| Invalid/expired user access JWT | `401 UNAUTHORIZED` (never anonymous) |
| Valid JWT + suspended/deactivated/unverified account | `403` with the relevant account-status code |

The public token is never passed to JWT verification. An invalid user JWT is never downgraded to anonymous.

---

## 4. Error Contract

Every error (including route-not-found and rate-limit) uses the same JSON shape:

```json
{ "error": { "code": "<CODE>", "message": "<message>" } }
```

### 4.1 Error codes and HTTP status

| Code | HTTP | Notes |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Validation failures (incl. bad tokens, oversized/parse-failed bodies) |
| `UNAUTHORIZED` | 401 | Missing/invalid token, invalid credentials, account gone, refresh failures |
| `FORBIDDEN` | 403 | Role/ownership/authorization denial; rate limiting (no 429 in contract) |
| `EMAIL_NOT_VERIFIED` | 403 | Correct password but email unverified |
| `ACCOUNT_SUSPENDED` | 403 | Suspended account |
| `ACCOUNT_DEACTIVATED` | 403 | Deactivated account |
| `NOT_FOUND` | 404 | Generic not found; also missing client header and missing Authorization on auth boundaries |
| `TRIP_NOT_FOUND` | 404 | Trip (group) not found / ownerless trip during modification |
| `CONFLICT` | 409 | Duplicate/conflict (image limit, last-day delete, duplicate report, user still owns content, duplicate day number) |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected errors (details logged server-side only) |

### 4.2 Status codes used

`200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `500`.

There is no `429`: rate limiting is reported as `403 FORBIDDEN`.

### 4.3 Body-parser failures

- `entity.too.large` -> `400 VALIDATION_ERROR` "The request body is too large."
- `entity.parse.failed` -> `400 VALIDATION_ERROR` "The request body is not valid JSON."
- `encoding.unsupported` -> `400 VALIDATION_ERROR` "The request body encoding is not supported."

---

## 5. Access Control Matrix

Roles: `user`, `admin`, `manager`.

- `MODERATOR_ROLES` = `admin`, `manager` (may modify any trip/day/point/image and perform admin reads + moderation).
- `ADMIN_ROLES` = `admin` (full account administration: user updates).
- `ADMIN_OR_MODERATOR_ROLES` = `admin`, `manager`.

Authorization model:

- `requireAuthentication`: bearer required; public token -> `401`; invalid token -> `401`; account status enforced; role is NOT checked.
- `optionalAuthentication`: bearer required; public token -> anonymous; valid token -> authenticated viewer; invalid token -> `401`; no bearer -> `404`.
- `requireRole([...roles])`: `requireAuthentication` + the database row's role must be in the given list, else `403 FORBIDDEN`.
- Ownership (`canModifyTrip`): the actor may modify a trip/day/point/image only when `ownerId === actor.id` OR the actor's role is `admin` or `manager`.

### 5.1 Matrix

| Endpoint | Anonymous | Authenticated | Owner | Manager | Admin |
| --- | --- | --- | --- | --- | --- |
| GET `/auth/me` | NO (404/401) | YES | — | — | — |
| PUT `/auth/me` | NO | YES (self only) | — | — | — |
| GET/POST/DELETE `/auth/me/image` | NO | YES (self only) | — | — | — |
| GET `/config/selects` | YES (public token) | YES | — | — | — |
| GET `/config/services` | YES (public token) | YES | — | — | — |
| GET `/trips` | YES (public token) | YES | — | — | — |
| GET `/trips/:id` | YES (public token) | YES | — | — | — |
| POST `/trips` | NO | YES | — | — | — |
| PUT `/trips/:id` | NO | CONDITIONAL | YES | YES | YES |
| DELETE `/trips/:id` | NO | CONDITIONAL | YES | YES | YES |
| POST `/trips/:tripId/days` | NO | CONDITIONAL | YES | YES | YES |
| PUT `/trips/:tripId/days/reorder` | NO | CONDITIONAL | YES | YES | YES |
| PUT `/trips/:tripId/days/:dayId` | NO | CONDITIONAL | YES | YES | YES |
| DELETE `/trips/:tripId/days/:dayId` | NO | CONDITIONAL | YES | YES | YES |
| POST `/trips/:tripId/days/:dayId/images` | NO | CONDITIONAL | YES | YES | YES |
| GET `/points/:pointId` | YES (public token) | YES | — | — | — |
| POST `/points` | NO | CONDITIONAL | YES | YES | YES |
| PUT `/points/:pointId` | NO | CONDITIONAL | YES | YES | YES |
| DELETE `/points/:pointId` | NO | CONDITIONAL | YES | YES | YES |
| POST `/points/:pointId/images` | NO | CONDITIONAL | YES | YES | YES |
| DELETE `/points/:pointId/images/:imageId` | NO | CONDITIONAL | YES | YES | YES |
| PUT `/days/:dayId/points/reorder` | NO | CONDITIONAL | YES | YES | YES |
| DELETE `/images/:imageId` | NO | CONDITIONAL | YES | YES | YES |
| GET (comments) | YES (public token) | YES | — | — | — |
| POST (comments) | NO | YES | — | — | — |
| PUT `/comments/:commentId` | NO | CONDITIONAL (author only) | — | — | — |
| DELETE `/comments/:commentId` | NO | CONDITIONAL (author/owner/moderator) | YES | YES | YES |
| POST/DELETE `/likes/` | NO | YES | — | — | — |
| POST/DELETE `/favorites/` | NO | YES | — | — | — |
| POST `/reports/` | NO | YES | — | — | — |
| GET `/admin/users` | NO | NO | NO | YES | YES |
| PUT `/admin/users/:userId` | NO | NO | NO | NO | YES |
| DELETE `/admin/users/:userId` | NO | NO | NO | YES | YES |
| GET/DELETE `/admin/failed-login-logs` | NO | NO | NO | YES | YES |
| GET `/admin/route-not-found-logs` | NO | NO | NO | YES | YES |
| GET `/admin/images/cloud` | NO | NO | NO | YES | YES |
| GET `/admin/images/database` | NO | NO | NO | YES | YES |
| GET `/admin/images/orphans` | NO | NO | NO | YES | YES |

> CONDITIONAL on trip/day/point/image mutation endpoints means: the authenticated actor must be the trip-group owner OR have role `admin`/`manager`. On `PUT /comments/:commentId` it means: the actor must be the comment author. On `DELETE /comments/:commentId` it means: the actor must be the author, the trip-group owner, or a moderator (`admin`/`manager`).

---

## 6. Auth Endpoints

All auth routes are mounted at `/api/v1/auth`.

### 6.1 POST `/auth/register`

- Auth: none. Rate-limited (`register` bucket).
- Body (strict): `{ email, password, firstName, lastName }`.
- Response `201`: `{ "message": "..." }` (`MessageResponse`).
- Anti-enumeration: an already-registered email and a successful registration return the same message ("If the address can be registered, verification instructions will be sent.").

### 6.2 POST `/auth/verify-email`

- Auth: none. Rate-limited (`verify-email` bucket).
- Body (strict): `{ token }`.
- Response `200`: `{ "user": AuthUserDto }`.
- Errors: unknown/used/expired token -> `400 VALIDATION_ERROR`.

### 6.3 POST `/auth/resend-verification`

- Auth: none. Rate-limited (email, `resend-verification` bucket).
- Body (strict): `{ email }`.
- Response `200`: `{ "message": "..." }`.
- Anti-enumeration: unknown/verified accounts answer the same message.

### 6.4 POST `/auth/login`

- Auth: none. Rate-limited (`login` bucket).
- Body (strict): `{ email, password }`.
- Response `200`: `AuthSessionDto` and sets the refresh cookie.
- Errors: invalid credentials -> `401 UNAUTHORIZED`; suspended -> `403 ACCOUNT_SUSPENDED`; deactivated -> `403 ACCOUNT_DEACTIVATED`; unverified -> `403 EMAIL_NOT_VERIFIED`.

`AuthSessionDto`:

```json
{ "accessToken": "<jwt>", "tokenType": "Bearer", "expiresIn": 900, "user": AuthUserDto }
```

### 6.5 POST `/auth/refresh`

- Auth: none (reads the refresh cookie). Rate-limited (`refresh` bucket). No body/query/params.
- Response `200`: `AuthSessionDto` and rotates (sets a new) refresh cookie.
- Errors: missing/unknown -> `401 UNAUTHORIZED`; expired -> `401 UNAUTHORIZED`; reuse -> `401 UNAUTHORIZED` (all sessions revoked); unusable account -> `403` account-status code. On refusal, the stale cookie is cleared.

### 6.6 POST `/auth/logout`

- Auth: none (reads the refresh cookie). No body/query/params.
- Response `200`: `{ "message": "Logged out." }` and clears the refresh cookie. Idempotent.

### 6.7 GET `/auth/me`

- Auth: `requireAuthentication`. No body/query/params.
- Response `200`: `{ "user": AuthUserDto }`.

### 6.8 PUT `/auth/me`

- Auth: `requireAuthentication`.
- Body (strict): `{ firstName, lastName }`.
- Response `200`: `{ "user": AuthUserDto }`.

### 6.9 POST `/auth/confirm-password`

- Auth: `requireAuthentication`. Rate-limited (`confirm-password` bucket).
- Body (strict): `{ password }`.
- Response `200`: `{ "valid": true|false }`.

### 6.10 PUT `/auth/me/password`

- Auth: `requireAuthentication`. Rate-limited (`change-password` bucket).
- Body (strict): `{ currentPassword, newPassword }`.
- Response `204` (empty). Revokes all refresh sessions of the account.
- Errors: wrong current password -> `401 UNAUTHORIZED`.

### 6.11 GET `/auth/me/image`

- Auth: `requireAuthentication`. No body/query/params.
- Response `200`: `ImageDto` or `null` (no profile image).

### 6.12 POST `/auth/me/image`

- Auth: `requireAuthentication`. Multipart upload (field `file`, exactly one file).
- Response `201`: `ImageDto`. Replaces any previous profile image (the previous file is removed).

### 6.13 DELETE `/auth/me/image`

- Auth: `requireAuthentication`. No body/query/params.
- Response `204` (empty). Error: no profile image -> `404 NOT_FOUND`.

### 6.14 POST `/auth/forgot-password`

- Auth: none. Rate-limited (email, `forgot-password` bucket).
- Body (strict): `{ email }`.
- Response `200`: `{ "message": "..." }` (anti-enumeration: "If the account exists, a password reset email was sent.").

### 6.15 POST `/auth/reset-password`

- Auth: none. Rate-limited (`reset-password` bucket).
- Body (strict): `{ token, password }`.
- Response `200`: `{ "message": "..." }`. Revokes all refresh sessions of the account.
- Errors: unknown/used/expired token -> `400 VALIDATION_ERROR`.

### 6.16 `AuthUserDto` (returned by auth endpoints)

```json
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

- Query/body/params: none.
- Response `200`: `SelectConfig[]`.

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

- Query/body/params: none.
- Response `200`: `PublicServiceConfig[]` (public-safe subset only).

`PublicServiceConfig`:

```json
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

- A **Trip** = one `trip_groups` row. Its `id` is the trip id.
- A **Day** = one `trips` row of that group. A day has no separate entity; a day's only identifier is that row's `Trip.id`.
- A Day's `dayNumber` is an ordering value (1..n), NOT an identifier.
- A trip's metadata (`title`, `description`, `group`, `transport`) is stored on the canonical (lowest `dayNumber`) day row.
- `group`/`transport` are dynamic-config select keys resolved to `{ key, name }` in responses.
- Days are returned in `dayNumber` ascending order (tie-break `id` ascending).
- Points within a day are returned in numeric `pointNumber` order.

### 8.1 GET `/trips`

- Auth: `optionalAuthentication` (public token = anonymous; user token = viewer-specific social state).
- Query (strict): `page`, `limit`, `search`, `group`, `transport`, `sort`.
- Response `200`: `TripListResponse`.

`TripListResponse`:

```json
{
  "items": [ TripListItem ],
  "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
}
```

`TripListItem`:

```json
{
  "id": 0,
  "title": "<string>",
  "description": null | "<string>",
  "group": { "key": "<string>", "name": "<string>" },
  "transport": { "key": "<string>", "name": "<string>" },
  "author": { "id": "<uuid>", "firstName": "<string>", "lastName": "<string>" },
  "coverImage": null | "<url>",
  "createdAt": null | "<iso>"
}
```

Query semantics:

- `page` default `1`, max `10000`.
- `limit` default `20`, max `100`.
- `sort` = `newest` (default) or `oldest` (order by trip-group `createdAt`, tie-break `id`).
- `search` = substring match (`contains`) on a day's `title` or `description`.
- `group` / `transport` = filter by select value; accepts either the select `key` or the display `value` (case-insensitive). Unknown value -> `400 VALIDATION_ERROR`.
- Filters combine with AND on a single day row (a trip matches when at least one of its days satisfies all given filters).

### 8.2 GET `/trips/:id`

- Auth: `optionalAuthentication`.
- Path params (strict): `{ id: positiveInteger }`.
- Response `200`: `TripDetails`. Missing trip -> `404 TRIP_NOT_FOUND`.

`TripDetails`:

```json
{
  "id": 0,
  "title": "<string>",
  "description": null | "<string>",
  "group": { "id": 0, "key": "<string>", "name": "<string>" },
  "transport": { "key": "<string>", "name": "<string>" },
  "author": { "id": "<uuid>", "firstName": "<string>", "lastName": "<string>" },
  "coverImage": null | "<url>",
  "days": [ TripDay ],
  "social": SocialState,
  "createdAt": null | "<iso>",
  "updatedAt": null | "<iso>"
}
```

### 8.3 POST `/trips`

- Auth: `requireAuthentication`.
- Body (strict): `{ title, description, group, transport }`.
- Response `201`: `TripDetails`.

### 8.4 PUT `/trips/:id`

- Auth: `requireAuthentication` + owner/moderator (else `403 FORBIDDEN`).
- Path params (strict): `{ id }`. Body (strict): `{ title, description, group, transport }`.
- Response `200`: `TripDetails`.

### 8.5 DELETE `/trips/:id`

- Auth: `requireAuthentication` + owner/moderator.
- Path params (strict): `{ id }`.
- Response `204` (empty).

### 8.6 POST `/trips/:tripId/days`

- Auth: `requireAuthentication` + owner/moderator.
- Path params (strict): `{ tripId }`. Body (strict): `{ dayNumber?, title?, description? }`.
- Response `201`: `TripDay`.
- `dayNumber` omitted -> assigned `max(dayNumber)+1`. Duplicate `dayNumber` -> `409 CONFLICT` ("Day N already exists in this trip.").

### 8.7 PUT `/trips/:tripId/days/reorder`

- Auth: `requireAuthentication` + owner/moderator.
- Path params (strict): `{ tripId }`. Body (strict): `{ dayIds: number[] }`.
- Response `200`: `TripDay[]` (re-ordered).
- `dayIds` must contain exactly all day ids of the trip; otherwise `400 VALIDATION_ERROR`.

### 8.8 PUT `/trips/:tripId/days/:dayId`

- Auth: `requireAuthentication` + owner/moderator.
- Path params (strict): `{ tripId, dayId }` (`dayId` = the day row's `Trip.id`).
- Body (strict): `{ title?, description? }` (at least one required).
- Response `200`: `TripDay`.

### 8.9 DELETE `/trips/:tripId/days/:dayId`

- Auth: `requireAuthentication` + owner/moderator.
- Path params (strict): `{ tripId, dayId }`.
- Response `204` (empty).
- Error: deleting the last remaining day -> `409 CONFLICT` ("The last day of a trip cannot be deleted.").

### 8.10 POST `/trips/:tripId/days/:dayId/images`

- Auth: `requireAuthentication` + owner/moderator (ownership checked BEFORE the file is stored).
- Path params (strict): `{ tripId, dayId }`.
- Multipart: field `file`, exactly one file.
- Response `201`: `ImageDto`.
- Error: day already has 9 images -> `409 CONFLICT`.

---

## 9. Day Endpoints

Mounted at `/api/v1/days`.

### 9.1 PUT `/days/:dayId/points/reorder`

- Auth: `requireAuthentication` + owner/moderator.
- Path params (strict): `{ dayId }` (`dayId` = the day row's `Trip.id`).
- Body (strict): `{ pointIds: number[] }`.
- Response `200`: `TripPoint[]` (re-ordered).
- `pointIds` must contain exactly all point ids of the day (may be an empty array for zero points); otherwise `400 VALIDATION_ERROR`.

---

## 10. Point Endpoints

Mounted at `/api/v1/points`.

### 10.1 POST `/points`

- Auth: `requireAuthentication` + owner/moderator (of the day's trip group).
- Body (strict): `{ dayId, title, description?, latitude, longitude }`.
- Response `201`: `TripPoint`.
- `dayId` is the API's name for the day the point belongs to; its value is the day row's `Trip.id`.
- `pointNumber` MUST NOT be sent: it is generated by the server (the next number in the day). Client-controlled ownership/sequence fields (`ownerId`, `userId`, `tripId`, `pointNumber`, `numberPoint`, `_ownerId`, `_ownerTripId`) are rejected.

### 10.2 GET `/points/:pointId`

- Auth: `optionalAuthentication`.
- Path params (strict): `{ pointId }`.
- Response `200`: `TripPoint`. Missing -> `404 NOT_FOUND`.

### 10.3 PUT `/points/:pointId`

- Auth: `requireAuthentication` + owner/moderator.
- Path params (strict): `{ pointId }`.
- Body (strict): `{ title?, description?, latitude?, longitude? }` (at least one required).
- Response `200`: `TripPoint`.
- `pointNumber`/`numberPoint` cannot be changed (rejected).

### 10.4 DELETE `/points/:pointId`

- Auth: `requireAuthentication` + owner/moderator.
- Path params (strict): `{ pointId }`.
- Response `204` (empty).

### 10.5 POST `/points/:pointId/images`

- Auth: `requireAuthentication` + owner/moderator (ownership checked BEFORE the file is stored).
- Path params (strict): `{ pointId }`.
- Multipart: field `file`, exactly one file.
- Response `201`: `ImageDto`.
- Error: point already has 9 images -> `409 CONFLICT`.

### 10.6 DELETE `/points/:pointId/images/:imageId`

- Auth: `requireAuthentication` + owner/moderator.
- Path params (strict): `{ pointId, imageId }`.
- Response `204` (empty).

### 10.7 `TripPoint` (point response DTO)

```json
{
  "id": 0,
  "title": "<string>",
  "description": null | "<string>",
  "latitude": null | 0.0,
  "longitude": null | 0.0,
  "images": [ SocialImageDto ],
  "social": SocialState
}
```

### 10.8 `TripDay` (day response DTO)

```json
{
  "id": 0,
  "day": 1,
  "title": null | "<string>",
  "images": [ SocialImageDto ],
  "points": [ TripPoint ],
  "social": SocialState
}
```

### 10.9 `SocialState`

```json
{
  "likes": 0,
  "likedByMe": false,
  "comments": { "count": 0 },
  "favorites": 0,          // present ONLY on trip-group targets
  "favoritedByMe": false   // present ONLY on trip-group targets
}
```

### 10.10 `ImageDto` / `SocialImageDto`

```json
// ImageDto
{ "id": 0, "url": "<url>", "thumbnailUrl": "<url>" }

// SocialImageDto
{ "id": 0, "url": "<url>", "thumbnailUrl": "<url>", "social": SocialState }
```

---

## 11. Image Endpoints

Mounted at `/api/v1/images`.

### 11.1 DELETE `/images/:imageId`

- Auth: `requireAuthentication` + owner/moderator (the image must be attached to a day of a trip group; a profile image or unattached image is `404 NOT_FOUND`).
- Path params (strict): `{ imageId }`.
- Response `204` (empty). The original object and its thumbnail sidecar are deleted from storage before the row is removed.

### 11.2 Image upload contract (all image uploads)

Applies to `POST /auth/me/image`, `POST /trips/:tripId/days/:dayId/images`, and `POST /points/:pointId/images`.

- Multipart field name: `file`.
- Exactly one binary part per request; no text fields are part of the contract (`files: 1`, `fields: 0`, `parts: 1`).
- Max file size: `25 MB` (`MAX_UPLOAD_BYTES`).
- Accepted MIME (declared): `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
- Accepted extensions: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`.
- Decoded format (authoritative; bytes are inspected with Sharp): `jpeg`, `png`, `webp`, `gif`. HEIC/HEIF, SVG, TIFF, AVIF are not accepted.
- Decoded dimension ceilings: width/height <= `10000`, total pixels <= `50_000_000` (counting all frames).
- Processing: the backend re-encodes/sanitizes the image (EXIF orientation applied via `rotate()`; re-encoded per format). The frontend is expected only to stay within the 25 MB upload cap; the backend does its own sanitizing/re-encoding and thumbnail generation.
- Storage: server-generated object key `images/<uuid>.<ext>`; create-only writes (`ifGenerationMatch: 0`). The original is stored as-is (sanitized), and a thumbnail sidecar `<name>_thumb.webp` (800x600, `fit: inside`, quality 80, webp) is generated.
- Max images per entity: `9` per day row and `9` per point (a day image row has `Image.tripId` = day row id; a point image row has `Image.pointId`).
- Oversized/unsupported uploads are `400 VALIDATION_ERROR`; a generated-key collision is `409 CONFLICT`.

### 11.3 Image URL construction

`ImageDto.url` and `ImageDto.thumbnailUrl` are built from the stored `images.filePath` (`src/mappers/imageMapper.ts`):

- If `filePath` already starts with `http://` or `https://`, it is returned unchanged.
- Otherwise it is prefixed with `visual.image_base_url` (trailing slashes trimmed): `<image_base_url>/<filePath>`.
- The thumbnail URL uses the thumbnail sidecar name `<base>_thumb.webp` (see section 11.2).
- `image_base_url` is read from the runtime dynamic config (`visual` service, key `image_base_url`).

---

## 12. Comment Endpoints

Mounted at the v1 root (`commentController` spans several prefixes). Reading is public (`optionalAuthentication`); writing requires authentication.

### 12.1 List comments (GET)

- `GET /trip-groups/:tripGroupId/comments`
- `GET /trips/:tripId/days/:dayId/comments`
- `GET /points/:pointId/comments`
- `GET /images/:imageId/comments`

- Auth: `optionalAuthentication`.
- Query (strict): `{ page?, limit? }` (`page` default `1`, max `10000`; `limit` default `10`, max `100`).
- Response `200`: `CommentListResponse`.
- Ordering: newest first (`createdAt DESC`, tie-break `id DESC`).

`CommentListResponse`:

```json
{ "items": [ CommentDto ], "page": 1, "limit": 10, "total": 0 }
```

`CommentDto`:

```json
{
  "id": 0,
  "author": { "id": "<uuid>", "name": "<string>" },
  "text": "<string>",
  "editCount": 0,
  "createdAt": null | "<iso>",
  "updatedAt": null | "<iso>"
}
```

### 12.2 Create comment (POST)

- `POST /trip-groups/:tripGroupId/comments`
- `POST /trips/:tripId/days/:dayId/comments`
- `POST /points/:pointId/comments`
- `POST /images/:imageId/comments`

- Auth: `requireAuthentication`.
- Body (strict): `{ text }`.
- Response `201`: `CommentDto`.
- The author name snapshot is built server-side from the user's `firstName lastName` (trimmed, max 45 chars).

### 12.3 PUT `/comments/:commentId`

- Auth: `requireAuthentication` + author only (else `403 FORBIDDEN`).
- Path params (strict): `{ commentId }`.
- Body (strict): `{ text }`.
- Response `200`: `CommentDto` (increments `editCount`).

### 12.4 DELETE `/comments/:commentId`

- Auth: `requireAuthentication`; allowed for the comment author, the trip-group owner, or a moderator (`admin`/`manager`).
- Path params (strict): `{ commentId }`.
- Response `204` (empty).

---

## 13. Like Endpoints

Mounted at `/api/v1/likes`.

### 13.1 POST `/likes/`

- Auth: `requireAuthentication`.
- Body (strict): `{ targetType, targetId }`.
- Response `200`: `SocialState` (idempotent; repeating a like is a no-op).
- The target must exist; otherwise `404 NOT_FOUND`.

### 13.2 DELETE `/likes/`

- Auth: `requireAuthentication`.
- Query (strict): `{ targetType, targetId }`.
- Response `204` (empty). Idempotent.

### 13.3 Valid `targetType` values

Accepted input values (case-insensitive, trimmed, lowercased): `tripgroup`, `day`, `trip`, `point`, `image`.

Canonical mapping:

| Input | Canonical `targetType` (returned in reports) | Target resource |
| --- | --- | --- |
| `tripgroup` | `tripGroup` | a trip group (`trip_groups.id`) |
| `day` | `trip` | a day row (`trips.id`) |
| `trip` | `trip` (alias of `day`) | a day row (`trips.id`) |
| `point` | `point` | a point (`points.id`) |
| `image` | `image` | an image (`images.id`) |

`targetId` is the numeric id of that resource. `trip` is the accepted alias of `day`.

---

## 14. Favorite Endpoints

Mounted at `/api/v1/favorites`. Favorites exist on trip groups only.

### 14.1 POST `/favorites/`

- Auth: `requireAuthentication`.
- Body (strict): `{ tripGroupId }`.
- Response `200`: `SocialState` (the group's state, including `favorites`/`favoritedByMe`). Idempotent.

### 14.2 DELETE `/favorites/`

- Auth: `requireAuthentication`.
- Query (strict): `{ tripGroupId }`.
- Response `204` (empty). Idempotent.

---

## 15. Report Endpoints

Mounted at `/api/v1/reports`.

### 15.1 POST `/reports/`

- Auth: `requireAuthentication`.
- Body (strict): `{ targetType, targetId, reason? }`.
- Response `201`: `ReportDto`.
- Error: the same user already reported the same target -> `409 CONFLICT` ("You have already reported this resource.").

`ReportDto`:

```json
{
  "id": 0,
  "targetType": "tripGroup" | "trip" | "point" | "image",
  "targetId": 0,
  "reason": null | "<string>",
  "createdAt": null | "<iso>"
}
```

Reports are write-only from the public API (never read back).

---

## 16. Admin Endpoints

Mounted at `/api/v1/admin`. Every admin endpoint is guarded by the admin rate limit (`120`/window/IP) and by role middleware. Role gates are defined in code (`ADMIN_ROLES` = `admin`; `ADMIN_OR_MODERATOR_ROLES` = `admin`, `manager`).

Admin pagination query (strict, shared by all admin list endpoints):

- `page`: positive integer, default `1`, max `10000`.
- `pageSize`: positive integer, default `50`, max `100`.

### 16.1 GET `/admin/users`

- Role: `admin` or `manager`.
- Response `200`: `AdminPage<AuthUserDto>` (ordered by email asc).

```json
{
  "items": [ AuthUserDto ],
  "pagination": { "page": 1, "pageSize": 50, "total": 0, "totalPages": 0 }
}
```

### 16.2 PUT `/admin/users/:userId`

- Role: `admin` ONLY.
- Path params (strict): `{ userId: UUID }`.
- Body (strict): `{ firstName?, lastName?, role?, status? }` (at least one required).
  - `role` enum: `user` | `admin` | `manager`.
  - `status` enum: `PENDING_VERIFICATION` | `ACTIVE` | `SUSPENDED` | `DEACTIVATED`.
- Response `200`: `AuthUserDto`.
- Identity/credential/verification fields (`id`, `email`, `hashedPassword`, `password`, `imageFile`, `verifyEmail`, `emailVerifiedAt`, `createdAt`) are not settable and are rejected.

### 16.3 DELETE `/admin/users/:userId`

- Role: `admin` or `manager`.
- Path params (strict): `{ userId: UUID }`.
- Response `204` (empty).
- Error: user still owns trips/days/points/comments -> `409 CONFLICT` ("The account still owns trips, days, points or comments.").

### 16.4 GET `/admin/failed-login-logs`

- Role: `admin` or `manager`.
- Response `200`: `AdminPage<FailedLogDto>` (newest first).

`FailedLogDto`:

```json
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

- Role: `admin` or `manager`.
- Body (strict): `{ ids: number[] }` (1..200 ids, no duplicates).
- Response `200`: `{ "deleted": <number> }`.

### 16.6 GET `/admin/route-not-found-logs`

- Role: `admin` or `manager`.
- Response `200`: `AdminPage<RouteNotFoundLogDto>` (newest first).

`RouteNotFoundLogDto`:

```json
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

- Role: `admin` or `manager`.
- Response `200`: `AdminPage<string>` (cursor-style: `{ items: string[], pagination: { page, pageSize, hasNext } }`).
- Items are sorted, deduplicated GCS object names.

### 16.8 GET `/admin/images/database`

- Role: `admin` or `manager`.
- Response `200`: `AdminPage<string>` (`{ items: string[], pagination: { page, pageSize, total, totalPages } }`).
- Items are `images.filePath` values ordered by id asc.

### 16.9 GET `/admin/images/orphans`

- Role: `admin` or `manager`.
- Response `200`: `ImageInventoryComparison`.

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

---

## 17. Pagination

### 17.1 Trip list (`GET /trips`)

- `page`: default `1`, min `1`, max `10000`.
- `limit`: default `20`, min `1`, max `100`.
- Response `pagination`: `{ page, limit, total, totalPages }` (`totalPages = ceil(total/limit)`, `0` when total is 0).

### 17.2 Comment list (all comment GET endpoints)

- `page`: default `1`, min `1`, max `10000`.
- `limit`: default `10`, min `1`, max `100`.
- Response: `{ items, page, limit, total }` (no `totalPages`).

### 17.3 Admin list endpoints

- `page`: default `1`, min `1`, max `10000`.
- `pageSize`: default `50`, min `1`, max `100`.
- Response `pagination` for offset lists (`/admin/users`, `/admin/failed-login-logs`, `/admin/route-not-found-logs`, `/admin/images/database`): `{ page, pageSize, total, totalPages }`.
- Response `pagination` for cursor lists (`/admin/images/cloud`): `{ page, pageSize, hasNext }`.
- Response `pagination` for orphans (`/admin/images/orphans`): `{ page, pageSize, cloudHasNext, databaseHasNext, databaseTotal, databaseTotalPages }`.

### 17.4 Shared limits

- Resource ids (`INT AUTO_INCREMENT`): `1..2147483647`.
- Page offset uses `(page - 1) * limit`.

---

## 18. Zod Request Schemas

All schemas are `.strict()` unless noted. Numbers may be sent as numeric JSON values or as numeric strings where noted (query strings).

### 18.1 Shared helpers

- `trimmedString({max, min?, pattern?, patternMessage?})`: `z.string() -> trim() -> pipe(min/max/regex)`. Surrounding whitespace is removed before validation.
- `passwordString({min,max})`: `z.string().min(min).max(max).refine(byteLength <= max)`. Never trimmed.
- `optionalText({max,min?})`: `union(trimmedString, null).optional()` then transforms `undefined`/`null`/`''` -> `null`. Output `string | null`.
- `patchText({max,min?})`: same as optionalText but keeps `undefined` as `undefined` (partial update; blank clears to null).
- `requiredNumber({min,max})`: `union(number, string(min 1 char) -> Number)` then `pipe(number.min.max)`.
- `patchNumber({min,max})`: `union(number.min.max, string->Number.min.max, null).optional()`. Output `number | null | undefined`.
- `optionalInt({min,max})`: preprocess `''`/`null` -> `undefined`, then `coerce.number().int().min.max.optional()`.
- `positiveIdParam`: `z.string().regex(/^\d+$/)` and refine 1..2147483647.
- `userIdParam`: `z.string().regex(UUID)`.
- `positiveId`: `z.coerce.number().int().min(1).max(2147483647)`.
- `targetTypeInput`: `z.string().trim().toLowerCase().pipe(z.enum(['tripgroup','day','trip','point','image']))`.
- `idList({min,max})`: `z.array(positiveId).min(min).max(max).refine(no duplicate ids)`.

### 18.2 Auth schemas

| Schema | Fields (all required unless marked) | Notes |
| --- | --- | --- |
| `registerSchema` | `email`, `password`, `firstName`, `lastName` | `email`: trimmed 1..45 + email pattern; `password`: 8..72 chars (72 bytes); `firstName`/`lastName`: trimmed 1..45 |
| `verifyEmailSchema` | `token` | trimmed 1..200 |
| `resendVerificationSchema` | `email` | trimmed 1..45 + email pattern |
| `loginSchema` | `email`, `password` | `password`: 1..200 (comparison only) |
| `updateProfileSchema` | `firstName`, `lastName` | trimmed 1..45 |
| `confirmPasswordSchema` | `password` | 1..200 |
| `changePasswordSchema` | `currentPassword`, `newPassword` | `currentPassword`: 1..200; `newPassword`: 8..72 |
| `forgotPasswordSchema` | `email` | trimmed 1..45 + email pattern |
| `resetPasswordSchema` | `token`, `password` | `token`: 1..200; `password`: 8..72 |

### 18.3 Trip schemas

| Schema | Fields | Notes |
| --- | --- | --- |
| `tripWriteSchema` | `title` (1..60), `description` (optional/null, <=2000), `group` (1..45), `transport` (1..45) | `group`/`transport` are validated against active dynamic-config select values at the service layer |
| `tripListQuerySchema` | `page?`, `limit?`, `search?`, `group?`, `transport?`, `sort?` | `page` 1..10000; `limit` 1..100; `search` 1..200; `group`/`transport` 1..45; `sort` enum `newest`/`oldest` |
| `dayCreateSchema` | `dayNumber?` (1..500), `title?` (optional/null, 1..60), `description?` (optional/null, <=2000) | |
| `dayUpdateSchema` | `title?`, `description?` (at least one) | patch semantics |
| `dayReorderSchema` | `dayIds` | array 1..500, no duplicates |
| `pointReorderSchema` | `pointIds` | array 0..500, no duplicates |

### 18.4 Point schemas

| Schema | Fields | Notes |
| --- | --- | --- |
| `pointCreateSchema` | `dayId`, `title` (1..100), `description` (optional/null, <=1050), `latitude` (-90..90), `longitude` (-180..180) | `pointNumber` MUST NOT be sent |
| `pointUpdateSchema` | `title?` (1..100), `description?` (patch, <=1050), `latitude?` (patch, -90..90), `longitude?` (patch, -180..180) | at least one required; `pointNumber`/`numberPoint` rejected |

### 18.5 Social schemas

| Schema | Fields | Notes |
| --- | --- | --- |
| `socialTargetBodySchema` | `targetType`, `targetId` | `targetType` = `targetTypeInput`; `targetId` = positive id |
| `socialTargetQuerySchema` | `targetType`, `targetId` | same, used for DELETE query strings |
| `favoriteBodySchema` | `tripGroupId` | positive id |
| `favoriteQuerySchema` | `tripGroupId` | positive id |
| `commentBodySchema` | `text` (1..1000) | trimmed |
| `reportBodySchema` | `targetType`, `targetId`, `reason?` (optional/null, <=1000) | |
| `commentPageQuerySchema` | `page?`, `limit?` | `page` 1..10000; `limit` 1..100 |

### 18.6 Admin schemas

| Schema | Fields | Notes |
| --- | --- | --- |
| `adminUserUpdateSchema` | `firstName?`, `lastName?`, `role?`, `status?` (at least one) | `role` enum `user`/`admin`/`manager`; `status` enum `PENDING_VERIFICATION`/`ACTIVE`/`SUSPENDED`/`DEACTIVATED` |
| `failedLogDeleteSchema` | `ids` | array 1..200, no duplicates |
| `adminPaginationQuerySchema` | `page?`, `pageSize?` | transforms to defaults `page=1`, `pageSize=50`; `page` 1..10000, `pageSize` 1..100 |

### 18.7 Route-parameter schemas (all `.strict()`)

| Schema | Params |
| --- | --- |
| `userIdParams` | `userId` (UUID) |
| `tripIdParams` | `id` (positive int) |
| `tripIdOnlyParams` | `tripId` (positive int) |
| `tripDayParams` | `tripId`, `dayId` (both positive int) |
| `dayIdParams` | `dayId` (positive int) |
| `pointIdParams` | `pointId` (positive int) |
| `pointImageParams` | `pointId`, `imageId` (both positive int) |
| `imageIdParams` | `imageId` (positive int) |
| `commentIdParams` | `commentId` (positive int) |
| `tripGroupIdParams` | `tripGroupId` (positive int) |

### 18.8 Server-generated / forbidden fields (must NOT be sent by the frontend)

- `ownerId`, `userId`, `_ownerId`, `_ownerTripId` — ownership always derives from the authenticated actor; rejected on any write.
- `tripId`, `dayId` as parent references in trip/day/point writes (except `dayId` which IS an accepted field on point create to name the day).
- `pointNumber`, `numberPoint` — assigned by the server.
- `id`, `email`, `hashedPassword`, `password`, `imageFile`, `verifyEmail`, `emailVerifiedAt`, `createdAt` — never settable on admin user update.
- `days`, `points` — nested structures are rejected on trip writes.

---

## 19. Response DTOs

The API returns DTOs, not database models. The following are the API response shapes (all documented above):

| DTO | Where returned |
| --- | --- |
| `AuthUserDto` | register/verify/login/refresh/me/update profile/admin users |
| `AuthSessionDto` | login, refresh |
| `AuthUserResponse` (`{ user }`) | verify-email, me, update profile |
| `MessageResponse` (`{ message }`) | register, resend, logout, forgot, reset |
| `ImageDto` | image create endpoints, profile image GET/POST |
| `SocialImageDto` | trip/point image lists |
| `SocialState` | trip detail, day, point, image, like/favorite responses |
| `TripListItem` | trip list items |
| `TripDetails` | trip GET/POST/PUT |
| `TripDay` | day create/update/reorder, trip detail days |
| `TripPoint` | point GET/POST/PUT, point reorder |
| `TripListResponse` | GET /trips |
| `CommentDto` | comment list/create/update |
| `CommentListResponse` | comment list |
| `ReportDto` | report create |
| `SelectConfig[]` | GET /config/selects |
| `PublicServiceConfig[]` | GET /config/services |
| `AdminPage<T>` | admin list endpoints |
| `FailedLogDto` | GET /admin/failed-login-logs |
| `RouteNotFoundLogDto` | GET /admin/route-not-found-logs |
| `DeleteCountResponse` (`{ deleted }`) | DELETE /admin/failed-login-logs |
| `ImageInventoryComparison` | GET /admin/images/orphans |

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
14. **Public GET with a valid Authorization token**: authenticated viewer context; viewer-specific fields (`likedByMe`, `favoritedByMe`) are returned.
15. **Public GET with an invalid Authorization token**: `401 UNAUTHORIZED`; never silently turned anonymous.

The frontend must preserve these semantics and must never silently turn an invalid authenticated request into an anonymous request.

---

## 21. Complete Endpoint Table

Base path: `/api/v1`. "Public" = public bearer token (anonymous read); "Auth" = user access token. "Owner/Mod" = owner or `admin`/`manager`.

| Method | Path | Access | Request | Response | Errors |
| --- | --- | --- | --- | --- | --- |
| POST | `/auth/register` | None | `{ email, password, firstName, lastName }` | 201 `{ message }` | 400, 403 |
| POST | `/auth/verify-email` | None | `{ token }` | 200 `{ user }` | 400, 403 |
| POST | `/auth/resend-verification` | None | `{ email }` | 200 `{ message }` | 400, 403, 500 |
| POST | `/auth/login` | None | `{ email, password }` | 200 `AuthSessionDto` + cookie | 401, 403, 400 |
| POST | `/auth/refresh` | Cookie | none | 200 `AuthSessionDto` + cookie | 401, 403 |
| POST | `/auth/logout` | Cookie | none | 200 `{ message }` | 500 |
| GET | `/auth/me` | Auth | none | 200 `{ user }` | 401, 403 |
| PUT | `/auth/me` | Auth | `{ firstName, lastName }` | 200 `{ user }` | 400, 401, 403 |
| POST | `/auth/confirm-password` | Auth | `{ password }` | 200 `{ valid }` | 400, 401, 403 |
| PUT | `/auth/me/password` | Auth | `{ currentPassword, newPassword }` | 204 | 400, 401, 403 |
| GET | `/auth/me/image` | Auth | none | 200 `ImageDto` or null | 401, 403 |
| POST | `/auth/me/image` | Auth | multipart `file` | 201 `ImageDto` | 400, 401, 403, 409 |
| DELETE | `/auth/me/image` | Auth | none | 204 | 401, 403, 404 |
| POST | `/auth/forgot-password` | None | `{ email }` | 200 `{ message }` | 400, 403, 500 |
| POST | `/auth/reset-password` | None | `{ token, password }` | 200 `{ message }` | 400, 403 |
| GET | `/config/selects` | Public | none | 200 `SelectConfig[]` | 401 |
| GET | `/config/services` | Public | none | 200 `PublicServiceConfig[]` | 401 |
| GET | `/trips` | Public | query `page,limit,search,group,transport,sort` | 200 `TripListResponse` | 400, 401 |
| GET | `/trips/:id` | Public | param `id` | 200 `TripDetails` | 400, 401, 404 |
| POST | `/trips` | Auth | `{ title, description, group, transport }` | 201 `TripDetails` | 400, 401, 403 |
| PUT | `/trips/:id` | Owner/Mod | param `id`; body `{ title, description, group, transport }` | 200 `TripDetails` | 400, 401, 403, 404 |
| DELETE | `/trips/:id` | Owner/Mod | param `id` | 204 | 400, 401, 403, 404 |
| POST | `/trips/:tripId/days` | Owner/Mod | param `tripId`; body `{ dayNumber?, title?, description? }` | 201 `TripDay` | 400, 401, 403, 404, 409 |
| PUT | `/trips/:tripId/days/reorder` | Owner/Mod | param `tripId`; body `{ dayIds }` | 200 `TripDay[]` | 400, 401, 403, 404 |
| PUT | `/trips/:tripId/days/:dayId` | Owner/Mod | params `tripId,dayId`; body `{ title?, description? }` | 200 `TripDay` | 400, 401, 403, 404 |
| DELETE | `/trips/:tripId/days/:dayId` | Owner/Mod | params `tripId,dayId` | 204 | 400, 401, 403, 404, 409 |
| POST | `/trips/:tripId/days/:dayId/images` | Owner/Mod | params `tripId,dayId`; multipart `file` | 201 `ImageDto` | 400, 401, 403, 404, 409 |
| POST | `/points` | Owner/Mod | `{ dayId, title, description?, latitude, longitude }` | 201 `TripPoint` | 400, 401, 403, 404 |
| GET | `/points/:pointId` | Public | param `pointId` | 200 `TripPoint` | 400, 401, 404 |
| PUT | `/points/:pointId` | Owner/Mod | param `pointId`; body `{ title?, description?, latitude?, longitude? }` | 200 `TripPoint` | 400, 401, 403, 404 |
| DELETE | `/points/:pointId` | Owner/Mod | param `pointId` | 204 | 400, 401, 403, 404 |
| POST | `/points/:pointId/images` | Owner/Mod | param `pointId`; multipart `file` | 201 `ImageDto` | 400, 401, 403, 404, 409 |
| DELETE | `/points/:pointId/images/:imageId` | Owner/Mod | params `pointId,imageId` | 204 | 400, 401, 403, 404 |
| PUT | `/days/:dayId/points/reorder` | Owner/Mod | param `dayId`; body `{ pointIds }` | 200 `TripPoint[]` | 400, 401, 403, 404 |
| DELETE | `/images/:imageId` | Owner/Mod | param `imageId` | 204 | 400, 401, 403, 404 |
| GET | `/trip-groups/:tripGroupId/comments` | Public | param `tripGroupId`; query `page,limit` | 200 `CommentListResponse` | 400, 401, 404 |
| POST | `/trip-groups/:tripGroupId/comments` | Auth | param `tripGroupId`; body `{ text }` | 201 `CommentDto` | 400, 401, 404 |
| GET | `/trips/:tripId/days/:dayId/comments` | Public | params `tripId,dayId`; query `page,limit` | 200 `CommentListResponse` | 400, 401, 404 |
| POST | `/trips/:tripId/days/:dayId/comments` | Auth | params `tripId,dayId`; body `{ text }` | 201 `CommentDto` | 400, 401, 404 |
| GET | `/points/:pointId/comments` | Public | param `pointId`; query `page,limit` | 200 `CommentListResponse` | 400, 401, 404 |
| POST | `/points/:pointId/comments` | Auth | param `pointId`; body `{ text }` | 201 `CommentDto` | 400, 401, 404 |
| GET | `/images/:imageId/comments` | Public | param `imageId`; query `page,limit` | 200 `CommentListResponse` | 400, 401, 404 |
| POST | `/images/:imageId/comments` | Auth | param `imageId`; body `{ text }` | 201 `CommentDto` | 400, 401, 404 |
| PUT | `/comments/:commentId` | Author | param `commentId`; body `{ text }` | 200 `CommentDto` | 400, 401, 403, 404 |
| DELETE | `/comments/:commentId` | Author/Owner/Mod | param `commentId` | 204 | 400, 401, 403, 404 |
| POST | `/likes/` | Auth | `{ targetType, targetId }` | 200 `SocialState` | 400, 401, 404 |
| DELETE | `/likes/` | Auth | query `targetType,targetId` | 204 | 400, 401, 404 |
| POST | `/favorites/` | Auth | `{ tripGroupId }` | 200 `SocialState` | 400, 401, 404 |
| DELETE | `/favorites/` | Auth | query `tripGroupId` | 204 | 400, 401, 404 |
| POST | `/reports/` | Auth | `{ targetType, targetId, reason? }` | 201 `ReportDto` | 400, 401, 404, 409 |
| GET | `/admin/users` | admin/manager | query `page,pageSize` | 200 `AdminPage<AuthUserDto>` | 400, 401, 403 |
| PUT | `/admin/users/:userId` | admin | param `userId`; body `{ firstName?, lastName?, role?, status? }` | 200 `AuthUserDto` | 400, 401, 403, 404 |
| DELETE | `/admin/users/:userId` | admin/manager | param `userId` | 204 | 400, 401, 403, 404, 409 |
| GET | `/admin/failed-login-logs` | admin/manager | query `page,pageSize` | 200 `AdminPage<FailedLogDto>` | 400, 401, 403 |
| DELETE | `/admin/failed-login-logs` | admin/manager | body `{ ids }` | 200 `{ deleted }` | 400, 401, 403 |
| GET | `/admin/route-not-found-logs` | admin/manager | query `page,pageSize` | 200 `AdminPage<RouteNotFoundLogDto>` | 400, 401, 403 |
| GET | `/admin/images/cloud` | admin/manager | query `page,pageSize` | 200 `AdminPage<string>` (cursor) | 400, 401, 403 |
| GET | `/admin/images/database` | admin/manager | query `page,pageSize` | 200 `AdminPage<string>` | 400, 401, 403 |
| GET | `/admin/images/orphans` | admin/manager | query `page,pageSize` | 200 `ImageInventoryComparison` | 400, 401, 403 |

---

## 22. Frontend Integration Notes

This section contains frontend-specific integration guidance. It does not change any API behavior; the rest of this document remains the authoritative behavioral contract.

### 22.1 Base URL

The frontend resolves the deployed backend API base URL from its own deployment environment (e.g. an environment variable or build-time runtime configuration). This document does not fix a production value because the production origin is deployment-specific. All paths in this document are relative to that base URL under `/api/v1`.

### 22.2 Credentials (refresh cookie)

- The refresh token is delivered in an HttpOnly cookie (`hack_trip_refresh`, scoped to `/api/v1/auth`) and never in a response body.
- Requests that must carry the cookie — `POST /auth/refresh` and `POST /auth/logout` — must be sent with credentials enabled: `credentials: 'include'` (Fetch) or `withCredentials: true` (Axios).
- The frontend never reads or stores the refresh cookie value; it is managed by the browser.

### 22.3 Frontend Zod module map

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

| Module | Backend schemas |
| --- | --- |
| `auth/` | `registerSchema`, `loginSchema`, `verifyEmailSchema`, `resendVerificationSchema`, `updateProfileSchema`, `confirmPasswordSchema`, `changePasswordSchema`, `forgotPasswordSchema`, `resetPasswordSchema` |
| `trips/` | `tripWriteSchema`, `tripListQuerySchema`, `dayCreateSchema`, `dayUpdateSchema`, `dayReorderSchema`, `pointReorderSchema` |
| `points/` | `pointCreateSchema`, `pointUpdateSchema` |
| `comments/` | `commentBodySchema`, `commentPageQuerySchema` |
| `social/` | `socialTargetBodySchema`, `socialTargetQuerySchema`, `favoriteBodySchema`, `favoriteQuerySchema`, `reportBodySchema` |
| `admin/` | `adminUserUpdateSchema`, `failedLogDeleteSchema`, `adminPaginationQuerySchema` |

Route-parameter schemas (section 18.7) are shared and used across modules: `userIdParams`, `tripIdParams`, `tripIdOnlyParams`, `tripDayParams`, `dayIdParams`, `pointIdParams`, `pointImageParams`, `imageIdParams`, `commentIdParams`, `tripGroupIdParams`.













