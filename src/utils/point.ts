import { MAX_POINT_DESCRIPTION_LENGTH, MAX_POINT_NAME_LENGTH } from '../constants/trip';
import { VALIDATION_LIMITS } from '../constants/validation/limits';
import { type PointCreateRequest, type PointUpdateRequest } from '../model/trip';
import { ApiError } from './apiError';
import {
    CLIENT_OWNERSHIP_FIELDS,
    asRecord,
    optionalString,
    parsePositiveId,
    rejectClientControlledFields,
    rejectOwnershipAndParentFields,
    requireNumberInRange,
    requireTrimmedString,
} from './validation';

const POINT_SEQUENCE_FIELDS = ['pointNumber', 'numberPoint'];
/** Geographic bounds of `points.lat` / `points.lng`, canonical in the validation limits. */
const LATITUDE = VALIDATION_LIMITS.point.lat;
const LONGITUDE = VALIDATION_LIMITS.point.lng;

export function parsePointCreateBody(body: unknown): PointCreateRequest {
    const record = asRecord(body, 'Request body');
    rejectClientControlledFields(record, [...CLIENT_OWNERSHIP_FIELDS, 'dayId', ...POINT_SEQUENCE_FIELDS], 'Point');

    return {
        // The request `tripId` is the primary key `trips.id` of the day row the
        // point is created in; it is forwarded to the parent lookup unchanged.
        tripId: parsePositiveId(record['tripId'], 'tripId'),
        name: requireTrimmedString(record['name'], 'name', MAX_POINT_NAME_LENGTH),
        description: optionalString(record['description'], 'description', MAX_POINT_DESCRIPTION_LENGTH),
        lat: requireNumberInRange(record['lat'], 'lat', LATITUDE.min, LATITUDE.max),
        lng: requireNumberInRange(record['lng'], 'lng', LONGITUDE.min, LONGITUDE.max),
    };
}

export function parsePointUpdateBody(body: unknown): PointUpdateRequest {
    const record = asRecord(body, 'Request body');
    rejectOwnershipAndParentFields(record, 'Point');
    rejectClientControlledFields(record, POINT_SEQUENCE_FIELDS, 'Point');

    if (!Object.prototype.hasOwnProperty.call(record, 'description')) {
        throw ApiError.validation('Field "description" is required.');
    }

    return {
        name: requireTrimmedString(record['name'], 'name', MAX_POINT_NAME_LENGTH),
        description: optionalString(record['description'], 'description', MAX_POINT_DESCRIPTION_LENGTH),
        lat: requireNumberInRange(record['lat'], 'lat', LATITUDE.min, LATITUDE.max),
        lng: requireNumberInRange(record['lng'], 'lng', LONGITUDE.min, LONGITUDE.max),
    };
}

/** `pointNumber` is a signed INT column; the comparison is plain numeric. */
export function sortPointsByNumber<T extends { pointNumber: number }>(points: T[]): T[] {
    return [...points].sort((left, right) => left.pointNumber - right.pointNumber);
}
