import { dynamicConfig } from '../services/dynamicConfig';
import { VALIDATION_LIMITS } from '../constants/validation/limits';
import {
    DEFAULT_LIMIT,
    DEFAULT_PAGE,
    GROUP_SELECT_TYPE,
    MAX_DESCRIPTION_LENGTH,
    MAX_LIMIT,
    MAX_SEARCH_LENGTH,
    MAX_SELECT_VALUE_LENGTH,
    MAX_TITLE_LENGTH,
    TRANSPORT_SELECT_TYPE,
    TRIP_SORTS,
} from '../constants/trip';
import {
    DayCreateRequest,
    DayUpdateRequest,
    TripListQuery,
    TripSort,
    TripWriteRequest,
} from '../model/trip';
import { ApiError } from './apiError';
import { firstValue } from './utils';
import {
    asRecord,
    optionalString,
    rejectClientControlledFields,
    rejectOwnershipAndParentFields,
    requirePositiveInt,
    requireTrimmedString,
} from './validation';

interface SelectOptionLookup {
    key: string;
    value: string;
    isActive: boolean;
}

export function parseTripGroupId(rawId: string): number {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
        throw ApiError.validation('Trip group id must be a positive integer.');
    }
    return id;
}

function parsePositiveIntQuery(value: unknown, field: string, fallback: number, max?: number): number {
    const raw = firstValue(value);
    if (raw === undefined || raw === null || raw === '') return fallback;

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw ApiError.validation(`"${field}" must be a positive integer.`);
    }
    if (max !== undefined && parsed > max) {
        throw ApiError.validation(`"${field}" must be at most ${max}.`);
    }
    return parsed;
}

function parseSort(value: unknown): TripSort {
    const raw = firstValue(value);
    if (raw === undefined || raw === null || raw === '') return 'newest';

    const requested = typeof raw === 'string' ? raw : '';
    const sort = TRIP_SORTS.find((candidate) => candidate === requested);
    if (sort !== undefined) return sort;

    throw ApiError.validation(`"sort" must be one of: ${TRIP_SORTS.join(', ')}.`);
}

export function parseListQuery(rawQuery: unknown): TripListQuery {
    const query: Record<string, unknown> = typeof rawQuery === 'object' && rawQuery !== null
        ? rawQuery as Record<string, unknown>
        : {};

    return {
        page: parsePositiveIntQuery(query.page, 'page', DEFAULT_PAGE),
        limit: parsePositiveIntQuery(query.limit, 'limit', DEFAULT_LIMIT, MAX_LIMIT),
        search: optionalString(firstValue(query.search), 'search', MAX_SEARCH_LENGTH),
        group: optionalString(firstValue(query.group), 'group', MAX_SELECT_VALUE_LENGTH),
        transport: optionalString(firstValue(query.transport), 'transport', MAX_SELECT_VALUE_LENGTH),
        sort: parseSort(query.sort),
    };
}

/**
 * Read from the `dynamicConfig` cache so a request never touches the select tables.
 */
function readSelectOptions(typeKey: string): SelectOptionLookup[] {
    return dynamicConfig.getSelectType(typeKey)?.options ?? [];
}

/** Both the stable select key and the stored display value are accepted as input. */
function matchesSelectValue(option: SelectOptionLookup, value: string): boolean {
    const requested = value.toLowerCase();
    return option.key.toLowerCase() === requested || option.value.toLowerCase() === requested;
}


function resolveSelectKey(typeKey: string, value: unknown, field: string): string {
    const requested = requireTrimmedString(value, field, MAX_SELECT_VALUE_LENGTH);
    const activeOptions = readSelectOptions(typeKey).filter((option) => option.isActive);
    const option = activeOptions.find((candidate) => matchesSelectValue(candidate, requested));

    if (!option) {
        const known = activeOptions.map((candidate) => candidate.key).join(', ');
        throw ApiError.validation(`Unknown "${field}" value "${requested}". Known values: ${known || 'none'}.`);
    }
    return option.key;
}

/** Accepted stored values for a list filter (both the select key and its display value). */
export function resolveSelectFilterValues(typeKey: string, value: string, field: string): string[] {
    const option = readSelectOptions(typeKey).find((candidate) => matchesSelectValue(candidate, value));
    if (!option) throw ApiError.validation(`Unknown "${field}" filter "${value}".`);

    return [...new Set([option.key, option.value])];
}


export function parseTripBody(body: unknown): TripWriteRequest {
    const record = asRecord(body, 'Request body');
    rejectClientControlledFields(record, ['days', 'points'], 'Trip');

    return {
        // The initial day's ordinal is user-selected and required; the server
        // never substitutes a default day number.
        dayNumber: requirePositiveInt(record.dayNumber, 'dayNumber', VALIDATION_LIMITS.trip.dayNumber.max),
        title: requireTrimmedString(record.title, 'title', MAX_TITLE_LENGTH),
        description: optionalString(record.description, 'description', MAX_DESCRIPTION_LENGTH),
        group: resolveSelectKey(GROUP_SELECT_TYPE, record.group, 'group'),
        transport: resolveSelectKey(TRANSPORT_SELECT_TYPE, record.transport, 'transport'),
    };
}

export function parseDayCreateBody(body: unknown): DayCreateRequest {
    const record = asRecord(body === undefined || body === null ? {} : body, 'Request body');
    rejectOwnershipAndParentFields(record, 'Day');

    return {
        // Required, user-selected ordinal — no automatic `max + 1` fallback.
        dayNumber: requirePositiveInt(record.dayNumber, 'dayNumber', VALIDATION_LIMITS.trip.dayNumber.max),
        title: optionalString(record.title, 'title', MAX_TITLE_LENGTH),
        description: optionalString(record.description, 'description', MAX_DESCRIPTION_LENGTH),
    };
}

export function parseDayUpdateBody(body: unknown): DayUpdateRequest {
    const record = asRecord(body, 'Request body');
    rejectOwnershipAndParentFields(record, 'Day');

    if (record.dayNumber !== undefined) {
        throw ApiError.validation('"dayNumber" cannot be changed here; use the day reorder endpoint.');
    }

    const request: DayUpdateRequest = {};
    if (record.title !== undefined) request.title = requireTrimmedString(record.title, 'title', MAX_TITLE_LENGTH);
    if (record.description !== undefined) {
        request.description = optionalString(record.description, 'description', MAX_DESCRIPTION_LENGTH);
    }

    if (record.title === undefined && record.description === undefined) {
        throw ApiError.validation('Provide at least one of: title, description.');
    }
    return request;
}

