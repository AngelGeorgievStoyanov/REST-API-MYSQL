export interface RecaptchaVerificationResponse {
  success: boolean;
}

/**
 * Transport adapter for Google's reCAPTCHA siteverify endpoint.
 * It knows HTTP details only; application error mapping belongs to CaptchaService.
 */
export class RecaptchaHttpClient {
  private static readonly VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
  private static readonly TIMEOUT_MS = 5000;

  async verify(secret: string, responseToken: string): Promise<RecaptchaVerificationResponse> {
    const parameters = new URLSearchParams({
      secret,
      response: responseToken,
    });

    const response = await fetch(RecaptchaHttpClient.VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: parameters,
      signal: AbortSignal.timeout(RecaptchaHttpClient.TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error('Google reCAPTCHA verification request failed.');
    }

    const payload: unknown = await response.json();
    if (
      typeof payload !== 'object' ||
      payload === null ||
      typeof Reflect.get(payload, 'success') !== 'boolean'
    ) {
      throw new Error('Google reCAPTCHA returned an invalid response.');
    }

    return { success: Reflect.get(payload, 'success') as boolean };
  }
}
