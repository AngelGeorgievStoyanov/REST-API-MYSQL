import { z } from 'zod';
import { REPORT_TARGET_TYPE_INPUT_VALUES, SOCIAL_TARGET_TYPE_INPUT_VALUES } from '../../constants/social';
import { POSITIVE_INT_PATTERN, UUID_PATTERN } from '../../constants/validation/patterns';
import { VALIDATION_LIMITS } from '../../constants/validation/limits';

interface StringBounds {
    max: number;
    min?: number;
    pattern?: RegExp;
    patternMessage?: string;
}

interface NumberBounds {
    min: number;
    max: number;
}

/**
 * Trims the value before the boundary checks run, so surrounding whitespace can
 * neither push a value over a database width nor fail a format check.
 */
export function trimmedString(bounds: StringBounds): z.ZodType<string> {
    let bounded = bounds.min === undefined
        ? z.string().max(bounds.max)
        : z.string().min(bounds.min).max(bounds.max);

    if (bounds.pattern !== undefined) {
        bounded = bounded.regex(bounds.pattern, bounds.patternMessage);
    }

    return z.string().transform((value) => value.trim()).pipe(bounded);
}

/** Password policy: never trimmed, because whitespace is part of the secret. */
export function passwordString(bounds: NumberBounds): z.ZodType<string> {
    return z.string().min(bounds.min).max(bounds.max).refine(
        (value) => Buffer.byteLength(value, 'utf8') <= bounds.max,
        { message: `must be at most ${bounds.max} bytes long.` },
    );
}

/** Text that is part of a full write: absent or blank becomes `null`. */
export function optionalText(bounds: StringBounds): z.ZodType<string | null> {
    return z.union([trimmedString(bounds), z.null()])
        .optional()
        .transform((value) => (value === undefined || value === null || value === '' ? null : value));
}

/** Text of a partial update: absent stays absent, blank clears the column. */
export function patchText(bounds: StringBounds): z.ZodType<string | null | undefined> {
    return z.union([trimmedString(bounds), z.null()])
        .optional()
        .transform((value) => (value === undefined ? undefined : value === null || value === '' ? null : value));
}

/** Required number of a JSON body: a true JSON number within the bounds. */
export function requiredNumber(bounds: NumberBounds): z.ZodType<number> {
    return z.number().min(bounds.min).max(bounds.max);
}

/** Number of a partial JSON-body update; `null` explicitly clears the column. */
export function patchNumber(bounds: NumberBounds): z.ZodType<number | null | undefined> {
    return z.union([
        z.number().min(bounds.min).max(bounds.max),
        z.null(),
    ]).optional();
}

/** Integer input where an empty value means "not provided". */
export function optionalInt(bounds: NumberBounds): z.ZodType<number | undefined> {
    return z.preprocess(
        (value) => (value === '' || value === null ? undefined : value),
        z.coerce.number().int().min(bounds.min).max(bounds.max).optional(),
    );
}

/**
 * Required integer of a JSON body: a true JSON number that is also an integer
 * within the bounds. A missing, null, boolean, string or fractional value fails
 * the check, so it can never fall back to a default.
 */
export function requiredInt(bounds: NumberBounds): z.ZodType<number> {
    return z.number().int().min(bounds.min).max(bounds.max);
}

/** Path segment of an `INT AUTO_INCREMENT` id; it stays a string for Express. */
export const positiveIdParam = z.string()
    .regex(POSITIVE_INT_PATTERN, 'must be a positive integer.')
    .refine((value) => {
        const id = Number(value);
        return id >= VALIDATION_LIMITS.id.min && id <= VALIDATION_LIMITS.id.max;
    }, { message: 'is out of range.' });

/** `users.id` is the only string id: a canonical UUID. */
export const userIdParam = z.string().regex(UUID_PATTERN, 'must be a UUID.');

/** Route parameters, one schema per path so every id is validated. */
export const userIdParams = z.object({ userId: userIdParam }).strict();
export const tripIdOnlyParams = z.object({ tripId: positiveIdParam }).strict();
export const tripDayParams = z.object({ tripGroupId: positiveIdParam, tripId: positiveIdParam }).strict();
export const pointIdParams = z.object({ pointId: positiveIdParam }).strict();
export const pointImageParams = z.object({ pointId: positiveIdParam, imageId: positiveIdParam }).strict();
export const imageIdParams = z.object({ imageId: positiveIdParam }).strict();
export const commentIdParams = z.object({ commentId: positiveIdParam }).strict();
export const tripGroupIdParams = z.object({ tripGroupId: positiveIdParam }).strict();
export const adminReportIdParams = z.object({ reportId: positiveIdParam }).strict();

/** `:reportId` of the author-facing report removal route. */
export const reportIdParams = z.object({ reportId: positiveIdParam }).strict();

/**
 * Numeric resource id inside a JSON body: a true JSON number (an integer within
 * the id bounds). Strings, booleans, `null` and fractional values are rejected.
 */
export const positiveId = z.number()
    .int()
    .min(VALIDATION_LIMITS.id.min)
    .max(VALIDATION_LIMITS.id.max);

/**
 * Numeric resource id inside a query string. Query parameters always arrive as
 * strings, so a numeric string is coerced to a number before the same bounds
 * apply. Used only for query schemas, never for JSON bodies.
 */
export const positiveIdQuery = z.coerce.number()
    .int()
    .min(VALIDATION_LIMITS.id.min)
    .max(VALIDATION_LIMITS.id.max);

/** Client `targetType`, in any casing; `trip` is the accepted alias of `day`. */
export const targetTypeInput = z.string()
    .trim()
    .transform((value) => value.toLowerCase())
    .pipe(z.enum(SOCIAL_TARGET_TYPE_INPUT_VALUES));

/** Reports additionally accept `comment` as a target, which likes/favorites do not. */
export const reportTargetTypeInput = z.string()
    .trim()
    .transform((value) => value.toLowerCase())
    .pipe(z.enum(REPORT_TARGET_TYPE_INPUT_VALUES));

/** Complete ordered child list of one parent, as sent by the reorder endpoints. */
export function idList(bounds: NumberBounds): z.ZodType<number[]> {
    return z.array(positiveId).min(bounds.min).max(bounds.max)
        .refine((ids) => new Set(ids).size === ids.length, { message: 'must not contain duplicate ids.' });
}
