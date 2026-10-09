import { z } from 'zod';
import { VALIDATION_LIMITS } from '../../constants/validation/limits';
import { optionalText, patchNumber, patchText, positiveId, requiredNumber, trimmedString } from './common.schemas';

const LIMITS = VALIDATION_LIMITS;

/**
 * `tripId` is the day the point belongs to: its value is the primary key
 * `trips.id` of that day row — never the trip-group id and never
 * `trips.dayNumber`. `pointNumber` is assigned by the server from the current
 * children of that day and is never accepted here.
 */
export const pointCreateSchema = z.object({
    tripId: positiveId,
    name: trimmedString(LIMITS.point.name),
    description: optionalText(LIMITS.point.description),
    lat: requiredNumber(LIMITS.point.lat),
    lng: requiredNumber(LIMITS.point.lng),
}).strict();

export const pointUpdateSchema = z.object({
    name: trimmedString(LIMITS.point.name).optional(),
    description: patchText(LIMITS.point.description),
    lat: patchNumber(LIMITS.point.lat),
    lng: patchNumber(LIMITS.point.lng),
}).strict()
    .refine(
        (body) => body.name !== undefined
            || body.description !== undefined
            || body.lat !== undefined
            || body.lng !== undefined,
        { message: 'Provide at least one of "name", "description", "lat" or "lng".' },
    );
