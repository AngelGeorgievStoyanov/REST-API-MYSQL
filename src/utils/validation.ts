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

export function requireNumberInRange(value: unknown, field: string, min: number, max: number): number {
    if (value === undefined || value === null || value === '') {
        throw ApiError.validation(`"${field}" is required.`);
    }
    return optionalNumberInRange(value, field, min, max) as number;
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

export const CLIENT_OWNERSHIP_FIELDS = ['_ownerId', '_ownerTripId', 'ownerId', 'userId'];
const PARENT_FIELDS = ['tripId', 'dayId'];

export function rejectClientControlledFields(
    record: Record<string, unknown>,
    fields: string[],
    what: string,
): void {
    const present = fields.filter((field) => record[field] !== undefined);
    if (present.length > 0) {
        throw ApiError.validation(`${what} must not contain client-controlled ${present.map((field) => `"${field}"`).join(', ')}.`);
    }
}

/** Ownership and parent relationships always come from the JWT and the URL. */
export function rejectOwnershipAndParentFields(record: Record<string, unknown>, what: string): void {
    rejectClientControlledFields(record, [...CLIENT_OWNERSHIP_FIELDS, ...PARENT_FIELDS], what);
}

export function parsePositiveId(rawId: unknown, label: string): number {
    const value = Array.isArray(rawId) ? rawId[0] : rawId;
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
        throw ApiError.validation(`${label} must be a positive integer.`);
    }
    return id;
}

/** Full ordered list of the resources of one parent, used by the reorder endpoints. */
export function parseIdList(body: unknown, field: string, minimum: number): number[] {
    const record = asRecord(body, 'Request body');
    const value = record[field];

    if (!Array.isArray(value)) throw ApiError.validation(`"${field}" must be an array of ids.`);
    if (value.length < minimum) {
        throw ApiError.validation(`"${field}" must contain at least ${minimum} id${minimum === 1 ? '' : 's'}.`);
    }

    const ids = value.map((item) => parsePositiveId(item, `"${field}" entry`));
    if (new Set(ids).size !== ids.length) {
        throw ApiError.validation(`"${field}" must not contain duplicate ids.`);
    }
    return ids;
}
