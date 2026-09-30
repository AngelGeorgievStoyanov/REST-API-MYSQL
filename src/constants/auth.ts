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

/** Column widths of `users` (email/firstName/lastName VARCHAR(45)). */
export const MAX_EMAIL_LENGTH = 45;
export const MAX_NAME_LENGTH = 45;

export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt only considers the first 72 bytes of a password. */
export const MAX_PASSWORD_LENGTH = 72;
export const PASSWORD_HASH_ROUNDS = 10;

/** Legacy `users.lastTimeLogin` is VARCHAR(24) holding an ISO string. */
export const MAX_LAST_LOGIN_LENGTH = 24;
