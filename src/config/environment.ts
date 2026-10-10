import { DEFAULT_PUBLIC_FRONTEND_TOKEN, DEFAULT_SLOW_REFRESH_SECONDS } from '../constants/environment';
import { DEVELOPMENT_CORS_ORIGINS, PRODUCTION_CORS_ORIGINS } from '../constants/http';

export interface EnvironmentConfig {
    slowRefreshSeconds: number;
    /**
     * Public, non-secret marker the frontend bundle sends next to the client
     * marker. It is visible in DevTools and copyable, so it is a request-shape
     * filter only: it never identifies a user, sets an owner, or bypasses
     * authorization or rate limiting.
     */
    publicFrontendToken: string;
    /**
     * Browser origins this run accepts. Localhost is only ever allowed outside
     * production, so a production run can never answer a development origin.
     */
    corsOrigins: string[];
}

export type EnvironmentSource = Record<string, string | undefined>;

/** Single place that reads process.env for application configuration. */
export function loadEnvironmentConfig(
    env: EnvironmentSource = process.env,
): EnvironmentConfig {
    const production = env['NODE_ENV'] === 'production';

    return {
        slowRefreshSeconds: Number(env['CONFIG_SLOW_REFRESH_SECONDS'] || DEFAULT_SLOW_REFRESH_SECONDS),
        publicFrontendToken: env['PUBLIC_FRONTEND_TOKEN']?.trim() || DEFAULT_PUBLIC_FRONTEND_TOKEN,
        corsOrigins: [...(production ? PRODUCTION_CORS_ORIGINS : DEVELOPMENT_CORS_ORIGINS)],
    };
}