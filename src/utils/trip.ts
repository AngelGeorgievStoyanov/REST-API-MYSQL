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
    CURRENCY_SELECT_TYPE,
    TRIP_SORTS,
} from '../constants/trip';
import {
    type DayCreateRequest,
    type DayUpdateRequest,
    type TripListQuery,
    type TripSort,
    type TripWriteRequest,
    type TripEditRequest,
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
        page: parsePositiveIntQuery(query['page'], 'page', DEFAULT_PAGE),
        limit: parsePositiveIntQuery(query['limit'], 'limit', DEFAULT_LIMIT, MAX_LIMIT),
        search: optionalString(firstValue(query['search']), 'search', MAX_SEARCH_LENGTH),
        group: optionalString(firstValue(query['group']), 'group', MAX_SELECT_VALUE_LENGTH),
        transport: optionalString(firstValue(query['transport']), 'transport', MAX_SELECT_VALUE_LENGTH),
        sort: parseSort(query['sort']),
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
    const options = readSelectOptions(typeKey);
    const option = options.find((candidate) => matchesSelectValue(candidate, requested));

    if (!option) {
        const known = options.map((candidate) => candidate.key).join(', ');
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
        dayNumber: requirePositiveInt(record['dayNumber'], 'dayNumber', VALIDATION_LIMITS.trip.dayNumber.max),
        title: requireTrimmedString(record['title'], 'title', MAX_TITLE_LENGTH),
        description: optionalString(record['description'], 'description', MAX_DESCRIPTION_LENGTH),
        price: record['price'] !== undefined ? record['price'] as number : null,
        transport: resolveSelectKey(TRANSPORT_SELECT_TYPE, record['transport'], 'transport'),
        countPeoples: requirePositiveInt(record['countPeoples'], 'countPeoples', VALIDATION_LIMITS.trip.countPeoples.max),
        typeOfPeople: resolveSelectKey(GROUP_SELECT_TYPE, record['typeOfPeople'], 'typeOfPeople'),
        destination: record['destination'] !== undefined ? requireTrimmedString(record['destination'], 'destination', MAX_TITLE_LENGTH) : null,
        lat: record['lat'] !== undefined ? record['lat'] as number : null,
        lng: record['lng'] !== undefined ? record['lng'] as number : null,
        currency: resolveSelectKey(CURRENCY_SELECT_TYPE, record['currency'], 'currency'),
    };
}

/** Parse the complete Edit Trip body. The request schema requires every field before this parser runs. */
export function parseTripEditBody(body: unknown): TripEditRequest {
    const record = asRecord(body, 'Request body');
    rejectClientControlledFields(record, ['id', 'ownerId', 'tripGroupId', 'countEdited', 'days', 'points'], 'Trip');

    const description = record['description'];
    const destination = record['destination'];
    const lat = record['lat'];
    const lng = record['lng'];
    const price = record['price'];

    if (description !== null && typeof description !== 'string') {
        throw ApiError.validation('"description" must be a string or null.');
    }
    if (destination !== null && typeof destination !== 'string') {
        throw ApiError.validation('"destination" must be a string or null.');
    }
    if (typeof price !== 'number' || !Number.isFinite(price)) {
        throw ApiError.validation('"price" must be a number.');
    }
    if (lat !== null && (typeof lat !== 'number' || !Number.isFinite(lat))) {
        throw ApiError.validation('"lat" must be a number or null.');
    }
    if (lng !== null && (typeof lng !== 'number' || !Number.isFinite(lng))) {
        throw ApiError.validation('"lng" must be a number or null.');
    }

    return {
        dayNumber: requirePositiveInt(record['dayNumber'], 'dayNumber', VALIDATION_LIMITS.trip.dayNumber.max),
        title: requireTrimmedString(record['title'], 'title', MAX_TITLE_LENGTH),
        description: description === null ? null : optionalString(description, 'description', MAX_DESCRIPTION_LENGTH),
        price,
        transport: resolveSelectKey(TRANSPORT_SELECT_TYPE, record['transport'], 'transport'),
        countPeoples: requirePositiveInt(record['countPeoples'], 'countPeoples', VALIDATION_LIMITS.trip.countPeoples.max),
        typeOfPeople: resolveSelectKey(GROUP_SELECT_TYPE, record['typeOfPeople'], 'typeOfPeople'),
        currency: resolveSelectKey(CURRENCY_SELECT_TYPE, record['currency'], 'currency'),
        destination: destination === null || destination === '' ? null : requireTrimmedString(destination, 'destination', MAX_TITLE_LENGTH),
        lat: lat as number | null,
        lng: lng as number | null,
    };
}

export function parseDayCreateBody(body: unknown): DayCreateRequest {
    const record = asRecord(body ?? {}, 'Request body');
    rejectOwnershipAndParentFields(record, 'Day');

    return {
        // Required, user-selected ordinal — no automatic `max + 1` fallback.
        dayNumber: requirePositiveInt(record['dayNumber'], 'dayNumber', VALIDATION_LIMITS.trip.dayNumber.max),
        title: optionalString(record['title'], 'title', MAX_TITLE_LENGTH),
        description: optionalString(record['description'], 'description', MAX_DESCRIPTION_LENGTH),
    };
}

export function parseDayUpdateBody(body: unknown): DayUpdateRequest {
    const record = asRecord(body, 'Request body');
    rejectOwnershipAndParentFields(record, 'Day');

    if (record['dayNumber'] !== undefined) {
        throw ApiError.validation('"dayNumber" cannot be changed here; use the day reorder endpoint.');
    }

    const request: DayUpdateRequest = {};
    if (record['title'] !== undefined) request.title = requireTrimmedString(record['title'], 'title', MAX_TITLE_LENGTH);
    if (record['description'] !== undefined) {
        request.description = optionalString(record['description'], 'description', MAX_DESCRIPTION_LENGTH);
    }

    if (record['title'] === undefined && record['description'] === undefined) {
        throw ApiError.validation('Provide at least one of: title, description.');
    }
    return request;
}

