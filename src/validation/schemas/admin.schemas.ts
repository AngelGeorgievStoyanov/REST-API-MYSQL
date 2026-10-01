import { z } from 'zod';
import { ASSIGNABLE_USER_ROLES, ASSIGNABLE_USER_STATUSES } from '../../constants/admin';
import { VALIDATION_LIMITS } from '../../constants/validation/limits';
import { idList, trimmedString } from './common.schemas';

const LIMITS = VALIDATION_LIMITS;

/**
 * Partial update of another account. Identity, credentials and verification state
 * are not part of the schema, so they cannot be assigned through it.
 */
export const adminUserUpdateSchema = z.object({
    firstName: trimmedString(LIMITS.auth.name).optional(),
    lastName: trimmedString(LIMITS.auth.name).optional(),
    role: z.enum(ASSIGNABLE_USER_ROLES).optional(),
    status: z.enum(ASSIGNABLE_USER_STATUSES).optional(),
}).strict()
    .refine((body) => Object.values(body).some((value) => value !== undefined), {
        message: 'Provide at least one of "firstName", "lastName", "role", "status".',
    });

export const failedLogDeleteSchema = z.object({
    ids: idList(LIMITS.arrays.failedLogIds),
}).strict();
