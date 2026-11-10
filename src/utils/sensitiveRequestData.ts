import {
  MAX_REQUEST_LOG_ARRAY_ENTRIES,
  MAX_REQUEST_LOG_NESTING_DEPTH,
  MAX_REQUEST_LOG_OBJECT_ENTRIES,
} from '../constants/routeNotFoundLogs';

const SENSITIVE_FIELD =
  /(password|passwd|pwd|token|secret|authorization|cookie|api.?key|credential|private.?key|client.?secret|session|signature|^sig$)/i;
const URL_VALUE_FIELD = /(url|uri|referer|referrer|redirect|callback|return)/i;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const JWT_VALUE = /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g;

/**
 * Keeps the field name while replacing only its value. This makes it possible
 * to see which credentials an incoming request attempted to use.
 */
export function redactSensitiveRequestData(value: unknown, depth = 0): unknown {
  if (depth >= MAX_REQUEST_LOG_NESTING_DEPTH) return '[REDACTED_NESTED]';

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_REQUEST_LOG_ARRAY_ENTRIES)
      .map((entry) => redactSensitiveRequestData(entry, depth + 1));
  }

  if (typeof value === 'string') return redactCredentialStrings(value);
  if (typeof value !== 'object' || value === null) return value;

  const entries = Object.entries(value).slice(0, MAX_REQUEST_LOG_OBJECT_ENTRIES);

  return Object.fromEntries(
    entries.map(([key, entry]) => {
      if (SENSITIVE_FIELD.test(key)) return [key, '[REDACTED]'];
      if (typeof entry === 'string' && URL_VALUE_FIELD.test(key)) {
        return [key, redactUrlQuery(entry)];
      }
      return [key, redactSensitiveRequestData(entry, depth + 1)];
    }),
  );
}

/** Also catches credentials embedded in free-form diagnostic strings. */
function redactCredentialStrings(value: string): string {
  return value.replace(BEARER_VALUE, 'Bearer [REDACTED]').replace(JWT_VALUE, '[REDACTED]');
}

/** URL-valued headers/fields can contain credentials in their query string. */
function redactUrlQuery(value: string): string {
  try {
    const url = new URL(value);
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_FIELD.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    url.hash = redactCredentialStrings(url.hash);
    return redactCredentialStrings(url.toString());
  } catch {
    return redactCredentialStrings(value);
  }
}
