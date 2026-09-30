import { UserStatus } from '@prisma/client';
import type { AuthConfig } from '../config/auth';
import {
    EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
    PASSWORD_RESET_TOKEN_TTL_SECONDS,
} from '../constants/auth';
import type { AuthActor, AuthSessionDto, AuthUserDto, AuthUserResponse, MessageResponse } from '../model/auth';
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
import { asRecord, requireTrimmedString } from '../utils/validation';
import type { AuthUserRow } from '../repositories/authUserRepository';
import { AuthUserRepository } from '../repositories/authUserRepository';
import { EmailVerificationTokenRepository } from '../repositories/emailVerificationTokenRepository';
import { AuthMailer } from './authMailer';
import { PasswordResetTokenRepository } from '../repositories/passwordResetTokenRepository';
import { RefreshTokenRepository } from '../repositories/refreshTokenRepository';

/** Session plus the raw refresh token the HTTP layer turns into a cookie. */
export interface AuthSessionResult {
    session: AuthSessionDto;
    refreshToken: string;
    refreshTokenExpiresAt: Date;
}

/**
 * Fixed bcrypt hash compared against when the email is unknown, so a failed
 * login costs the same as a real one and cannot be used to probe accounts.
 */
const ABSENT_USER_HASH = '$2b$10$C6UzMDM.H6dfI/f/IKcEeO1uFqZf5nUwJXvO0.lQybfhB5VcLJ3Iu';

export class AuthService {
    constructor(
        private readonly users: AuthUserRepository,
        private readonly verificationTokens: EmailVerificationTokenRepository,
        private readonly resetTokens: PasswordResetTokenRepository,
        private readonly refreshTokens: RefreshTokenRepository,
        private readonly mailer: AuthMailer,
        private readonly config: AuthConfig,
    ) { }

    async register(body: unknown): Promise<AuthUserResponse & MessageResponse> {
        const record = asRecord(body, 'Request body');
        const email = normalizeEmail(record['email']);
        const password = normalizePassword(record['password']);
        const firstName = normalizeName(record['firstName'], 'firstName');
        const lastName = normalizeName(record['lastName'], 'lastName');

        if (await this.users.findByEmail(email)) {
            throw ApiError.conflict('An account with this email already exists.');
        }

        const user = await this.users.create({
            id: generateUserId(),
            email,
            firstName,
            lastName,
            hashedPassword: await hashPassword(password),
        });
        await this.issueVerificationToken(user);

        return {
            user: toAuthUserDto(user),
            message: 'Account created. Please check your email to verify the address.',
        };
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

    async login(body: unknown): Promise<AuthSessionResult> {
        const record = asRecord(body, 'Request body');
        const email = normalizeEmail(record['email']);
        const password = requireTrimmedString(record['password'], 'password', 200);

        const user = await this.users.findByEmail(email);
        const passwordMatches = await verifyPassword(password, user?.hashedPassword ?? ABSENT_USER_HASH);
        if (!user || !passwordMatches) throw ApiError.invalidCredentials();

        this.assertAccountUsable(user);
        await this.users.touchLogin(user.id, new Date());

        return this.issueSession(user);
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

    private async issueVerificationToken(user: AuthUserRow): Promise<void> {
        const now = new Date();
        const rawToken = generateOpaqueToken();
        await this.verificationTokens.invalidateOutstanding(user.id, now);
        await this.verificationTokens.create({
            userId: user.id,
            tokenHash: hashToken(rawToken),
            expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TOKEN_TTL_SECONDS * 1000),
        });
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

function toAuthUserDto(user: AuthUserRow): AuthUserDto {
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
