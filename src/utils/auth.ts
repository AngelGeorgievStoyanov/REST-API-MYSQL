import bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import {
    ACCESS_TOKEN_TYPE,
    MAX_EMAIL_LENGTH,
    MAX_NAME_LENGTH,
    MAX_PASSWORD_LENGTH,
    MIN_PASSWORD_LENGTH,
    OPAQUE_TOKEN_BYTES,
    PASSWORD_HASH_ROUNDS,
} from '../constants/auth';
import { ApiError } from './apiError';
import { EMAIL_PATTERN } from '../constants/validation/patterns';
import { VALIDATION_LIMITS } from '../constants/validation/limits';
import { requireTrimmedString } from './validation';

/** Cryptographically secure opaque token; only its sha256 hash is stored. */
export function generateOpaqueToken(): string {
    return randomBytes(OPAQUE_TOKEN_BYTES).toString('hex');
}

export function hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
}

/** `users.id` is a VARCHAR(36) UUID without a database default. */
export function generateUserId(): string {
    return randomUUID();
}

export function signAccessToken(userId: string, secret: string, ttlSeconds: number): string {
    return jwt.sign({ sub: userId, type: ACCESS_TOKEN_TYPE }, secret, { expiresIn: ttlSeconds });
}

/**
 * Only the access-token identity is taken from the JWT: `sub` plus the claim
 * that marks it as an access token. Role/status always come from the database.
 */
export function verifyAccessToken(token: string, secret: string): { userId: string } {
    let payload: unknown;
    try {
        payload = jwt.verify(token, secret);
    } catch {
        throw ApiError.unauthorized('The access token is invalid or expired.');
    }

    if (typeof payload !== 'object' || payload === null) {
        throw ApiError.unauthorized('The access token is invalid or expired.');
    }

    const claims = payload as Record<string, unknown>;
    const sub = claims['sub'];
    if (typeof sub !== 'string' || sub.trim() === '' || claims['type'] !== ACCESS_TOKEN_TYPE) {
        throw ApiError.unauthorized('The access token is invalid or expired.');
    }

    return { userId: sub };
}

export function hashPassword(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, PASSWORD_HASH_ROUNDS);
}

export function verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
}

/** Emails are stored lowercased so `users.email UNIQUE` cannot be bypassed by case. */
export function normalizeEmail(value: unknown): string {
    const email = requireTrimmedString(value, 'email', MAX_EMAIL_LENGTH).toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
        throw ApiError.validation('"email" must be a valid email address.');
    }
    return email;
}

export function normalizeName(value: unknown, field: string): string {
    return requireTrimmedString(value, field, MAX_NAME_LENGTH);
}

export function normalizePassword(value: unknown): string {
    if (typeof value !== 'string') throw ApiError.validation('"password" must be a string.');
    if (value.length < MIN_PASSWORD_LENGTH) {
        throw ApiError.validation(`"password" must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
    }
    if (Buffer.byteLength(value, 'utf8') > MAX_PASSWORD_LENGTH) {
        throw ApiError.validation(`"password" must be at most ${MAX_PASSWORD_LENGTH} bytes long.`);
    }
    return value;
}

export function requireTokenValue(value: unknown): string {
    return requireTrimmedString(value, 'token', VALIDATION_LIMITS.auth.token.max);
}

/** Reads one cookie without pulling in another request-parsing dependency. */
export function readCookie(cookieHeader: string | undefined, name: string): string | null {
    if (!cookieHeader) return null;

    for (const part of cookieHeader.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 0) continue;
        if (part.slice(0, separator).trim() === name) {
            const raw = part.slice(separator + 1).trim();
            return raw === '' ? null : decodeURIComponent(raw);
        }
    }

    return null;
}
