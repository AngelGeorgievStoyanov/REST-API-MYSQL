import { z } from 'zod';
import { VALIDATION_LIMITS } from '../../constants/validation/limits';
import { optionalInt, optionalText, positiveId, positiveIdQuery, reportTargetTypeInput, targetTypeInput, trimmedString } from './common.schemas';

const LIMITS = VALIDATION_LIMITS;

/** Polymorphic target of a like, a favorite or a report. */
export const socialTargetBodySchema = z.object({
    targetType: targetTypeInput,
    targetId: positiveId,
}).strict();

/** The same target, sent in the query string of the DELETE operations (query values arrive as strings). */
export const socialTargetQuerySchema = z.object({
    targetType: targetTypeInput,
    targetId: positiveIdQuery,
}).strict();

const favoriteTargetBodySchema = z.object({ targetType: targetTypeInput, targetId: positiveId }).strict();
const favoriteTargetQuerySchema = z.object({ targetType: targetTypeInput, targetId: positiveIdQuery }).strict();
export const favoriteBodySchema = z.union([z.object({ tripGroupId: positiveId }).strict(), favoriteTargetBodySchema]);
export const favoriteQuerySchema = z.union([z.object({ tripGroupId: positiveIdQuery }).strict(), favoriteTargetQuerySchema]);

export const commentBodySchema = z.object({
    comment: trimmedString(LIMITS.comment.comment),
}).strict();
export const replyCreateBodySchema = commentBodySchema;

export const reportBodySchema = z.object({
    targetType: reportTargetTypeInput,
    targetId: positiveId,
    reason: optionalText(LIMITS.report.reason),
}).strict();

/**
 * The same report target, sent in the query string of the DELETE operation
 * (query values arrive as strings).
 */
export const reportTargetQuerySchema = z.object({
    targetType: reportTargetTypeInput,
    targetId: positiveIdQuery,
}).strict();

/**
 * Validated shape of a report target query string. `targetType` still carries
 * the client spelling here; the parser normalizes it to the canonical target
 * type of the domain model.
 */
export type ReportTargetQuery = z.infer<typeof reportTargetQuerySchema>;

export const commentPageQuerySchema = z.object({
    page: optionalInt(LIMITS.pagination.page),
    limit: optionalInt(LIMITS.pagination.commentLimit),
}).strict();
