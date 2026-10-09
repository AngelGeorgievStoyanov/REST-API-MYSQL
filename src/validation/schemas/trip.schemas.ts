import { z } from 'zod';
import { TRIP_SORTS } from '../../constants/trip';
import { VALIDATION_LIMITS } from '../../constants/validation/limits';
import { idList, optionalInt, optionalText, patchText, requiredInt, trimmedString } from './common.schemas';

const LIMITS = VALIDATION_LIMITS;

/** A trip is written as a whole: every metadata field is part of the write. */
export const tripWriteSchema = z.object({
    /**
     * `dayNumber` is the user-selected ordinal of the initial day row — a plain
     * positive integer within the trip-days cap, never an identifier. It is
     * required: the server never substitutes a default or `max + 1`.
     */
    dayNumber: requiredInt(LIMITS.trip.dayNumber),
    title: trimmedString(LIMITS.trip.title),
    description: optionalText(LIMITS.trip.description),
    group: trimmedString(LIMITS.trip.selectValue),
    transport: trimmedString(LIMITS.trip.selectValue),
}).strict();

/**
 * List filters. Unknown parameters are dropped instead of rejected: only the
 * declared keys can ever reach the repository, which is the whitelist that matters.
 */
export const tripListQuerySchema = z.object({
    page: optionalInt(LIMITS.pagination.page),
    limit: optionalInt(LIMITS.pagination.tripLimit),
    search: trimmedString(LIMITS.trip.search).optional(),
    group: trimmedString(LIMITS.trip.selectValue).optional(),
    transport: trimmedString(LIMITS.trip.selectValue).optional(),
    sort: z.enum(TRIP_SORTS).optional(),
}).strict();

export const dayCreateSchema = z.object({
    /**
     * `dayNumber` is required and user-selected: the ordinal of the new day row
     * within its trip group. The server never defaults it or assigns `max + 1`.
     */
    dayNumber: requiredInt(LIMITS.trip.dayNumber),
    title: optionalText(LIMITS.trip.title),
    description: optionalText(LIMITS.trip.description),
}).strict();

export const dayUpdateSchema = z.object({
    title: patchText(LIMITS.trip.title),
    description: patchText(LIMITS.trip.description),
}).strict()
    .refine((body) => body.title !== undefined || body.description !== undefined, {
        message: 'Provide at least one of "title" or "description".',
    });

export const dayReorderSchema = z.object({
    // Each entry is the primary key `trips.id` of one day row of the trip group —
    // never a `dayNumber` and never a `trip_groups.id`.
    tripIds: idList({ min: 1, max: LIMITS.arrays.reorder.max }),
}).strict();

export const pointReorderSchema = z.object({
    pointIds: idList({ min: 0, max: LIMITS.arrays.reorder.max }),
}).strict();
