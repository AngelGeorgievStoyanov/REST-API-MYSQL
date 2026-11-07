import type { AuthConfig } from '../config/auth';
import { type RecaptchaHttpClient } from '../clients/recaptchaHttpClient';
import { ApiError } from '../utils/apiError';

/** Applies the CAPTCHA policy independently of the auth flows using it. */
export class CaptchaService {
    constructor(
        private readonly config: AuthConfig,
        private readonly client: RecaptchaHttpClient,
    ) { }

    async verifyToken(value: unknown): Promise<void> {
        if (typeof value !== 'string' || value.trim() === '') {
            throw ApiError.validation('Please complete the CAPTCHA challenge.');
        }

        const secret = this.config.recaptchaV2SecretKey;
        if (secret.length === 0) {
            throw ApiError.internal('CAPTCHA verification is temporarily unavailable. Please try again.');
        }

        try {
            const verification = await this.client.verify(secret, value.trim());
            if (!verification.success) {
                throw ApiError.validation('CAPTCHA verification failed. Please complete the challenge again.');
            }
        } catch (error) {
            if (error instanceof ApiError) throw error;
            throw ApiError.internal('CAPTCHA verification is temporarily unavailable. Please try again.');
        }
    }
}
