import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { AuthConfig } from '../config/auth';
import { ApiError } from '../utils/apiError';
import { getErrorMessage } from '../utils/error';
import sendMail from '../utils/sendEmail';

/**
 * Renders and delivers the Auth emails. The raw token only ever appears inside
 * the message that is sent to the account owner: never in a log and never in an
 * API response.
 */
export class AuthMailer {
    constructor(private readonly config: AuthConfig) { }

    async sendVerificationEmail(to: string, rawToken: string): Promise<void> {
        const link = `${this.config.appUrl}${this.config.verifyEmailPath}?token=${encodeURIComponent(rawToken)}`;
        await this.send(to, 'Email verification - HACK-TRIP', 'verify your email address', link);
    }

    async sendPasswordResetEmail(to: string, rawToken: string): Promise<void> {
        const link = `${this.config.appUrl}${this.config.passwordResetPath}?token=${encodeURIComponent(rawToken)}`;
        await this.send(to, 'Password reset - HACK-TRIP', 'reset your password', link);
    }

    private async send(to: string, subject: string, action: string, link: string): Promise<void> {
        const html = `<html><body><p>You requested to ${action}. Use this <a href="${link}">link</a> to proceed.</p>`
            + '<p>If you did not request this, you can ignore this email.</p></body></html>';

        if (this.config.mailTransport === 'file') {
            this.writeDevMail(to, subject, html);
            return;
        }

        try {
            await sendMail(to, html, subject);
        } catch (error) {
            console.log(`[auth] ${subject} delivery failed: ${getErrorMessage(error)}`);
            throw ApiError.emailDeliveryFailed();
        }
    }

    /**
     * Development delivery when no SMTP credentials are configured: the message
     * is written next to the OS temp directory, so a local run can complete the
     * flow without a real mailbox.
     */
    private writeDevMail(to: string, subject: string, html: string): void {
        try {
            const directory = join(tmpdir(), 'hack-trip-auth-mail');
            mkdirSync(directory, { recursive: true });
            const file = join(directory, `${Date.now()}-${subject.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`);
            writeFileSync(file, `<!-- to: ${to} -->\n${html}\n`, 'utf8');
            console.log(`[auth] "${subject}" written to ${file}`);
        } catch (error) {
            console.log(`[auth] dev mail could not be written: ${getErrorMessage(error)}`);
            throw ApiError.emailDeliveryFailed();
        }
    }
}
