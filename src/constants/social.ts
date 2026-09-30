/**
 * `target_types.name` values of the polymorphic social targets, as they exist in
 * the live database. The table also holds `comment`, which the Phase 3 contract
 * does not expose as a target, so it is not part of this list.
 */
export const SOCIAL_TARGET_TYPE = {
    /** A whole trip, i.e. one `trip_groups` row. */
    TRIP_GROUP: 'tripGroup',
    /** One day of a trip, i.e. one `trips` row. */
    DAY: 'trip',
    POINT: 'point',
    IMAGE: 'image',
} as const;

/** Longer than `comments.comment` VARCHAR(1000). */
export const MAX_COMMENT_LENGTH = 1000;

/** Longer than `comments.nameAuthor` VARCHAR(45). */
export const MAX_COMMENT_AUTHOR_LENGTH = 45;

/** Longer than `reports.reason` VARCHAR(1000). */
export const MAX_REPORT_REASON_LENGTH = 1000;

export const DEFAULT_COMMENT_PAGE_SIZE = 10;
export const MAX_COMMENT_PAGE_SIZE = 100;
