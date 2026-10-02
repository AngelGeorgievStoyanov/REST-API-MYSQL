/**
 * Fallback defaults of the environment configuration. They are reusable
 * application constants, not secrets; the resolved runtime values live in
 * `src/config/environment.ts`.
 */

/** Fallback cadence of the runtime config cache when `CONFIG_SLOW_REFRESH_SECONDS` is unset. */
export const DEFAULT_SLOW_REFRESH_SECONDS = 300;

/**
 * Fallback value of the public frontend token. It is a published, copyable
 * marker — it only tells the API that the caller speaks the frontend contract,
 * so a checked-in default is not a secret and never grants privileges. It is
 * never an authentication or authorization factor and must not be treated as a
 * JWT or replaced with a generated secret.
 */
export const DEFAULT_PUBLIC_FRONTEND_TOKEN = 'hacktrip-public-v1';
