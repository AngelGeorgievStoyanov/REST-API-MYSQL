import { z } from 'zod';
import { VALIDATION_LIMITS } from '../../constants/validation/limits';
import { EMAIL_PATTERN } from '../../constants/validation/patterns';
import { passwordString, trimmedString } from './common.schemas';

const LIMITS = VALIDATION_LIMITS;

/** The only identity input of the slice; the format check runs after trimming. */
const email = trimmedString({
    min: LIMITS.auth.email.min,
    max: LIMITS.auth.email.max,
    pattern: EMAIL_PATTERN,
    patternMessage: 'must be a valid email address.',
});

/** Optional new password of a profile update: an empty value means "keep". */
const optionalPassword = z.union([z.literal(''), passwordString(LIMITS.auth.password)]).optional();

export const registerSchema = z.object({
    email,
    password: passwordString(LIMITS.auth.password),
    firstName: trimmedString(LIMITS.auth.name),
    lastName: trimmedString(LIMITS.auth.name),
}).strict();

export const verifyEmailSchema = z.object({
    token: trimmedString(LIMITS.auth.token),
}).strict();

export const resendVerificationSchema = z.object({ email }).strict();

export const loginSchema = z.object({
    email,
    // Login only compares the value, so an older password outside the policy still works.
    password: passwordString(LIMITS.auth.passwordInput),
}).strict();

export const updateProfileSchema = z.object({
    firstName: trimmedString(LIMITS.auth.name),
    lastName: trimmedString(LIMITS.auth.name),
    password: optionalPassword,
}).strict();

export const confirmPasswordSchema = z.object({
    password: passwordString(LIMITS.auth.passwordInput),
}).strict();

export const forgotPasswordSchema = z.object({ email }).strict();

export const resetPasswordSchema = z.object({
    token: trimmedString(LIMITS.auth.token),
    password: passwordString(LIMITS.auth.password),
}).strict();
