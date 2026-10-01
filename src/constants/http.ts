/**
 * HTTP protocol constants of the application: the client marker, CORS, the
 * security header and the request body ceilings.
 */

/**
 * Marker header the frontend bundle sends. It is the first noise filter, not a
 * credential: it is visible in the bundle and on the network, so nothing may be
 * authorized by it.
 */
export const HACKTRIP_CLIENT_HEADER = 'x-hacktrip-client';
export const HACKTRIP_CLIENT_VALUE = 'web';

/** Answers with an empty 404 for every request without the client marker. */
export const CLIENT_HEADER_REJECTION_STATUS = 404;

/** HSTS policy; a TLS-terminating reverse proxy sits in front of the application. */
export const HSTS_HEADER_NAME = 'Strict-Transport-Security';
export const HSTS_HEADER_VALUE = 'max-age=31536000; includeSubDomains; preload';

/** Production browser origins allowed to call the API. Never a wildcard: credentials are on. */
export const PRODUCTION_CORS_ORIGINS = ['https://hack-trip.com', 'https://www.hack-trip.com'];

/**
 * Local development origin. The frontend dev server runs on port 3000
 * (`vite --port 3000`), so a non-production run accepts this origin only.
 */
export const DEVELOPMENT_CORS_ORIGINS = ['http://localhost:3000'];

export const CORS_METHODS = 'GET,POST,PUT,DELETE';
/** Headers a credentialed cross-origin request may carry: the marker, the JSON body and the token. */
export const CORS_ALLOWED_HEADERS = [HACKTRIP_CLIENT_HEADER, 'Content-Type', 'Authorization'];
/**
 * Method of the CORS preflight. A preflight cannot carry the client marker, so it
 * is answered by CORS instead of the client-header filter.
 */
export const CORS_PREFLIGHT_METHOD = 'OPTIONS';

/**
 * Body ceilings. JSON payloads are small by contract (the largest field is a
 * 2000-char description); binary uploads never travel through the body parsers,
 * they are read by the image storage engine with its own per-file cap.
 */
export const JSON_BODY_LIMIT = '1mb';
export const URLENCODED_BODY_LIMIT = '100kb';
export const URLENCODED_PARAMETER_LIMIT = 1000;
