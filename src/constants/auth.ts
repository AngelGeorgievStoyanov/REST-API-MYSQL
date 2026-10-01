/**
 * Lifetimes of the emailed one-time tokens. The access/refresh token lifetimes
 * are configuration (`src/config/auth.ts`), not constants.
 */
export const EMAIL_VERIFICATION_TOKEN_TTL_SECONDS = 24 * 60 * 60;
export const PASSWORD_RESET_TOKEN_TTL_SECONDS = 60 * 60;

/** Opaque refresh token: 32 random bytes hex-encoded = 64 chars = tokenHash width. */
export const OPAQUE_TOKEN_BYTES = 32;

/** `sub`-only access token: the claim that marks it as an access token. */
export const ACCESS_TOKEN_TYPE = 'access';

export const REFRESH_COOKIE_NAME = 'hack_trip_refresh';
/** The cookie is only sent to the auth endpoints that can use it. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** Column widths of `users` (id UUID / VARCHAR(36), the rest VARCHAR(45)). */
export const MAX_USER_ID_LENGTH = 36;
export const MAX_EMAIL_LENGTH = 45;
export const MAX_NAME_LENGTH = 45;

export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt only considers the first 72 bytes of a password. */
export const MAX_PASSWORD_LENGTH = 72;
export const PASSWORD_HASH_ROUNDS = 10;

/** Legacy `users.lastTimeLogin` is VARCHAR(24) holding an ISO string. */
export const MAX_LAST_LOGIN_LENGTH = 24;

/**
 * Fixed bcrypt hash compared against when the email of a login is unknown, so a
 * failed login costs the same as a real one and cannot be used to probe accounts.
 * The plaintext behind it is irrelevant: it only has to be a valid hash.
 */
export const ABSENT_USER_PASSWORD_HASH = '$2b$10$C6UzMDM.H6dfI/f/IKcEeO1uFqZf5nUwJXvO0.lQybfhB5VcLJ3Iu';

/**
 * Size the in-memory rate-limit bucket map may reach before expired windows are
 * swept. It bounds the memory of the limiter, not the request budget.
 */
export const AUTH_RATE_LIMIT_PRUNE_THRESHOLD = 1000;
