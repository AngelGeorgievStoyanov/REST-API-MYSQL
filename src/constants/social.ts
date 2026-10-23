export const SOCIAL_TARGET_TYPE = {
    /** A whole trip, i.e. one `trip_groups` row. */
    TRIP_GROUP: 'tripGroup',
    /** One day of a trip, i.e. one `trips` row. */
    DAY: 'trip',
    POINT: 'point',
    IMAGE: 'image',
    COMMENT: 'comment',
} as const;

/**
 * Lower-case `targetType` values accepted from a client, including the two
 * spellings of a day (`day` in the API wording, `trip` in the database).
 */
export const SOCIAL_TARGET_TYPE_INPUT_VALUES = ['tripgroup', 'day', 'trip', 'point', 'image', 'comment'] as const;

/** Canonical target type, derived from the live values so no model import is needed. */
type CanonicalTargetType = (typeof SOCIAL_TARGET_TYPE)[keyof typeof SOCIAL_TARGET_TYPE];

/** Maps an accepted input value to the canonical target type. */
export const SOCIAL_TARGET_TYPE_INPUT: Record<
    (typeof SOCIAL_TARGET_TYPE_INPUT_VALUES)[number],
    CanonicalTargetType
> = {
    tripgroup: SOCIAL_TARGET_TYPE.TRIP_GROUP,
    day: SOCIAL_TARGET_TYPE.DAY,
    trip: SOCIAL_TARGET_TYPE.DAY,
    point: SOCIAL_TARGET_TYPE.POINT,
    image: SOCIAL_TARGET_TYPE.IMAGE,
    comment: SOCIAL_TARGET_TYPE.COMMENT,
};

export const REPORT_TARGET_TYPE_INPUT_VALUES = SOCIAL_TARGET_TYPE_INPUT_VALUES;
export const COMMENT_TARGET_TYPE = 'comment' as const;

/** `targetType` values as reports and the admin report queue expose them. */
export const REPORT_TARGET_TYPE_VALUES = ['tripGroup', 'trip', 'point', 'image', COMMENT_TARGET_TYPE] as const;

/** Longer than `comments.comment` VARCHAR(1000). */
export const MAX_COMMENT_LENGTH = 1000;

/** Longer than `comments.nameAuthor` VARCHAR(45). */
export const MAX_COMMENT_AUTHOR_LENGTH = 45;

/** Longer than `reports.reason` VARCHAR(1000). */
export const MAX_REPORT_REASON_LENGTH = 1000;

export const DEFAULT_COMMENT_PAGE_SIZE = 10;
export const MAX_COMMENT_PAGE_SIZE = 100;
