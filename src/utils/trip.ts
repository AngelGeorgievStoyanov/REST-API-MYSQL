import { dynamicConfig } from '../config/dynamicConfig';
import {
    DEFAULT_LIMIT,
    DEFAULT_PAGE,
    GROUP_SELECT_TYPE,
    IMAGE_BASE_URL_KEY,
    MAX_DESCRIPTION_LENGTH,
    MAX_IMAGE_PATH_LENGTH,
    MAX_LIMIT,
    MAX_POINT_DESCRIPTION_LENGTH,
    MAX_POINT_NAME_LENGTH,
    MAX_SEARCH_LENGTH,
    MAX_SELECT_VALUE_LENGTH,
    MAX_TITLE_LENGTH,
    TRANSPORT_SELECT_TYPE,
    TRIP_SORTS,
    VISUAL_SERVICE,
} from '../constants/trip';
import {
    TripDayInput,
    TripListQuery,
    TripPointInput,
    TripSelectValue,
    TripSort,
    TripWriteRequest,
} from '../model/trip';
import { ApiError } from './apiError';
import { firstValue } from './utils';
import {
    asArray,
    asRecord,
    optionalNumberInRange,
    optionalPositiveInt,
    optionalString,
    requireTrimmedString,
} from './validation';

interface SelectOptionLookup {
    key: string;
    value: string;
    isActive: boolean;
}

export function parseTripId(rawId: string): number {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
        throw ApiError.validation('Trip id must be a positive integer.');
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
    if (typeof raw === 'string' && (TRIP_SORTS as string[]).includes(raw)) return raw as TripSort;

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

export function resolveSelectValue(typeKey: string, storedValue: string | null): TripSelectValue {
    if (!storedValue) return { key: '', name: '' };

    const option = readSelectOptions(typeKey).find((candidate) => matchesSelectValue(candidate, storedValue));
    return option ? { key: option.key, name: option.value } : { key: storedValue, name: storedValue };
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


function readImageBaseUrl(): string | null {
    const service = dynamicConfig.getServiceConfig(VISUAL_SERVICE);
    const entry = service?.configs.find((config) => config.key === IMAGE_BASE_URL_KEY);

    if (!entry || entry.value.length === 0) return null;
    return entry.value.replace(/\/+$/, '');
}

/** `images.filePath` stores a bare filename; legacy rows may already hold a URL. */
export function toImageUrl(filePath: string): string {
    if (/^https?:\/\//i.test(filePath)) return filePath;

    const baseUrl = readImageBaseUrl();
    return baseUrl ? `${baseUrl}/${filePath}` : filePath;
}

function parsePointBody(rawPoint: unknown, day: number, position: number): TripPointInput {
    const record = asRecord(rawPoint, `"days[${day}].points[${position}]"`);
    const field = `days[${day}].points[${position}]`;

    return {
        title: requireTrimmedString(record.title, `${field}.title`, MAX_POINT_NAME_LENGTH),
        description: optionalString(record.description, `${field}.description`, MAX_POINT_DESCRIPTION_LENGTH),
        latitude: optionalNumberInRange(record.latitude, `${field}.latitude`, -90, 90),
        longitude: optionalNumberInRange(record.longitude, `${field}.longitude`, -180, 180),
        images: asArray(record.images, `${field}.images`).map((rawImage, index) =>
            requireTrimmedString(rawImage, `${field}.images[${index}]`, MAX_IMAGE_PATH_LENGTH)),
    };
}

function parseDayBody(rawDay: unknown, position: number): TripDayInput {
    const record = asRecord(rawDay, `"days[${position}]"`);
    const day = optionalPositiveInt(record.day, `days[${position}].day`) ?? position;

    return {
        day,
        title: optionalString(record.title, `days[${day}].title`, MAX_TITLE_LENGTH),
        points: asArray(record.points, `days[${day}].points`).map((rawPoint, index) =>
            parsePointBody(rawPoint, day, index + 1)),
    };
}

export function parseTripBody(body: unknown): TripWriteRequest {
    const record = asRecord(body, 'Request body');
    const days = asArray(record.days, 'days').map((rawDay, index) => parseDayBody(rawDay, index + 1));

    for (const day of days) {
        if (days.filter((other) => other.day === day.day).length > 1) {
            throw ApiError.validation(`Duplicate day "${day.day}" in "days".`);
        }
    }

    return {
        title: requireTrimmedString(record.title, 'title', MAX_TITLE_LENGTH),
        description: optionalString(record.description, 'description', MAX_DESCRIPTION_LENGTH),
        group: resolveSelectKey(GROUP_SELECT_TYPE, record.group, 'group'),
        transport: resolveSelectKey(TRANSPORT_SELECT_TYPE, record.transport, 'transport'),
        days,
    };
}
