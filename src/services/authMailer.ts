import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { AuthConfig } from '../config/auth';
import { ApiError } from '../utils/apiError';
import { getErrorMessage } from '../utils/error';
import sendMail from '../utils/sendEmail';
import { renderAuthEmailTemplate } from '../templates/authEmailTemplate';

/**
 * Renders and delivers the Auth emails. The raw token only ever appears inside
 * the message that is sent to the account owner: never in a log and never in an
 * API response.
 */
export class AuthMailer {
  constructor(private readonly config: AuthConfig) {}

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

    const html = renderAuthEmailTemplate({
      title,
      description,
      buttonLabel,
      expiry,
      link,
    });

    if (this.config.mailTransport === 'file') {
      this.writeDevMail(to, subject, action, html);
      return;
    }

    try {
      await sendMail(to, html, subject);
      // Log only delivery metadata. Never log the HTML, link, or raw token.
      console.info(
        `[auth] Email sent successfully: type="${action}", to="${to}", subject="${subject}", transport="smtp"`,
      );
    } catch (error) {
      console.error(
        `[auth] Email delivery failed: type="${action}", to="${to}", subject="${subject}", transport="smtp", errorCode="${getSafeMailErrorCode(error)}"`,
      );
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
      const file = join(
        directory,
        `${Date.now()}-${subject.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`,
      );
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- generated filename in controlled temp directory
      writeFileSync(file, `<!-- to: ${to} -->\n${html}\n`, 'utf8');
      console.info(
        `[auth] Email prepared locally (not sent): type="${action}", to="${to}", subject="${subject}", transport="file", file="${file}"`,
      );
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
