import { ApiError } from './apiError';

export function requireTrimmedString(value: unknown, field: string, maxLength: number): string {
    if (typeof value !== 'string') throw ApiError.validation(`"${field}" must be a string.`);

    const trimmed = value.trim();
    if (trimmed.length === 0) throw ApiError.validation(`"${field}" must not be empty.`);
    if (trimmed.length > maxLength) {
        throw ApiError.validation(`"${field}" must be at most ${maxLength} characters.`);
    }
    return trimmed;
}

/** Missing/blank optional text becomes `null` instead of an empty stored value. */
export function optionalString(value: unknown, field: string, maxLength: number): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw ApiError.validation(`"${field}" must be a string.`);

    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > maxLength) {
        throw ApiError.validation(`"${field}" must be at most ${maxLength} characters.`);
    }
    return trimmed;
}

export function optionalPositiveInt(value: unknown, field: string): number | null {
    if (value === undefined || value === null || value === '') return null;

    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw ApiError.validation(`"${field}" must be a positive integer.`);
    }
    return parsed;
}

export function optionalNumberInRange(value: unknown, field: string, min: number, max: number): number | null {
    if (value === undefined || value === null || value === '') return null;

    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) throw ApiError.validation(`"${field}" must be a number.`);
    if (parsed < min || parsed > max) {
        throw ApiError.validation(`"${field}" must be between ${min} and ${max}.`);
    }
    return parsed;
}

export function asRecord(value: unknown, what: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw ApiError.validation(`${what} must be a JSON object.`);
    }
    return value as Record<string, unknown>;
}

export function asArray(value: unknown, field: string): unknown[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw ApiError.validation(`"${field}" must be an array.`);
    return value;
}
