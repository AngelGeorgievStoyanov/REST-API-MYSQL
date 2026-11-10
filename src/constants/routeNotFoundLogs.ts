/**
 * Widths of the live `routenotfoundlogs` VARCHAR columns. Recorded request values
 * are fitted to them, so they are not free to change with the API contract.
 */
export const MAX_URL_LENGTH = 145;
export const MAX_METHOD_LENGTH = 15;
export const MAX_HEADERS_LENGTH = 1000;
export const MAX_QUERY_LENGTH = 145;
export const MAX_BODY_LENGTH = 1000;
export const MAX_PARAMS_LENGTH = 145;
export const MAX_CLIENT_IP_LENGTH = 1000;
export const MAX_ACTOR_ID_LENGTH = 36;

/** Bounds applied before request diagnostics are serialized. */
export const MAX_REQUEST_LOG_OBJECT_ENTRIES = 100;
export const MAX_REQUEST_LOG_ARRAY_ENTRIES = 100;
export const MAX_REQUEST_LOG_NESTING_DEPTH = 8;
export const REQUEST_LOG_TRUNCATION_MARKER = '...[TRUNCATED]';

/** Multipart and binary payloads are represented by an omission marker, not stored. */
export const REQUEST_BODY_OMITTED_MARKER = '[BODY OMITTED: multipart/binary]';
