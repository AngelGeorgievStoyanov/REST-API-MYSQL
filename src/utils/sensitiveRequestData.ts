import {
  MAX_REQUEST_LOG_ARRAY_ENTRIES,
  MAX_REQUEST_LOG_NESTING_DEPTH,
  MAX_REQUEST_LOG_OBJECT_ENTRIES,
} from '../constants/routeNotFoundLogs';

const SENSITIVE_FIELD =
  /(password|passwd|pwd|token|secret|authorization|cookie|api.?key|credential|private.?key|client.?secret|session|signature|^sig$)/i;

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

  if (typeof value !== 'object' || value === null) return value;

  const entries = Object.entries(value).slice(0, MAX_REQUEST_LOG_OBJECT_ENTRIES);

  return Object.fromEntries(
    entries.map(([key, entry]) => [
      key,
      SENSITIVE_FIELD.test(key) ? '[REDACTED]' : redactSensitiveRequestData(entry, depth + 1),
    ]),
  );
}
