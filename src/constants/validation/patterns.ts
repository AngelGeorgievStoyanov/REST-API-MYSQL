/**
 * Input shape patterns. They describe the *format* of an identifier, while the
 * numeric boundaries live in `./limits.ts`.
 */

/** Path segment of an `INT AUTO_INCREMENT` id (nothing but digits). */
export const POSITIVE_INT_PATTERN = /^\d+$/;

/** Canonical UUID, the shape of `users.id` (VARCHAR(36)). */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Single email address; the only identity input of the auth slice. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
