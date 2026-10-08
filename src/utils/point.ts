import { MAX_POINT_DESCRIPTION_LENGTH, MAX_POINT_NAME_LENGTH } from '../constants/trip';
import { VALIDATION_LIMITS } from '../constants/validation/limits';
import { PointCreateRequest, PointUpdateRequest } from '../model/trip';
import { ApiError } from './apiError';
import { toNumberOrNull } from './utils';
import {
    CLIENT_OWNERSHIP_FIELDS,
    asRecord,
    optionalNumberInRange,
    optionalString,
    parsePositiveId,
    rejectClientControlledFields,
    rejectOwnershipAndParentFields,
    requireNumberInRange,
    requireTrimmedString,
} from './validation';

const POINT_SEQUENCE_FIELDS = ['pointNumber', 'numberPoint'];
const EDITABLE_POINT_FIELDS = ['name', 'description', 'lat', 'lng'];
/** Geographic bounds of `points.lat` / `points.lng`, canonical in the validation limits. */
const LATITUDE = VALIDATION_LIMITS.point.lat;
const LONGITUDE = VALIDATION_LIMITS.point.lng;

export function parsePointCreateBody(body: unknown): PointCreateRequest {
    const record = asRecord(body, 'Request body');
    rejectClientControlledFields(record, [...CLIENT_OWNERSHIP_FIELDS, 'tripId', ...POINT_SEQUENCE_FIELDS], 'Point');

    return {
        dayId: parsePositiveId(record.dayId, 'dayId'),
        name: requireTrimmedString(record.name, 'name', MAX_POINT_NAME_LENGTH),
        description: optionalString(record.description, 'description', MAX_POINT_DESCRIPTION_LENGTH),
        lat: requireNumberInRange(record.lat, 'lat', LATITUDE.min, LATITUDE.max),
        lng: requireNumberInRange(record.lng, 'lng', LONGITUDE.min, LONGITUDE.max),
    };
}

export function parsePointUpdateBody(body: unknown): PointUpdateRequest {
    const record = asRecord(body, 'Request body');
    rejectOwnershipAndParentFields(record, 'Point');
    rejectClientControlledFields(record, POINT_SEQUENCE_FIELDS, 'Point');

    const request: PointUpdateRequest = {};
    if (record.name !== undefined) request.name = requireTrimmedString(record.name, 'name', MAX_POINT_NAME_LENGTH);
    if (record.description !== undefined) {
        request.description = optionalString(record.description, 'description', MAX_POINT_DESCRIPTION_LENGTH);
    }
    if (record.lat !== undefined) {
        request.lat = optionalNumberInRange(record.lat, 'lat', LATITUDE.min, LATITUDE.max);
    }
    if (record.lng !== undefined) {
        request.lng = optionalNumberInRange(record.lng, 'lng', LONGITUDE.min, LONGITUDE.max);
    }

    if (EDITABLE_POINT_FIELDS.every((field) => record[field] === undefined)) {
        throw ApiError.validation(`Provide at least one of: ${EDITABLE_POINT_FIELDS.join(', ')}.`);
    }
    return request;
}

/** `pointNumber` is a VARCHAR column, but its values are always numeric. */
export function sortPointsByNumber<T extends { pointNumber: string }>(points: T[]): T[] {
    return [...points].sort((left, right) => {
        const leftNumber = toNumberOrNull(left.pointNumber) ?? Number.MAX_SAFE_INTEGER;
        const rightNumber = toNumberOrNull(right.pointNumber) ?? Number.MAX_SAFE_INTEGER;
        return leftNumber - rightNumber;
    });
}
