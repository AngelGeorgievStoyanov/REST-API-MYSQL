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
* must not establish an authenticated access-token context;
* returns only whether the current browser request has a valid refresh session;
* returns the same response shape whether the session is absent or invalid, without exposing why it is unavailable;
* must be safe for a completely anonymous browser request and must not require a user access JWT.

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

Every error (including route-not-found and rate-limit) uses the same JSON shape:

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
| GET `/auth/session`                       | YES (public token) | YES (session cookie)                 | —     | —       | —     |
| PUT `/auth/me`                            | NO                 | YES (self only)                      | —     | —       | —     |
| GET/POST/DELETE `/auth/me/image`          | NO                 | YES (self only)                      | —     | —       | —     |
| GET `/config/selects`                     | YES (public token) | YES                                  | —     | —       | —     |
| GET `/config/services`                    | YES (public token) | YES                                  | —     | —       | —     |
| GET `/trips`                              | YES (public token) | YES                                  | —     | —       | —     |
| GET `/trips/:id`                          | YES (public token) | YES                                  | —     | —       | —     |
| GET `/trips/top`                     | YES (public token) | YES                                  | —     | —       | —     |
| GET `/trips/background`              | YES (public token) | YES                                  | —     | —       | —     |
| GET `/me/trips`                | NO                 | YES                                  | YES*  | —       | —     |
| GET `/me/favorites`            | NO                 | YES                                  | —     | —       | —     |
| POST `/trips`                             | NO                 | YES                                  | —     | —       | —     |
| DELETE `/trips/:id`                       | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| POST `/trips/:tripId/days`                | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| PUT `/trips/:tripId/days/reorder`         | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| PUT `/trips/:tripId/days/:dayId`          | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| DELETE `/trips/:tripId/days/:dayId`       | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| POST `/trips/:tripId/days/:dayId/images`  | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| GET `/points/:pointId`                    | YES (public token) | YES                                  | —     | —       | —     |
| POST `/points`                            | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| PUT `/points/:pointId`                    | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| DELETE `/points/:pointId`                 | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| POST `/points/:pointId/images`            | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| DELETE `/points/:pointId/images/:imageId` | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| PUT `/days/:dayId/points/reorder`         | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| DELETE `/images/:imageId`                 | NO                 | CONDITIONAL                          | YES   | YES     | YES   |
| GET (comments)                            | YES (public token) | YES                                  | —     | —       | —     |
| POST (comments)                           | NO                 | YES                                  | —     | —       | —     |
| PUT `/comments/:commentId`                | NO                 | CONDITIONAL (author only)            | —     | —       | —     |
| DELETE `/comments/:commentId`             | NO                 | CONDITIONAL (author/owner/moderator) | YES   | YES     | YES   |
| POST/DELETE `/likes/`                     | NO                 | YES                                  | —     | —       | —     |
| POST/DELETE `/favorites/`                 | NO                 | YES                                  | —     | —       | —     |
| POST `/reports/`                          | NO                 | YES                                  | —     | —       | —     |
| GET `/admin/users`                        | NO                 | NO                                   | NO    | YES     | YES   |
| PUT `/admin/users/:userId`                | NO                 | NO                                   | NO    | NO      | YES   |
| DELETE `/admin/users/:userId`             | NO                 | NO                                   | NO    | YES     | YES   |
| GET/DELETE `/admin/failed-login-logs`     | NO                 | NO                                   | NO    | YES     | YES   |
| GET `/admin/route-not-found-logs`         | NO                 | NO                                   | NO    | YES     | YES   |
| GET `/admin/images/cloud`                 | NO                 | NO                                   | NO    | YES     | YES   |
| GET `/admin/images/database`              | NO                 | NO                                   | NO    | YES     | YES   |
| GET `/admin/images/orphans`               | NO                 | NO                                   | NO    | YES     | YES   |
| GET `/admin/reports`                      | NO                 | NO                                   | NO    | YES     | YES   |
| DELETE `/admin/reports/:reportId`         | NO                 | NO                                   | NO    | YES     | YES   |

`*` The authenticated actor is the owner being used to scope the result. The request does not contain a user id.

> CONDITIONAL on trip/day/point/image mutation endpoints means: the authenticated actor must be the trip-group owner OR have role `admin`/`manager`. On `PUT /comments/:commentId` it means: the actor must be the comment author. On `DELETE /comments/:commentId` it means: the actor must be the author, the trip-group owner, or a moderator (`admin`/`manager`).

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
* Response `200`: `{ "user": AuthUserDto }`.
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

