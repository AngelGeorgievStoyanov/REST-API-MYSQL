import { Prisma, UserStatus } from '@prisma/client';
import type { AuthConfig } from '../config/auth';
import {
    ABSENT_USER_PASSWORD_HASH,
    EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
    PASSWORD_RESET_TOKEN_TTL_SECONDS,
} from '../constants/auth';
import { VALIDATION_LIMITS } from '../constants/validation/limits';
import type { AuthActor, AuthSessionDto, AuthUserDto, AuthUserResponse, MessageResponse } from '../model/auth';
import { ImageDto } from '../model/image';
import { ApiError } from '../utils/apiError';
import {
    generateOpaqueToken,
    generateUserId,
    hashPassword,
    hashToken,
    normalizeEmail,
    normalizeName,
    normalizePassword,
    requireTokenValue,
    signAccessToken,
    verifyPassword,
} from '../utils/auth';
import { getErrorMessage } from '../utils/error';
import { toImageDto } from '../utils/image';
import { asRecord, requireTrimmedString } from '../utils/validation';
import type { AuthUserRow } from '../repositories/authUserRepository';
import { AuthUserRepository } from '../repositories/authUserRepository';
import { EmailVerificationTokenRepository } from '../repositories/emailVerificationTokenRepository';
import { FailedLogRepository } from '../repositories/failedLogRepository';
import { ImageRepository, ImageRow } from '../repositories/imageRepository';
import { AuthMailer } from './authMailer';
import { PasswordResetTokenRepository } from '../repositories/passwordResetTokenRepository';
import { RefreshTokenRepository } from '../repositories/refreshTokenRepository';
import { ImageFileStorage } from '../storage/imageFileStorage';

/** Session plus the raw refresh token the HTTP layer turns into a cookie. */
export interface AuthSessionResult {
    session: AuthSessionDto;
    refreshToken: string;
    refreshTokenExpiresAt: Date;
}

/**
 * HTTP facts of one login attempt. They are observability data for the
 * failed-log table only and are never part of the authentication decision.
 */
export interface LoginContext {
    ip: string;
    userAgent: string;
}

export class AuthService {
    constructor(
        private readonly users: AuthUserRepository,
        private readonly verificationTokens: EmailVerificationTokenRepository,
        private readonly resetTokens: PasswordResetTokenRepository,
        private readonly refreshTokens: RefreshTokenRepository,
        private readonly mailer: AuthMailer,
        private readonly failedLogs: FailedLogRepository,
        private readonly images: ImageRepository,
        private readonly imageStorage: ImageFileStorage,
        private readonly config: AuthConfig,
    ) { }

