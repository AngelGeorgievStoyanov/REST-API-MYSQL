import {
    DEFAULT_COMMENT_PAGE_SIZE,
    MAX_COMMENT_LENGTH,
    MAX_COMMENT_PAGE_SIZE,
    MAX_REPORT_REASON_LENGTH,
    SOCIAL_TARGET_TYPE,
} from '../constants/social';
import { CommentCreateRequest, CommentUpdateRequest } from '../model/comment';
import { SocialTargetRef, SocialTargetType } from '../model/social';
import { ApiError } from './apiError';
import { firstValue } from './utils';
import { asRecord, optionalPositiveInt, optionalString, parsePositiveId, requireTrimmedString } from './validation';

/**
 * Accepted `targetType` values of the social request bodies. `day` is the API
 * wording for a `trips` row; `trip` is the name of that row in `target_types`.
 */
const TARGET_TYPE_ALIASES: Record<string, SocialTargetType> = {
    tripgroup: SOCIAL_TARGET_TYPE.TRIP_GROUP,
    day: SOCIAL_TARGET_TYPE.DAY,
    trip: SOCIAL_TARGET_TYPE.DAY,
    point: SOCIAL_TARGET_TYPE.POINT,
    image: SOCIAL_TARGET_TYPE.IMAGE,
};

const ACCEPTED_TARGET_TYPES = 'tripGroup, day, point, image';

function parseTargetType(value: unknown, field: string): SocialTargetType {
    const raw = firstValue(value);
    if (typeof raw !== 'string') throw ApiError.validation(`"${field}" is required.`);

    const targetType = TARGET_TYPE_ALIASES[raw.trim().toLowerCase()];
    if (!targetType) throw ApiError.validation(`"${field}" must be one of: ${ACCEPTED_TARGET_TYPES}.`);

    return targetType;
}

function recordOf(value: unknown, what: string): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : what === 'Request body'
            ? asRecord(value, what)
            : {};
}

/** Target of a mutation body: `{ targetType, targetId }`. */
export function parseSocialTargetBody(body: unknown): SocialTargetRef {
    const record = recordOf(body, 'Request body');

    return {
        targetType: parseTargetType(record.targetType, 'targetType'),
        targetId: parsePositiveId(record.targetId, 'targetId'),
    };
}

/** Target of a mutation query string, used by the DELETE operations. */
export function parseSocialTargetQuery(query: unknown): SocialTargetRef {
    const record = recordOf(query, 'Query');

    return {
        targetType: parseTargetType(record.targetType, 'targetType'),
        targetId: parsePositiveId(record.targetId, 'targetId'),
    };
}

/** Favorites are addressed by trip group id, in a body or in a query string. */
export function parseTripGroupId(value: unknown): number {
    const record = recordOf(value, 'Request body');

    return parsePositiveId(record.tripGroupId, 'tripGroupId');
}

export function parseCommentCreateBody(body: unknown): CommentCreateRequest {
    const record = asRecord(body, 'Request body');

    return { text: requireTrimmedString(record.text, 'text', MAX_COMMENT_LENGTH) };
}

export function parseCommentUpdateBody(body: unknown): CommentUpdateRequest {
    const record = asRecord(body, 'Request body');

    return { text: requireTrimmedString(record.text, 'text', MAX_COMMENT_LENGTH) };
}

export function parseReportBody(body: unknown): { reason: string | null } {
    const record = asRecord(body, 'Request body');

    return { reason: optionalString(record.reason, 'reason', MAX_REPORT_REASON_LENGTH) };
}

function pageValue(value: unknown, field: string, fallback: number, max?: number): number {
    const parsed = optionalPositiveInt(firstValue(value), field);
    if (parsed === null) return fallback;
    if (max !== undefined && parsed > max) {
        throw ApiError.validation(`"${field}" must be at most ${max}.`);
    }
    return parsed;
}

export function parseCommentPageQuery(rawQuery: unknown): { page: number; limit: number } {
    const query = typeof rawQuery === 'object' && rawQuery !== null ? rawQuery as Record<string, unknown> : {};

    return {
        page: pageValue(query.page, 'page', 1),
        limit: pageValue(query.limit, 'limit', DEFAULT_COMMENT_PAGE_SIZE, MAX_COMMENT_PAGE_SIZE),
    };
}

const SOCIAL_TARGET_TYPE_VALUES: string[] = Object.values(SOCIAL_TARGET_TYPE);

export function isSocialTargetType(value: string): value is SocialTargetType {
    return SOCIAL_TARGET_TYPE_VALUES.includes(value);
}

/** Map key of one polymorphic target inside a batch aggregate result. */
export function socialTargetKey(targetTypeId: number, targetId: number): string {
    return `${targetTypeId}:${targetId}`;
}
