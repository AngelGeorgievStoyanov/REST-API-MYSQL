import { MAX_POINT_DESCRIPTION_LENGTH, MAX_POINT_NAME_LENGTH } from '../constants/trip';
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
const EDITABLE_POINT_FIELDS = ['title', 'description', 'latitude', 'longitude'];

export function parsePointCreateBody(body: unknown): PointCreateRequest {
    const record = asRecord(body, 'Request body');
    rejectClientControlledFields(record, [...CLIENT_OWNERSHIP_FIELDS, 'tripId', ...POINT_SEQUENCE_FIELDS], 'Point');

    return {
        dayId: parsePositiveId(record.dayId, 'dayId'),
        title: requireTrimmedString(record.title, 'title', MAX_POINT_NAME_LENGTH),
        description: optionalString(record.description, 'description', MAX_POINT_DESCRIPTION_LENGTH),
        latitude: requireNumberInRange(record.latitude, 'latitude', -90, 90),
        longitude: requireNumberInRange(record.longitude, 'longitude', -180, 180),
    };
}

export function parsePointUpdateBody(body: unknown): PointUpdateRequest {
    const record = asRecord(body, 'Request body');
    rejectOwnershipAndParentFields(record, 'Point');
    rejectClientControlledFields(record, POINT_SEQUENCE_FIELDS, 'Point');

    const request: PointUpdateRequest = {};
    if (record.title !== undefined) request.title = requireTrimmedString(record.title, 'title', MAX_POINT_NAME_LENGTH);
    if (record.description !== undefined) {
        request.description = optionalString(record.description, 'description', MAX_POINT_DESCRIPTION_LENGTH);
    }
    if (record.latitude !== undefined) {
        request.latitude = optionalNumberInRange(record.latitude, 'latitude', -90, 90);
    }
    if (record.longitude !== undefined) {
        request.longitude = optionalNumberInRange(record.longitude, 'longitude', -180, 180);
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