    async register(body: unknown): Promise<MessageResponse> {
        const record = asRecord(body, 'Request body');
        const email = normalizeEmail(record['email']);
        const password = normalizePassword(record['password']);
        const firstName = normalizeName(record['firstName'], 'firstName');
        const lastName = normalizeName(record['lastName'], 'lastName');
        const hashedPassword = await hashPassword(password);

        if (await this.users.findByEmail(email)) {
            return registrationAccepted();
        }

        let user: AuthUserRow;
        try {
            user = await this.users.create({
                id: generateUserId(),
                email,
                firstName,
                lastName,
                hashedPassword,
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                return registrationAccepted();
            }
            throw error;
        }

        await this.issueVerificationToken(user, true);
        return registrationAccepted();
    }

    async verifyEmail(body: unknown): Promise<AuthUserResponse> {
        const record = asRecord(body, 'Request body');
        const row = await this.verificationTokens.findActiveByHash(hashToken(requireTokenValue(record['token'])));
        if (!row) throw ApiError.tokenInvalid('The verification token is unknown.');
        if (row.usedAt !== null) throw ApiError.tokenInvalid('The verification token was already used.');

        const now = new Date();
        if (row.expiresAt.getTime() <= now.getTime()) throw ApiError.tokenExpired('The verification token has expired.');

        const user = await this.users.findById(row.userId);
        if (!user) throw ApiError.tokenInvalid('The verification token is unknown.');

        const verified = user.emailVerifiedAt === null ? await this.users.markEmailVerified(user.id, now) : user;
        await this.verificationTokens.markUsed(row.id, now);

        return { user: toAuthUserDto(verified) };
    }

    /** Unknown and already verified accounts answer exactly like a real resend. */
    async resendVerification(body: unknown): Promise<MessageResponse> {
        const record = asRecord(body, 'Request body');
        const email = normalizeEmail(record['email']);
        const user = await this.users.findByEmail(email);
        if (user && user.emailVerifiedAt === null) await this.issueVerificationToken(user);

        return { message: 'If the account exists and is not verified yet, a new verification email was sent.' };
    }

    async login(body: unknown, context: LoginContext): Promise<AuthSessionResult> {
        const record = asRecord(body, 'Request body');
        const email = normalizeEmail(record['email']);
        const password = requireTrimmedString(record['password'], 'password', VALIDATION_LIMITS.auth.passwordInput.max);

        const user = await this.users.findByEmail(email);
        const passwordMatches = await verifyPassword(password, user?.hashedPassword ?? ABSENT_USER_PASSWORD_HASH);
        if (!user || !passwordMatches) {
            await this.recordFailedLogin(email, context);
            throw ApiError.invalidCredentials();
        }

        this.assertAccountUsable(user);
        await this.users.touchLogin(user.id, new Date());

        return this.issueSession(user);
    }

    /** A failed attempt is recorded best effort: observability must never change the answer. */
    private async recordFailedLogin(email: string, context: LoginContext): Promise<void> {
        try {
            await this.failedLogs.create({
                date: new Date().toISOString(),
                email,
                ip: context.ip,
                userAgent: context.userAgent,
                countryCode: null,
                countryName: null,
                city: null,
                postal: null,
                latitude: null,
                longitude: null,
                state: null,
            });
        } catch (error) {
            console.log(`[auth] failed-login record failed: ${getErrorMessage(error)}`);
        }
    }

    async me(actorId: string): Promise<AuthUserResponse> {
        const user = await this.users.findById(actorId);
        if (!user) throw ApiError.accountGone();

        this.assertAccountUsable(user);
        return { user: toAuthUserDto(user) };
    }

    /**
     * Actor of an access token for the shared v1 boundary: the database row is
     * the authority for existence and account state, and its role — never the
     * token claims — is what authorization sees.
     */
    async resolveActor(actorId: string): Promise<AuthActor> {
        const user = await this.users.findById(actorId);
        if (!user) throw ApiError.accountGone();

        this.assertAccountUsable(user);
        return { id: user.id, role: user.role };
    }

    async refresh(rawRefreshToken: string | null): Promise<AuthSessionResult> {
        if (!rawRefreshToken) throw ApiError.refreshTokenInvalid('No refresh session was provided.');

        const row = await this.refreshTokens.findByHash(hashToken(rawRefreshToken));
        const now = new Date();
        if (!row) throw ApiError.refreshTokenInvalid();

        if (row.revokedAt !== null) {
            // A spent token came back: the session chain is compromised, so every
            // active refresh session of that account is revoked.
            await this.refreshTokens.revokeAllForUser(row.userId, now);
            throw ApiError.refreshTokenReused();
        }
        if (row.expiresAt.getTime() <= now.getTime()) throw ApiError.refreshTokenInvalid('The refresh session has expired.');

        const user = await this.users.findById(row.userId);
        if (!user) {
            await this.refreshTokens.revoke(row.id, now);
            throw ApiError.refreshTokenInvalid();
        }

        try {
            this.assertAccountUsable(user);
        } catch (error) {
            await this.refreshTokens.revoke(row.id, now);
            throw error;
        }

        await this.refreshTokens.revoke(row.id, now);
        return this.issueSession(user);
    }

    /** Idempotent by design: an unknown or already revoked session still logs out. */
    async logout(rawRefreshToken: string | null): Promise<MessageResponse> {
        if (rawRefreshToken) {
            const row = await this.refreshTokens.findByHash(hashToken(rawRefreshToken));
            if (row && row.revokedAt === null) await this.refreshTokens.revoke(row.id, new Date());
        }

        return { message: 'Logged out.' };
    }

    async forgotPassword(body: unknown): Promise<MessageResponse> {
        const record = asRecord(body, 'Request body');
        const email = normalizeEmail(record['email']);
        const user = await this.users.findByEmail(email);

        if (user) {
            const now = new Date();
            const rawToken = generateOpaqueToken();
            await this.resetTokens.invalidateOutstanding(user.id, now);
            await this.resetTokens.create({
                userId: user.id,
                tokenHash: hashToken(rawToken),
                expiresAt: new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_SECONDS * 1000),
            });
            await this.mailer.sendPasswordResetEmail(user.email, rawToken);
        }

        return { message: 'If the account exists, a password reset email was sent.' };
    }

    async resetPassword(body: unknown): Promise<MessageResponse> {
        const record = asRecord(body, 'Request body');
        const rawToken = requireTokenValue(record['token']);
        const password = normalizePassword(record['password']);

        const row = await this.resetTokens.findActiveByHash(hashToken(rawToken));
        if (!row) throw ApiError.tokenInvalid('The reset token is unknown.');
        if (row.usedAt !== null) throw ApiError.tokenInvalid('The reset token was already used.');

        const now = new Date();
        if (row.expiresAt.getTime() <= now.getTime()) throw ApiError.tokenExpired('The reset token has expired.');

        const user = await this.users.findById(row.userId);
        if (!user) throw ApiError.tokenInvalid('The reset token is unknown.');

        await this.users.updatePassword(user.id, await hashPassword(password));
        await this.resetTokens.markUsed(row.id, now);
        // Long-lived sessions must not survive a password change.
        await this.refreshTokens.revokeAllForUser(user.id, now);

        return { message: 'The password was changed. Please sign in with the new password.' };
    }

    /** Re-authentication gate: only the account's own password is checked. */
    async confirmPassword(actorId: string, body: unknown): Promise<{ valid: boolean }> {
        const user = await this.users.findById(actorId);
        if (!user) throw ApiError.accountGone();

        const record = asRecord(body, 'Request body');
        const password = typeof record['password'] === 'string' ? record['password'] : '';

        return { valid: await verifyPassword(password, user.hashedPassword) };
    }

