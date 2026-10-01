import { z } from 'zod';
import { VALIDATION_LIMITS } from '../../constants/validation/limits';
import { optionalText, patchNumber, patchText, positiveId, requiredNumber, trimmedString } from './common.schemas';

const LIMITS = VALIDATION_LIMITS;

/**
 * `dayId` is the API's name for the day the point belongs to; its value is the
 * `Trip.id` of that day row. `pointNumber` is assigned by the server from the
 * current children of that day and is never accepted here.
 */
export const pointCreateSchema = z.object({
    dayId: positiveId,
    title: trimmedString(LIMITS.point.title),
    description: optionalText(LIMITS.point.description),
    latitude: requiredNumber(LIMITS.point.latitude),
    longitude: requiredNumber(LIMITS.point.longitude),
}).strict();

export const pointUpdateSchema = z.object({
    title: trimmedString(LIMITS.point.title).optional(),
    description: patchText(LIMITS.point.description),
    latitude: patchNumber(LIMITS.point.latitude),
    longitude: patchNumber(LIMITS.point.longitude),
}).strict()
    .refine(
        (body) => body.title !== undefined
            || body.description !== undefined
            || body.latitude !== undefined
            || body.longitude !== undefined,
        { message: 'Provide at least one of "title", "description", "latitude" or "longitude".' },
    );
