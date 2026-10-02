import { z } from 'zod';
import { VALIDATION_LIMITS } from '../../constants/validation/limits';
import { optionalInt, optionalText, positiveId, targetTypeInput, trimmedString } from './common.schemas';

const LIMITS = VALIDATION_LIMITS;

/** Polymorphic target of a like, a favorite or a report. */
export const socialTargetBodySchema = z.object({
    targetType: targetTypeInput,
    targetId: positiveId,
}).strict();

/** The same target, sent in the query string of the DELETE operations. */
export const socialTargetQuerySchema = z.object({
    targetType: targetTypeInput,
    targetId: positiveId,
}).strict();

export const favoriteBodySchema = z.object({ tripGroupId: positiveId }).strict();
export const favoriteQuerySchema = z.object({ tripGroupId: positiveId }).strict();

export const commentBodySchema = z.object({
    text: trimmedString(LIMITS.comment.text),
}).strict();

export const reportBodySchema = z.object({
    targetType: targetTypeInput,
    targetId: positiveId,
    reason: optionalText(LIMITS.report.reason),
}).strict();

export const commentPageQuerySchema = z.object({
    page: optionalInt(LIMITS.pagination.page),
    limit: optionalInt(LIMITS.pagination.commentLimit),
}).strict();
