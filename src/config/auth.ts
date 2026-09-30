import { CONNECTIONURL } from '../utils/baseUrl';

export type CookieSameSite = 'lax' | 'strict' | 'none';
export type AuthMailTransport = 'smtp' | 'file';

export interface AuthRateLimitConfig {
    windowSeconds: number;
    /** Attempts per window for login/register/refresh/reset-password. */
    max: number;
    /** Attempts per window for the email sending endpoints (resend/forgot). */
    emailMax: number;
}

export interface AuthConfig {
    /** HMAC secret of the access JWT; always required, never defaulted in code. */
    accessTokenSecret: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
    /** Frontend base URL used to build the verification/reset links. */
    appUrl: string;
    /** Frontend routes the emailed links point at. */
    verifyEmailPath: string;
    passwordResetPath: string;
    /** `Secure` cookie flag; true in production unless explicitly overridden. */
    cookieSecure: boolean;
    cookieSameSite: CookieSameSite;
    /** `smtp` sends through the existing mail helper, `file` writes the dev mail. */
    mailTransport: AuthMailTransport;
    rateLimit: AuthRateLimitConfig;
}

export type AuthEnvironmentSource = Record<string, string | undefined>;

const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const DEFAULT_RATE_LIMIT_MAX = 10;
const DEFAULT_RATE_LIMIT_EMAIL_MAX = 5;

function isProduction(env: AuthEnvironmentSource): boolean {
    return env.NODE_ENV === 'production';
}

function positiveSeconds(env: AuthEnvironmentSource, name: string, fallback: number): number {
    const raw = env[name]?.trim();
    if (raw === undefined || raw === '') return fallback;

    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer number of seconds.`);
    }
    return value;
}

/**
 * Reads the Auth environment. The access-token secret has no code fallback:
 * without it the application refuses to start instead of signing tokens with a
 * value that ships with the source.
 */
export function loadAuthConfig(env: AuthEnvironmentSource = process.env): AuthConfig {
    const production = isProduction(env);
    const secret = env.JWT_ACCESS_SECRET?.trim() || '';
    if (secret === '') {
        throw new Error('JWT_ACCESS_SECRET is required to start the API (v1 authentication).');
    }

    const emailUser = env.EMAIL_USER?.trim() || '';
    const emailPassword = env.PASS_EMAIL?.trim() || '';
    const configuredTransport = env.AUTH_MAIL_TRANSPORT?.trim().toLowerCase();
    const mailTransport: AuthMailTransport = configuredTransport === 'file'
        ? 'file'
        : configuredTransport === 'smtp'
            ? 'smtp'
            // Without SMTP credentials a development run writes the mail to disk
            // instead of failing the whole registration.
            : (emailUser !== '' && emailPassword !== '' ? 'smtp' : (production ? 'smtp' : 'file'));

    const sameSite = env.COOKIE_SAME_SITE?.trim().toLowerCase();
    const verifyEmailPath = env.AUTH_VERIFY_EMAIL_PATH?.trim() || '/verify-email';
    const passwordResetPath = env.AUTH_PASSWORD_RESET_PATH?.trim() || '/reset-password';

    return {
        accessTokenSecret: secret,
        accessTokenTtlSeconds: positiveSeconds(env, 'ACCESS_TOKEN_EXPIRES_IN', DEFAULT_ACCESS_TOKEN_TTL_SECONDS),
        refreshTokenTtlSeconds: positiveSeconds(env, 'REFRESH_TOKEN_EXPIRES_IN', DEFAULT_REFRESH_TOKEN_TTL_SECONDS),
        appUrl: (env.AUTH_APP_URL?.trim() || CONNECTIONURL).replace(/\/+$/, ''),
        verifyEmailPath: verifyEmailPath.startsWith('/') ? verifyEmailPath : `/${verifyEmailPath}`,
        passwordResetPath: passwordResetPath.startsWith('/') ? passwordResetPath : `/${passwordResetPath}`,
        cookieSecure: env.COOKIE_SECURE !== undefined
            ? env.COOKIE_SECURE.trim().toLowerCase() === 'true'
            : production,
        cookieSameSite: sameSite === 'strict' || sameSite === 'none' || sameSite === 'lax'
            ? sameSite
            : (production ? 'none' : 'lax'),
        mailTransport,
        rateLimit: {
            windowSeconds: positiveSeconds(env, 'AUTH_RATE_LIMIT_WINDOW_SECONDS', DEFAULT_RATE_LIMIT_WINDOW_SECONDS),
            max: positiveSeconds(env, 'AUTH_RATE_LIMIT_MAX', DEFAULT_RATE_LIMIT_MAX),
            emailMax: positiveSeconds(env, 'AUTH_RATE_LIMIT_EMAIL_MAX', DEFAULT_RATE_LIMIT_EMAIL_MAX),
        },
    };
}

/** Process-wide Auth configuration; a missing secret or bad value fails here. */
export const authConfig: AuthConfig = loadAuthConfig();
