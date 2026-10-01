/** TCP port the Express application listens on. */
export const SERVER_PORT = 8080;

/**
 * Number of trusted reverse-proxy hops in front of the application. It must match
 * the real deployment: every additional trusted hop makes `req.ip` (rate limiting,
 * failed-log records, the 404 logger) spoofable through `X-Forwarded-For`.
 */
export const TRUST_PROXY_HOPS = 1;

/** Process signals that start the graceful shutdown. */
export const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

