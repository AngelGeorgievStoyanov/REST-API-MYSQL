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

/** Google reCAPTCHA v2 response token; the secret key never comes from the client. */
const captchaToken = z
  .string()
  .min(1)
  .max(8192)
  .refine((value) => !/\s/.test(value));
const opaqueToken = z
  .string()
  .min(LIMITS.auth.token.min)
  .max(LIMITS.auth.token.max)
  .refine((value) => !/\s/.test(value));

export const registerSchema = z
  .object({
    email,
    password: passwordString(LIMITS.auth.password),
    firstName: trimmedString(LIMITS.auth.name),
    lastName: trimmedString(LIMITS.auth.name),
    captchaToken,
  })
  .strict();

export const verifyEmailSchema = z
  .object({
    token: opaqueToken,
  })
  .strict();

export const resendVerificationSchema = z.object({ email, captchaToken }).strict();

export const loginSchema = z
  .object({
    email,
    // Login only checks that a password was supplied and is within the input limit.
    // Complexity rules apply when creating or changing a password, not when logging in.
    password: z
      .string()
      .min(LIMITS.auth.passwordInput.min)
      .max(LIMITS.auth.passwordInput.max),
    captchaToken,
  })
  .strict();

export const updateProfileSchema = z
  .object({
    firstName: trimmedString(LIMITS.auth.name),
    lastName: trimmedString(LIMITS.auth.name),
  })
  .strict();

export const confirmPasswordSchema = z
  .object({
    password: passwordString(LIMITS.auth.passwordInput),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: passwordString(LIMITS.auth.passwordInput),
    newPassword: passwordString(LIMITS.auth.password),
  })
  .strict();

export const forgotPasswordSchema = z.object({ email, captchaToken }).strict();

export const resetPasswordSchema = z
  .object({
    token: opaqueToken,
    password: passwordString(LIMITS.auth.password),
  })
  .strict();
