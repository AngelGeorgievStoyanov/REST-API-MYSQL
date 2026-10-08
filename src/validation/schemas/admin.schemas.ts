import { z } from 'zod';
import { ASSIGNABLE_USER_ROLES, ASSIGNABLE_USER_STATUSES } from '../../constants/admin';
import { VALIDATION_LIMITS } from '../../constants/validation/limits';
import { EMAIL_PATTERN } from '../../constants/validation/patterns';
import { idList, passwordString, trimmedString } from './common.schemas';

const LIMITS = VALIDATION_LIMITS;
const adminEmail = trimmedString({
    min: LIMITS.auth.email.min,
    max: LIMITS.auth.email.max,
    pattern: EMAIL_PATTERN,
    patternMessage: 'must be a valid email address.',
});

/**
 * Partial update of another account. Identity, credentials and verification state
 * are not part of the schema, so they cannot be assigned through it.
 * `role`, `status`, and `password` are accepted by the schema but filtered
 * server-side: managers cannot assign them.
 */
export const adminUserUpdateSchema = z.object({
    firstName: trimmedString(LIMITS.auth.name).optional(),
    lastName: trimmedString(LIMITS.auth.name).optional(),
    email: adminEmail.optional(),
    role: z.enum(ASSIGNABLE_USER_ROLES).optional(),
    status: z.enum(ASSIGNABLE_USER_STATUSES).optional(),
    emailVerified: z.boolean().optional(),
    password: passwordString(LIMITS.auth.password).optional(),
}).strict()
    .refine((body) => Object.values(body).some((value) => value !== undefined), {
        message: 'Provide at least one of "firstName", "lastName", "email", "role", "status", "emailVerified", or "password".',
    });

export const failedLogDeleteSchema = z.object({
    ids: idList(LIMITS.arrays.failedLogIds),
}).strict();

const pageNumber = z.union([
    z.string().regex(/^\d+$/, 'must be a positive integer.').transform(Number),
    z.number(),
]).pipe(z.number().int().min(1).max(10000));

const pageSizeNumber = z.union([
    z.string().regex(/^\d+$/, 'must be a positive integer.').transform(Number),
    z.number(),
]).pipe(z.number().int().min(1).max(100));

const adminPageNumber = pageNumber
    .optional();

const adminPageSize = pageSizeNumber
    .optional();

export const adminPaginationQuerySchema = z.object({
    page: adminPageNumber,
    pageSize: adminPageSize,
}).strict().transform(({ page, pageSize }) => ({
    page: page ?? 1,
    pageSize: pageSize ?? 50,
}));
