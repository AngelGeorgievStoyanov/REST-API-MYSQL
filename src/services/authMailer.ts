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
        await this.send(to, 'Verify your email address | HACK-TRIP', 'verify your email address', link);
    }

    async sendPasswordResetEmail(to: string, rawToken: string): Promise<void> {
        const link = `${this.config.appUrl}${this.config.passwordResetPath}?token=${encodeURIComponent(rawToken)}`;
        await this.send(to, 'Reset your password | HACK-TRIP', 'reset your password', link);
    }

    private async send(to: string, subject: string, action: string, link: string): Promise<void> {
        const isVerification = action === 'verify your email address';
        const title = isVerification ? 'Welcome to HACK-TRIP!' : 'Password reset request';
        const description = isVerification
            ? 'Thanks for joining HACK-TRIP. Please confirm your email address to activate your account.'
            : 'We received a request to reset the password for your HACK-TRIP account.';
        const buttonLabel = isVerification ? 'VERIFY EMAIL ADDRESS' : 'RESET PASSWORD';
        const expiry = isVerification
            ? 'If you did not create a HACK-TRIP account, you can safely ignore this email.'
            : 'If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.';

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <div style="display:none;font-size:1px;color:#f3f6fb;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
        ${description}
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3f6fb;padding:36px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:14px;overflow:hidden;">
                    <tr>
                        <td align="center" style="background-color:#10243a;padding:28px 24px;">
                            <div style="font-size:25px;line-height:30px;font-weight:800;letter-spacing:1.5px;color:#ffffff;">HACK-TRIP</div>
                            <div style="margin-top:7px;font-size:11px;line-height:16px;letter-spacing:2px;color:#a9c5df;">TRAVEL SMARTER</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:38px 36px 20px;">
                            <h1 style="margin:0 0 16px;font-size:25px;line-height:32px;font-weight:700;color:#172033;">${title}</h1>
                            <p style="margin:0;font-size:15px;line-height:25px;color:#526174;">${description}</p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding:18px 36px 30px;">
                            <a href="${link}" target="_blank" style="display:inline-block;background-color:#1976d2;color:#ffffff;text-decoration:none;font-size:14px;line-height:20px;font-weight:700;letter-spacing:.4px;padding:15px 25px;border-radius:7px;">${buttonLabel}</a>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 36px 30px;">
                            <p style="margin:0;font-size:13px;line-height:21px;color:#718096;">${expiry}</p>
                            <p style="margin:18px 0 0;font-size:13px;line-height:21px;color:#718096;">If the button doesn't work, copy and paste this link into your browser:<br>
                                <a href="${link}" style="color:#1976d2;word-break:break-all;">${link}</a>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="border-top:1px solid #e8edf3;padding:20px 24px;">
                            <p style="margin:0;font-size:12px;line-height:19px;color:#91a0b2;">© HACK-TRIP · Travel smarter</p>
                            <p style="margin:5px 0 0;font-size:11px;line-height:17px;color:#a0adbb;">This is an automated email. Please do not reply.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

        if (this.config.mailTransport === 'file') {
            this.writeDevMail(to, subject, action, html);
            return;
        }

        try {
            await sendMail(to, html, subject);
            // Log only delivery metadata. Never log the HTML, link, or raw token.
            console.info(`[auth] Email sent successfully: type="${action}", to="${to}", subject="${subject}", transport="smtp"`);
        } catch (error) {
            console.error(`[auth] Email delivery failed: type="${action}", to="${to}", subject="${subject}", transport="smtp", errorCode="${getSafeMailErrorCode(error)}"`);
            throw ApiError.emailDeliveryFailed();
        }
    }

    /**
     * Development delivery when no SMTP credentials are configured: the message
     * is written next to the OS temp directory, so a local run can complete the
     * flow without a real mailbox.
     */
    private writeDevMail(to: string, subject: string, action: string, html: string): void {
        try {
            const directory = join(tmpdir(), 'hack-trip-auth-mail');
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- controlled temp directory path
            mkdirSync(directory, { recursive: true });
            const file = join(directory, `${Date.now()}-${subject.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`);
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- generated filename in controlled temp directory
            writeFileSync(file, `<!-- to: ${to} -->\n${html}\n`, 'utf8');
            console.info(`[auth] Email prepared locally (not sent): type="${action}", to="${to}", subject="${subject}", transport="file", file="${file}"`);
        } catch (error) {
            console.error(`[auth] Dev email could not be written: ${getErrorMessage(error)}`);
            throw ApiError.emailDeliveryFailed();
        }
    }
}

/** Only allow a short error code in logs; SMTP messages/responses may contain sensitive data. */
function getSafeMailErrorCode(error: unknown): string {
    if (typeof error !== 'object' || error === null || !('code' in error)) return 'unknown';

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(code) ? code : 'unknown';
}