    /** The owner updates the profile fields; a new password ends the other sessions. */
    async updateProfile(actorId: string, body: unknown): Promise<AuthUserResponse> {
        const user = await this.users.findById(actorId);
        if (!user) throw ApiError.accountGone();

        const record = asRecord(body, 'Request body');
        const firstName = normalizeName(record['firstName'], 'firstName');
        const lastName = normalizeName(record['lastName'], 'lastName');
        return { user: toAuthUserDto(await this.users.updateProfile(actorId, { firstName, lastName })) };
    }

    async changePassword(actorId: string, body: unknown): Promise<void> {
        const user = await this.users.findById(actorId);
        if (!user) throw ApiError.accountGone();

        const record = asRecord(body, 'Request body');
        const currentPassword = record['currentPassword'];
        if (typeof currentPassword !== 'string'
            || currentPassword.length === 0
            || currentPassword.length > VALIDATION_LIMITS.auth.passwordInput.max) {
            throw ApiError.validation('"currentPassword" must be a valid password string.');
        }
        const newPassword = normalizePassword(record['newPassword']);

        if (!(await verifyPassword(currentPassword, user.hashedPassword))) {
            throw ApiError.invalidCredentials('Current password is incorrect.');
        }

        await this.users.updatePassword(actorId, await hashPassword(newPassword));
        await this.refreshTokens.revokeAllForUser(actorId, new Date());
    }

    async getProfileImage(actorId: string): Promise<ImageDto | null> {
        const image = await this.images.findProfileImage(actorId);

        return image ? toImageDto(image) : null;
    }

    /** The replaced file is removed only once the new row exists. */
    async setProfileImage(actorId: string, filePath: string): Promise<ImageDto> {
        const user = await this.users.findById(actorId);
        if (!user) throw ApiError.accountGone();

        const previous = await this.images.findProfileImage(actorId);
        let created: ImageRow;
        try {
            created = await this.images.createProfileImage(actorId, filePath);
        } catch (error) {
            try {
                await this.imageStorage.remove(filePath);
            } catch (cleanupError) {
                console.log(`[images] could not remove failed profile upload "${filePath}": ${getErrorMessage(cleanupError)}`);
            }
            throw error;
        }

        if (previous) {
            await this.imageStorage.remove(previous.filePath);
            await this.images.delete(previous.id);
        }

        return toImageDto(created);
    }

    async removeProfileImage(actorId: string): Promise<void> {
        const current = await this.images.findProfileImage(actorId);
        if (!current) throw ApiError.notFound('This account has no profile image.');

        // Storage first: the row is only dropped once the file is gone.
        await this.imageStorage.remove(current.filePath);
        await this.images.delete(current.id);
    }

    private async issueVerificationToken(user: AuthUserRow, deliverInBackground = false): Promise<void> {
        const now = new Date();
        const rawToken = generateOpaqueToken();
        await this.verificationTokens.invalidateOutstanding(user.id, now);
        await this.verificationTokens.create({
            userId: user.id,
            tokenHash: hashToken(rawToken),
            expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TOKEN_TTL_SECONDS * 1000),
        });
        if (deliverInBackground) {
            void this.mailer.sendVerificationEmail(user.email, rawToken).catch((error: unknown) => {
                console.log(`[auth] verification email delivery failed: ${getErrorMessage(error)}`);
            });
            return;
        }

        await this.mailer.sendVerificationEmail(user.email, rawToken);
    }

    private async issueSession(user: AuthUserRow): Promise<AuthSessionResult> {
        const rawRefreshToken = generateOpaqueToken();
        const refreshTokenExpiresAt = new Date(Date.now() + this.config.refreshTokenTtlSeconds * 1000);
        await this.refreshTokens.create({
            userId: user.id,
            tokenHash: hashToken(rawRefreshToken),
            expiresAt: refreshTokenExpiresAt,
        });

        return {
            session: {
                accessToken: signAccessToken(user.id, this.config.accessTokenSecret, this.config.accessTokenTtlSeconds),
                tokenType: 'Bearer',
                expiresIn: this.config.accessTokenTtlSeconds,
                user: toAuthUserDto(user),
            },
            refreshToken: rawRefreshToken,
            refreshTokenExpiresAt,
        };
    }

    /** The database is the only authority on whether an account may be used. */
    private assertAccountUsable(user: AuthUserRow): void {
        if (user.status === UserStatus.SUSPENDED) throw ApiError.accountSuspended();
        if (user.status === UserStatus.DEACTIVATED) throw ApiError.accountDeactivated();
        if (user.status !== UserStatus.ACTIVE || user.emailVerifiedAt === null) throw ApiError.emailNotVerified();
    }
}

function registrationAccepted(): MessageResponse {
    return { message: 'If the address can be registered, verification instructions will be sent.' };
}

export function toAuthUserDto(user: AuthUserRow): AuthUserDto {
    return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerifiedAt !== null,
    };
}
