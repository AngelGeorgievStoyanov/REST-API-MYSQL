const SENSITIVE_FIELD = /(password|token|secret|authorization|cookie|api.?key|credential)/i;
const MAX_OBJECT_ENTRIES = 100;
const MAX_ARRAY_ENTRIES = 100;
const MAX_NESTING_DEPTH = 8;

export function redactSensitiveRequestData(value: unknown, depth = 0): unknown {
    if (depth >= MAX_NESTING_DEPTH) return '[REDACTED_NESTED]';
    if (Array.isArray(value)) {
        return value.slice(0, MAX_ARRAY_ENTRIES).map((entry) => redactSensitiveRequestData(entry, depth + 1));
    }
    if (typeof value !== 'object' || value === null) return value;

    const entries = Object.entries(value).slice(0, MAX_OBJECT_ENTRIES);
    return Object.fromEntries(entries.map(([key, entry]) => [
        key,
        SENSITIVE_FIELD.test(key) ? '[REDACTED]' : redactSensitiveRequestData(entry, depth + 1),
    ]));
}