```json
{ "accessToken": "<jwt>", "tokenType": "Bearer", "expiresIn": 900, "user": AuthUserDto }
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
* Response `200`: `{ "user": AuthUserDto }`.

### 6.8 PUT `/auth/me`

* Auth: `requireAuthentication`.
* Body (strict): `{ firstName, lastName }`.
* Response `200`: `{ "user": AuthUserDto }`.

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

* A **Trip Group** = one `trip_groups` row. Its integer `id` is the `tripGroupId` used to associate its days.
* A **Day** = one `trips` row belonging to that trip group. The day row has its own integer `id`.
* `dayNumber` is the displayed/order number of the day and is not the day identifier.
* Trip Group itself has only group-level social state in the new GET response; day metadata belongs to each day row.
* `group` and `transport` are dynamic-config select values resolved to `{ key, name }`.
* `currency` is resolved from the dynamic-config `currency` select to `{ id, code, name }`.
* Days are returned in `dayNumber` ascending order (tie-break `id` ascending).
* Points within a day are returned in `pointNumber` ascending order (tie-break `id` ascending).

## 8. Trip GET response structure (three endpoints)

The following three GET endpoints use the same unified Trip Group response structure:

```text
GET /api/v1/trips
GET /api/v1/trips/top
GET /api/v1/trips/:id
```

A **Trip Group** is only the grouping container. It has no title, description, transport, group, currency, author, cover image, or other day metadata.

The **`tripGroupId`** identifies the grouping record. It is an integer database id. Every day in `days[]` belongs to that trip group through this id.

A trip group does not generate missing day numbers. For example, a trip group may contain exactly Day 1, Day 3, and Day 5.

### Shared response shape

For `GET /trips` and `GET /trips/top`:

```json
[
  {
    "tripGroupId": 123,
    "social": {
      "likes": 25,
      "likedByMe": true,
      "comments": { "count": 8 },
      "favorites": 3,
      "favoritedByMe": false
    },
    "days": [
      {
        "id": 1001,
        "dayNumber": 1,
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
              "comments": { "count": 2 }
            }
          }
        ],
        "social": {
          "likes": 10,
          "likedByMe": false,
          "comments": { "count": 3 }
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
            "images": [
              {
                "id": 5002,
                "url": "<url>",
                "thumbnailUrl": "<url>",
                "social": {
                  "likes": 2,
                  "likedByMe": false,
                  "comments": { "count": 1 }
                }
              }
            ],
            "social": {
              "likes": 4,
              "likedByMe": false,
              "comments": { "count": 2 }
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

For `GET /trips/:id`, the same object is returned instead of an array:

```json
{
  "tripGroupId": 123,
  "social": { "...": "same Trip Group social structure" },
  "days": [ "same TripGroupDay structure as above" ]
}
```

### TripGroupDay

Each element of `days[]` represents one existing day row belonging to the trip group.

```json
{
  "id": 1001,
  "dayNumber": 1,
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

The complete TripGroupDay response includes all public day-level data stored on the `trips` row that is part of the API contract: `id`, `dayNumber`, `title`, `description`, `countPeoples`, `destination`, `lat`, `lng`, `price`, `currency`, `transport`, `group`, `images`, `social`, `points`, `createdAt`, and `updatedAt`. `countEdited`, `tripGroupId`, and `ownerId` are not part of the public day response.

Field semantics:
* `countPeoples`: integer number of people for this day/trip row.
* `destination`: destination text stored on the day/trip row; nullable.
* `lat`: day/trip-level latitude; nullable.
* `lng`: day/trip-level longitude; nullable.
* These four fields belong to the day level (the `trips` row), not the trip-group level.
* `ownerId` is intentionally NOT part of the response. Ownership is resolved server-side and must never be serialized into the public TripGroup response.

Day images and point images keep the existing `SocialImageDto` structure:

```json
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

Days are ordered by `dayNumber ASC`, with `id ASC` as the tie-breaker. Missing day numbers are preserved; they are never generated.

Points are ordered by `pointNumber ASC`, with `id ASC` as the tie-breaker.

### GET /trips

* Auth: `optionalAuthentication`.
* Query: `page`, `limit`, `search`, `group`, `transport`, `sort`.
* Response `200`: raw `TripGroupResponse[]`.
* There is no `items` wrapper and no `pagination` object in the response.
* Query pagination/filtering is used only to select which trip groups are returned.

### GET /trips/top

* Auth: `optionalAuthentication`.
* No query/body/params are required.
* Response `200`: raw `TripGroupResponse[]`.
* Maximum 5 trip groups.
* Ranking is by likes belonging to the trip group.
* A trip group is returned only once regardless of how many day rows it contains.
* The response structure is exactly the same as `GET /trips`.

### GET /trips/:id

* Auth: `optionalAuthentication`.
* Path parameter `id` is the **`tripGroupId` (INT)**, not a day id.
* Response `200`: one `TripGroupResponse`.
* The response contains the complete trip group: `tripGroupId`, trip-group `social`, and all existing `days[]`.
* The Frontend may open a specific day from the returned `days[]`; the Backend still returns the complete trip group.
* Missing trip group -> `404 TRIP_NOT_FOUND`.

All three endpoints therefore share exactly the same nested data model; only the cardinality differs:
* `/trips` -> array of trip groups;
* `/trips/top` -> array of up to 5 trip groups;
* `/trips/:id` -> one trip group.

### 8.4 GET `/me/trips`

This is the authenticated user's own trip-group list.

* Auth: `requireAuthentication`.
* Anonymous/public token -> `401 UNAUTHORIZED`.
* No `userId` is accepted in the path, query, or body.
* The backend obtains the authenticated user's UUID exclusively from the authenticated request context.
* The backend must return only trip groups actually owned by that authenticated user.
* Ownership is determined from the trip-group ownership relation (`trip_groups.ownerId`), never from a client-supplied identifier.
* Response `200`: raw `TripGroupResponse[]`.
* The response uses the exact same unified trip-group structure as `GET /trips`, `GET /trips/top`, and `GET /trips/:id`.
* Each item contains only `tripGroupId`, trip-group `social`, and the existing `days[]` structure.
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
* The response uses the exact same unified trip-group structure as `GET /trips`, `GET /trips/top`, and `GET /trips/:id`.
* Each item contains only `tripGroupId`, trip-group `social`, and the existing `days[]` structure.
* The response contains **no `userId`, `ownerId`, or author/owner object**, including the owner id of a trip created by another user.
* The authenticated user's UUID and all favorite-record ownership fields are used only server-side and are never serialized into the response.
* The backend must never accept a client-supplied `userId` to retrieve another user's favorites.
* If the user has no favorites, response is `200` with an empty array:

```json
[]
```

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
* Body (strict): `{ title, description, group, transport }`.
* Response `201`: `TripGroupResponse` (same complete trip-group response structure as the GET endpoints).

### 8.9 DELETE `/trips/:id`

* Auth: `requireAuthentication` + owner/moderator.
* Path params (strict): `{ id }`.
* Response `204` (empty).

### 8.10 POST `/trips/:tripId/days`

* Auth: `requireAuthentication` + owner/moderator.
* Path params (strict): `{ tripId }`. Body (strict): `{ dayNumber?, title?, description? }`.
* Response `201`: `TripGroupResponse` (same complete trip-group response structure as `GET /trips/:id`).
* `dayNumber` omitted -> assigned `max(dayNumber)+1`. Duplicate `dayNumber` -> `409 CONFLICT` ("Day N already exists in this trip.").

### 8.11 PUT `/trips/:tripId/days/reorder`

* Auth: `requireAuthentication` + owner/moderator.
* Path params (strict): `{ tripId }`. Body (strict): `{ dayIds: number[] }`.
* Response `200`: `TripDay[]` (re-ordered).
* `dayIds` must contain exactly all day ids of the trip; otherwise `400 VALIDATION_ERROR`.

### 8.12 PUT `/trips/:tripId/days/:dayId`

* Auth: `requireAuthentication` + owner/moderator.
* Path params (strict): `{ tripId, dayId }` (`dayId` = the day row's `Trip.id`).
* Body (strict): `{ title?, description? }` (at least one required).
* Response `200`: `TripGroupResponse` (same complete trip-group response structure as `GET /trips/:id`).

### 8.13 DELETE `/trips/:tripId/days/:dayId`

* Auth: `requireAuthentication` + owner/moderator.
* Path params (strict): `{ tripId, dayId }`.
* Response `204` (empty).
* Error: deleting the last remaining day -> `409 CONFLICT` ("The last day of a trip cannot be deleted.").

### 8.14 POST `/trips/:tripId/days/:dayId/images`

* Auth: `requireAuthentication` + owner/moderator (ownership checked BEFORE the file is stored).
* Path params (strict): `{ tripId, dayId }`.
* Multipart: field `file`, exactly one file.
* Response `201`: `ImageDto`.
* Error: day already has 9 images -> `409 CONFLICT`.

---

## 9. Day Endpoints

Mounted at `/api/v1/days`.

### 9.1 PUT `/days/:dayId/points/reorder`

* Auth: `requireAuthentication` + owner/moderator.
* Path params (strict): `{ dayId }` (`dayId` = the day row's `Trip.id`).
* Body (strict): `{ pointIds: number[] }`.
* Response `200`: `TripPoint[]` (re-ordered).
* `pointIds` must contain exactly all point ids of the day (may be an empty array for zero points); otherwise `400 VALIDATION_ERROR`.

---

## 10. Point Endpoints

Mounted at `/api/v1/points`.

### 10.1 POST `/points`

* Auth: `requireAuthentication` + owner/moderator (of the day's trip group).
* Body (strict): `{ dayId, title, description?, latitude, longitude }`.
* Response `201`: `TripPoint`.
* `dayId` is the API's name for the day the point belongs to; its value is the day row's `Trip.id`.
* `pointNumber` MUST NOT be sent: it is generated by the server (the next number in the day). Client-controlled ownership/sequence fields (`ownerId`, `userId`, `tripId`, `pointNumber`, `numberPoint`, `_ownerId`, `_ownerTripId`) are rejected.

### 10.2 GET `/points/:pointId`

* Auth: `optionalAuthentication`.
* Path params (strict): `{ pointId }`.
* Response `200`: `TripPoint`. Missing -> `404 NOT_FOUND`.

### 10.3 PUT `/points/:pointId`

* Auth: `requireAuthentication` + owner/moderator.
* Path params (strict): `{ pointId }`.
* Body (strict): `{ title?, description?, latitude?, longitude? }` (at least one required).
* Response `200`: `TripPoint`.
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

The point response keeps the public database-aligned field names and types for the point data. `tripId` is included as the public parent-trip reference. Internal fields `ownerId`, `countEdited`, `createdAt`, and `updatedAt` are never exposed. Social and image data are API-level additions.

 ```json
{
  "id": 2001,
  "name": "Point title",
  "description": null,
  "lat": 42.6975,
  "lng": 23.3241,
  "pointNumber": 1,
  "tripId": 1001,
  "images": [ SocialImageDto ],
  "social": SocialState
}
```

Non-negotiable point field rules:

* `name` is the database `Point.name` field; do not rename it to `title`.
* `lat` and `lng` are the database coordinate fields; do not rename them to `latitude` / `longitude`.
* `pointNumber` is returned and represents the persisted point order.
* `countEdited`, `tripId`, `createdAt`, and `updatedAt` are returned as database-level point fields.
* `ownerId` is never returned to the Frontend. Ownership is resolved server-side.
* `images` and `social` remain API-level nested fields.

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
  "favorites": 0,
  "favoritedByMe": false
}
```

`favorites` and `favoritedByMe` are present only on trip-group targets.

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

* Auth: `requireAuthentication` + owner/moderator (the image must be attached to a day of a trip group; a profile image or unattached image is `404 NOT_FOUND`).
* Path params (strict): `{ imageId }`.
* Response `204` (empty). The original object and its thumbnail sidecar are deleted from storage before the row is removed.

### 11.2 Image upload contract (all image uploads)

Applies to `POST /auth/me/image`, `POST /trips/:tripId/days/:dayId/images`, and `POST /points/:pointId/images`.

* Multipart field name: `file`.
* Exactly one binary part per request; no text fields are part of the contract (`files: 1`, `fields: 0`, `parts: 1`).
* Max file size: `25 MB` (`MAX_UPLOAD_BYTES`).
* Accepted MIME (declared): `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
* Accepted extensions: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`.
* Decoded format (authoritative; bytes are inspected with Sharp): `jpeg`, `png`, `webp`, `gif`. HEIC/HEIF, SVG, TIFF, AVIF are not accepted.
* Decoded dimension ceilings: width/height <= `10000`, total pixels <= `50_000_000` (counting all frames).
* Processing: the backend re-encodes/sanitizes the image (EXIF orientation applied via `rotate()`; re-encoded per format). The frontend is expected only to stay within the 25 MB upload cap; the backend does its own sanitizing/re-encoding and thumbnail generation.
* Storage: server-generated object key `images/<uuid>.<ext>`; create-only writes (`ifGenerationMatch: 0`). The original is stored as-is (sanitized), and a thumbnail sidecar `<name>_thumb.webp` (800x600, `fit: inside`, quality 80, webp) is generated.
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

* `GET /trips/:tripId/days/:dayId/comments`

* `GET /points/:pointId/comments`

* `GET /images/:imageId/comments`

* Auth: `optionalAuthentication`.

* Query (strict): `{ page?, limit? }` (`page` default `1`, max `10000`; `limit` default `10`, max `100`).

* Response `200`: `CommentListResponse`.

* Ordering: newest first (`createdAt DESC`, tie-break `id DESC`).

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

* `POST /trip-groups/:tripGroupId/comments`

* `POST /trips/:tripId/days/:dayId/comments`

* `POST /points/:pointId/comments`

* `POST /images/:imageId/comments`

* Auth: `requireAuthentication`.

* Body (strict): `{ text }`.

* Response `201`: `CommentDto`.

* The author name snapshot is built server-side from the user's `firstName lastName` (trimmed, max 45 chars).

### 12.3 PUT `/comments/:commentId`

* Auth: `requireAuthentication` + author only (else `403 FORBIDDEN`).
* Path params (strict): `{ commentId }`.
* Body (strict): `{ text }`.
* Response `200`: `CommentDto` (increments `editCount`).

### 12.4 DELETE `/comments/:commentId`

* Auth: `requireAuthentication`; allowed for the comment author, the trip-group owner, or a moderator (`admin`/`manager`).
* Path params (strict): `{ commentId }`.
* Response `204` (empty).

---

## 13. Like Endpoints

Mounted at `/api/v1/likes`.

### 13.1 POST `/likes/`

* Auth: `requireAuthentication`.
* Body (strict): `{ targetType, targetId }`.
* Response `200`: `SocialState` (idempotent; repeating a like is a no-op).
* The target must exist; otherwise `404 NOT_FOUND`.

### 13.2 DELETE `/likes/`

* Auth: `requireAuthentication`.
* Query (strict): `{ targetType, targetId }`.
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

### 14.1 POST `/favorites/`

* Auth: `requireAuthentication`.
* Body (strict): `{ tripGroupId }`.
* Response `200`: `SocialState` (the group's state, including `favorites`/`favoritedByMe`). Idempotent.

### 14.2 DELETE `/favorites/`

* Auth: `requireAuthentication`.
* Query (strict): `{ tripGroupId }`.
* Response `204` (empty). Idempotent.

---

## 15. Report Endpoints

Mounted at `/api/v1/reports`.

### 15.1 POST `/reports/`

* Auth: `requireAuthentication`.
* Body (strict): `{ targetType, targetId, reason? }`.
* Response `201`: `ReportDto`.
* Error: the same user already reported the same target -> `409 CONFLICT` ("You have already reported this resource.").
* Reports may target a trip group, trip/day, point, image, or comment.
* The reporting user is always taken from authentication context. `userId` must never be accepted from the request body.

`ReportDto`:

```json
{
  "id": 0,
  "targetType": "tripGroup" | "trip" | "point" | "image" | "comment",
  "targetId": 0,
  "reason": null | "<string>",
  "createdAt": null | "<iso>"
}
```

Reports are write-only from the public/user API. Users never receive the administrative report queue through `/reports`.

---

## 16. Admin Endpoints

Mounted at `/api/v1/admin`. Every admin endpoint is guarded by the admin rate limit (`120`/window/IP) and by role middleware. Role gates are defined in code (`ADMIN_ROLES` = `admin`; `ADMIN_OR_MODERATOR_ROLES` = `admin`, `manager`).

Admin pagination query (strict, shared by all admin list endpoints):

* `page`: positive integer, default `1`, max `10000`.
* `pageSize`: positive integer, default `50`, max `100`.

### 16.1 GET `/admin/users`

* Role: `admin` or `manager`.
* Response `200`: `AdminPage<AuthUserDto>` (ordered by email asc).

```json
{
  "items": [ AuthUserDto ],
  "pagination": { "page": 1, "pageSize": 50, "total": 0, "totalPages": 0 }
}
```

### 16.2 PUT `/admin/users/:userId`

* Role: `admin` ONLY.
* Path params (strict): `{ userId: UUID }`.
* Body (strict): `{ firstName?, lastName?, role?, status? }` (at least one required).

  * `role` enum: `user` | `admin` | `manager`.
  * `status` enum: `PENDING_VERIFICATION` | `ACTIVE` | `SUSPENDED` | `DEACTIVATED`.
* Response `200`: `AuthUserDto`.
* Identity/credential/verification fields (`id`, `email`, `hashedPassword`, `password`, `imageFile`, `verifyEmail`, `emailVerifiedAt`, `createdAt`) are not settable and are rejected.

### 16.3 DELETE `/admin/users/:userId`

* Role: `admin` or `manager`.
* Path params (strict): `{ userId: UUID }`.
* Response `204` (empty).
* Error: user still owns trips/days/points/comments -> `409 CONFLICT` ("The account still owns trips, days, points or comments.").

### 16.4 GET `/admin/failed-login-logs`

* Role: `admin` or `manager`.
* Response `200`: `AdminPage<FailedLogDto>` (newest first).

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

* Role: `admin` or `manager`.
* Body (strict): `{ ids: number[] }` (1..200 ids, no duplicates).
* Response `200`: `{ "deleted": <number> }`.

### 16.6 GET `/admin/route-not-found-logs`

* Role: `admin` or `manager`.
* Response `200`: `AdminPage<RouteNotFoundLogDto>` (newest first).

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
* Reports are automatically available here after a user successfully creates them through `POST /reports/`.
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

```json
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

```json
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

All schemas are `.strict()` unless noted. Numbers may be sent as numeric JSON values or as numeric strings where noted (query strings).

### 18.1 Shared helpers

* `trimmedString({max, min?, pattern?, patternMessage?})`: `z.string() -> trim() -> pipe(min/max/regex)`. Surrounding whitespace is removed before validation.
* `passwordString({min,max})`: `z.string().min(min).max(max).refine(byteLength <= max)`. Never trimmed.
* `optionalText({max,min?})`: `union(trimmedString, null).optional()` then transforms `undefined`/`null`/`''` -> `null`. Output `string | null`.
* `patchText({max,min?})`: same as optionalText but keeps `undefined` as `undefined` (partial update; blank clears to null).
* `requiredNumber({min,max})`: `union(number, string(min 1 char) -> Number)` then `pipe(number.min.max)`.
* `patchNumber({min,max})`: `union(number.min.max, string->Number.min.max, null).optional()`. Output `number | null | undefined`.
* `optionalInt({min,max})`: preprocess `''`/`null` -> `undefined`, then `coerce.number().int().min.max.optional()`.
* `positiveIdParam`: `z.string().regex(/^\d+$/)` and refine 1..2147483647.
* `userIdParam`: `z.string().regex(UUID)`.
* `positiveId`: `z.coerce.number().int().min(1).max(2147483647)`.
* `targetTypeInput`: `z.string().trim().toLowerCase().pipe(z.enum(['tripgroup','day','trip','point','image']))`.
* `idList({min,max})`: `z.array(positiveId).min(min).max(max).refine(no duplicate ids)`.

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
| `tripWriteSchema`     | `title` (1..60), `description` (optional/null, <=2000), `group` (1..45), `transport` (1..45)   | `group`/`transport` are validated against active dynamic-config select values at the service layer         |
| `tripListQuerySchema` | `page?`, `limit?`, `search?`, `group?`, `transport?`, `sort?`                                  | `page` 1..10000; `limit` 1..100; `search` 1..200; `group`/`transport` 1..45; `sort` enum `newest`/`oldest` |
| `dayCreateSchema`     | `dayNumber?` (1..500), `title?` (optional/null, 1..60), `description?` (optional/null, <=2000) |                                                                                                            |
| `dayUpdateSchema`     | `title?`, `description?` (at least one)                                                        | patch semantics                                                                                            |
| `dayReorderSchema`    | `dayIds`                                                                                       | array 1..500, no duplicates                                                                                |
| `pointReorderSchema`  | `pointIds`                                                                                     | array 0..500, no duplicates                                                                                |

The new trip-data endpoints do not accept query parameters unless explicitly documented in their endpoint sections. In particular:

* `/trips/top` accepts no user id or other selector.
* `/me/trips` accepts no user id.
* `/me/favorites` accepts no user id.
* `/trips/background` accepts no user id or background filename.

### 18.4 Point schemas

| Schema              | Fields                                                                                                           | Notes                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `pointCreateSchema` | `dayId`, `title` (1..100), `description` (optional/null, <=1050), `latitude` (-90..90), `longitude` (-180..180)  | `pointNumber` MUST NOT be sent                              |
| `pointUpdateSchema` | `title?` (1..100), `description?` (patch, <=1050), `latitude?` (patch, -90..90), `longitude?` (patch, -180..180) | at least one required; `pointNumber`/`numberPoint` rejected |

### 18.5 Social schemas

| Schema                    | Fields                                                       | Notes                                                                                   |
| ------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `socialTargetBodySchema`  | `targetType`, `targetId`                                     | `targetType` = `targetTypeInput`; `targetId` = positive id                              |
| `socialTargetQuerySchema` | `targetType`, `targetId`                                     | same, used for DELETE query strings                                                     |
| `favoriteBodySchema`      | `tripGroupId`                                                | positive id                                                                             |
| `favoriteQuerySchema`     | `tripGroupId`                                                | positive id                                                                             |
| `commentBodySchema`       | `text` (1..1000)                                             | trimmed                                                                                 |
| `reportBodySchema`        | `targetType`, `targetId`, `reason?` (optional/null, <=1000)  | Report target type additionally allows `comment`                                        |
| `reportTargetTypeInput`   | `tripgroup` | `day` | `trip` | `point` | `image` | `comment` | Case-insensitive, trimmed and lowercased; `day` and `trip` resolve to a trip/day target |
| `commentPageQuerySchema`  | `page?`, `limit?`                                            | `page` 1..10000; `limit` 1..100                                                         |

### 18.6 Admin schemas

| Schema                       | Fields                                                       | Notes                                                                                                         |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `adminUserUpdateSchema`      | `firstName?`, `lastName?`, `role?`, `status?` (at least one) | `role` enum `user`/`admin`/`manager`; `status` enum `PENDING_VERIFICATION`/`ACTIVE`/`SUSPENDED`/`DEACTIVATED` |
| `failedLogDeleteSchema`      | `ids`                                                        | array 1..200, no duplicates                                                                                   |
| `adminPaginationQuerySchema` | `page?`, `pageSize?`                                         | transforms to defaults `page=1`, `pageSize=50`; `page` 1..10000, `pageSize` 1..100                            |
| `adminReportIdParams`        | `reportId`                                                   | positive integer                                                                                              |

### 18.7 Route-parameter schemas (all `.strict()`)

| Schema                | Params                                   |
| --------------------- | ---------------------------------------- |
| `userIdParams`        | `userId` (UUID)                          |
| `tripIdParams`        | `id` (positive int)                      |
| `tripIdOnlyParams`    | `tripId` (positive int)                  |
| `tripDayParams`       | `tripId`, `dayId` (both positive int)    |
| `dayIdParams`         | `dayId` (positive int)                   |
| `pointIdParams`       | `pointId` (positive int)                 |
| `pointImageParams`    | `pointId`, `imageId` (both positive int) |
| `imageIdParams`       | `imageId` (positive int)                 |
| `commentIdParams`     | `commentId` (positive int)               |
| `tripGroupIdParams`   | `tripGroupId` (positive int)             |
| `adminReportIdParams` | `reportId` (positive int)                |

The new `/me/trips` and `/me/favorites` endpoints intentionally do not use `userIdParams`.

### 18.8 Server-generated / forbidden fields (must NOT be sent by the frontend)

* `ownerId`, `userId`, `_ownerId`, `_ownerTripId` — ownership always derives from the authenticated actor; rejected on any write.
* `tripId`, `dayId` as parent references in trip/day/point writes (except `dayId` which IS an accepted field on point create to name the day).
* `pointNumber`, `numberPoint` — assigned by the server.
* `id`, `email`, `hashedPassword`, `password`, `imageFile`, `verifyEmail`, `emailVerifiedAt`, `createdAt` — never settable on admin user update.
* `days`, `points` — nested structures are rejected on trip writes.
* `userId` is not accepted as a selector for `/me/trips` or `/me/favorites`.

---

## 19. Response DTOs

The API returns DTOs, not database models. The following are the API response shapes (all documented above):

| DTO                                   | Where returned                                              |
| ------------------------------------- | ----------------------------------------------------------- |
| `AuthUserDto`                         | register/verify/login/refresh/me/update profile/admin users |
| `AuthSessionDto`                      | login, refresh                                              |
| `AuthUserResponse` (`{ user }`)       | verify-email, me, update profile                            |
| `MessageResponse` (`{ message }`)     | register, resend, logout, forgot, reset                     |
| `ImageDto`                            | image create endpoints, profile image GET/POST              |
| `SocialImageDto`                      | trip/point image lists                                      |
| `SocialState`                         | trip detail, day, point, image, like/favorite responses     |
| `TripGroupResponse`                   | POST /trips, POST /trips/:tripId/days, PUT /trips/:tripId/days/:dayId |
| `TripDay`                             | PUT /trips/:tripId/days/reorder                              |
| `TripPoint`                           | point GET/POST/PUT, point reorder                           |
| `TripGroupResponse`                    | GET /trips, GET /trips/top, GET /trips/:id                 |
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
14. **Public GET with a valid Authorization token**: authenticated viewer context; viewer-specific fields (`likedByMe`, `favoritedByMe`) are returned where the existing DTO supports them.
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
| GET    | `/trips/:id`                          | Public           | param `id` = `tripGroupId` (INT)                                       | 200 `TripGroupResponse`              | 400, 401, 404           |
| GET    | `/trips/top`                           | Public           | none                                                                    | 200 `TripGroupResponse[]` (max 5)    | 401                     |
| GET    | `/me/trips`                | Auth             | none                                                                    | 200 `TripGroupResponse[]`            | 401, 403                |
| GET    | `/me/favorites`            | Auth             | none                                                                    | 200 `TripGroupResponse[]`            | 401, 403                |
| GET    | `/trips/background`              | Public           | none                                                                    | 200 `{ url }`                        | 401, 404                |
| POST   | `/trips`                              | Auth             | `{ title, description, group, transport }`                              | 201 `TripGroupResponse`              | 400, 401, 403           |
| DELETE | `/trips/:id`                          | Owner/Mod        | param `id`                                                              | 204                                  | 400, 401, 403, 404      |
| POST   | `/trips/:tripId/days`                 | Owner/Mod        | param `tripId`; body `{ dayNumber?, title?, description? }`             | 201 `TripGroupResponse`              | 400, 401, 403, 404, 409 |
| PUT    | `/trips/:tripId/days/reorder`         | Owner/Mod        | param `tripId`; body `{ dayIds }`                                       | 200 `TripDay[]`                      | 400, 401, 403, 404      |
| PUT    | `/trips/:tripId/days/:dayId`          | Owner/Mod        | params `tripId,dayId`; body `{ title?, description? }`                  | 200 `TripGroupResponse`              | 400, 401, 403, 404      |
| DELETE | `/trips/:tripId/days/:dayId`          | Owner/Mod        | params `tripId,dayId`                                                   | 204                                  | 400, 401, 403, 404, 409 |
| POST   | `/trips/:tripId/days/:dayId/images`   | Owner/Mod        | params `tripId,dayId`; multipart `file`                                 | 201 `ImageDto`                       | 400, 401, 403, 404, 409 |
| POST   | `/points`                             | Owner/Mod        | `{ dayId, title, description?, latitude, longitude }`                   | 201 `TripPoint`                      | 400, 401, 403, 404      |
| GET    | `/points/:pointId`                    | Public           | param `pointId`                                                         | 200 `TripPoint`                      | 400, 401, 404           |
| PUT    | `/points/:pointId`                    | Owner/Mod        | param `pointId`; body `{ title?, description?, latitude?, longitude? }` | 200 `TripPoint`                      | 400, 401, 403, 404      |
| DELETE | `/points/:pointId`                    | Owner/Mod        | param `pointId`                                                         | 204                                  | 400, 401, 403, 404      |
| POST   | `/points/:pointId/images`             | Owner/Mod        | param `pointId`; multipart `file`                                       | 201 `ImageDto`                       | 400, 401, 403, 404, 409 |
| DELETE | `/points/:pointId/images/:imageId`    | Owner/Mod        | params `pointId,imageId`                                                | 204                                  | 400, 401, 403, 404      |
| PUT    | `/days/:dayId/points/reorder`         | Owner/Mod        | param `dayId`; body `{ pointIds }`                                      | 200 `TripPoint[]`                    | 400, 401, 403, 404      |
| DELETE | `/images/:imageId`                    | Owner/Mod        | param `imageId`                                                         | 204                                  | 400, 401, 403, 404      |
| GET    | `/trip-groups/:tripGroupId/comments`  | Public           | param `tripGroupId`; query `page,limit`                                 | 200 `CommentListResponse`            | 400, 401, 404           |
| POST   | `/trip-groups/:tripGroupId/comments`  | Auth             | param `tripGroupId`; body `{ text }`                                    | 201 `CommentDto`                     | 400, 401, 404           |
| GET    | `/trips/:tripId/days/:dayId/comments` | Public           | params `tripId,dayId`; query `page,limit`                               | 200 `CommentListResponse`            | 400, 401, 404           |
| POST   | `/trips/:tripId/days/:dayId/comments` | Auth             | params `tripId,dayId`; body `{ text }`                                  | 201 `CommentDto`                     | 400, 401, 404           |
| GET    | `/points/:pointId/comments`           | Public           | param `pointId`; query `page,limit`                                     | 200 `CommentListResponse`            | 400, 401, 404           |
| POST   | `/points/:pointId/comments`           | Auth             | param `pointId`; body `{ text }`                                        | 201 `CommentDto`                     | 400, 401, 404           |
| GET    | `/images/:imageId/comments`           | Public           | param `imageId`; query `page,limit`                                     | 200 `CommentListResponse`            | 400, 401, 404           |
| POST   | `/images/:imageId/comments`           | Auth             | param `imageId`; body `{ text }`                                        | 201 `CommentDto`                     | 400, 401, 404           |
| PUT    | `/comments/:commentId`                | Author           | param `commentId`; body `{ text }`                                      | 200 `CommentDto`                     | 400, 401, 403, 404      |
| DELETE | `/comments/:commentId`                | Author/Owner/Mod | param `commentId`                                                       | 204                                  | 400, 401, 403, 404      |
| POST   | `/likes/`                             | Auth             | `{ targetType, targetId }`                                              | 200 `SocialState`                    | 400, 401, 404           |
| DELETE | `/likes/`                             | Auth             | query `targetType,targetId`                                             | 204                                  | 400, 401, 404           |
| POST   | `/favorites/`                         | Auth             | `{ tripGroupId }`                                                       | 200 `SocialState`                    | 400, 401, 404           |
| DELETE | `/favorites/`                         | Auth             | query `tripGroupId`                                                     | 204                                  | 400, 401, 404           |
| POST   | `/reports/`                           | Auth             | `{ targetType, targetId, reason? }`                                     | 201 `ReportDto`                      | 400, 401, 404, 409      |
| GET    | `/admin/users`                        | admin/manager    | query `page,pageSize`                                                   | 200 `AdminPage<AuthUserDto>`         | 400, 401, 403           |
| PUT    | `/admin/users/:userId`                | admin            | param `userId`; body `{ firstName?, lastName?, role?, status? }`        | 200 `AuthUserDto`                    | 400, 401, 403, 404      |
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
GET /api/v1/trips/:id
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

The slow dynamic-config refresh is responsible for background-image discovery.

Required behavior:

```text
refreshSlow()
    |
    +--> load dynamic configuration
    |
    +--> load background object names from GCS
    |
    +--> success:
    |       replace current background-name list
    |
    +--> failure:
            warn log
            keep last successful background-name list
            do not fail application startup
```

The background service then performs:

```text
dynamic config background names
        |
        v
random selection
        |
        v
public image URL
        |
        v
background controller
        |
        v
JSON response
```

The controller must not perform GCS access or random selection itself.

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

Route-parameter schemas (section 18.7) are shared and used across modules: `userIdParams`, `tripIdParams`, `tripIdOnlyParams`, `tripDayParams`, `dayIdParams`, `pointIdParams`, `pointImageParams`, `imageIdParams`, `commentIdParams`, `tripGroupIdParams`, `adminReportIdParams`.

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

This section defines the backend architecture required for the new background-image behavior.

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

The new implementation must preserve the functional result while moving the operation into the dynamic-config slow refresh architecture.

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
POST /api/v1/reports/
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

The initial report contract supports:

```text
tripGroup
trip
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
  +--> POST /reports/
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

## 26. Contract Change Summary

The following additions are part of this API contract and must be implemented consistently in Backend and Frontend.

| Feature        | Endpoint                          | Access        | Main rule                             |
| -------------- | --------------------------------- | ------------- | ------------------------------------- |
| Top 5 trips    | `GET /trips/top`             | Public        | 5 trip groups with most likes         |
| My Trips       | `GET /me/trips`        | Auth          | Current user's owned trip groups      |
| My Favorites   | `GET /me/favorites`    | Auth          | Current user's favorite trip groups   |
| Background     | `GET /trips/background`      | Public        | Random public GCS background          |
| Report list    | `GET /admin/reports`              | Admin/Manager | Automatically lists persisted reports |
| Delete report  | `DELETE /admin/reports/:reportId` | Admin/Manager | Deletes report record only            |
| Report comment | `POST /reports/`                  | Auth          | `targetType=comment` supported        |
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
16. **Existing API/auth/security/image/comment/trip rules remain unchanged unless explicitly modified above.**
17. **No existing contract section, endpoint, schema, DTO, or security rule is removed merely because these new endpoints are added.**
18. **`GET /auth/session` is the only new session-presence probe: it is read-only, returns only `hasSession`, and must not rotate or expose refresh/access tokens or user identity.**
