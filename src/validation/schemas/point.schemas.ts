import { z } from 'zod';
import { VALIDATION_LIMITS } from '../../constants/validation/limits';
import { optionalText, positiveId, requiredNumber, trimmedString } from './common.schemas';

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
    name: trimmedString(LIMITS.point.name),
    description: z.union([trimmedString(LIMITS.point.description), z.null()])
        .transform((value) => value === '' ? null : value),
    lat: requiredNumber(LIMITS.point.lat),
    lng: requiredNumber(LIMITS.point.lng),
}).strict();
