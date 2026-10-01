import { DEVELOPMENT_CORS_ORIGINS, PRODUCTION_CORS_ORIGINS } from '../constants/http';

export interface EnvironmentConfig {
    slowRefreshSeconds: number;
    /**
     * Browser origins this run accepts. Localhost is only ever allowed outside
     * production, so a production run can never answer a development origin.
     */
    corsOrigins: string[];
}

export type EnvironmentSource = Record<string, string | undefined>;

/** Fallback cadence of the runtime config cache when `CONFIG_SLOW_REFRESH_SECONDS` is unset. */
const DEFAULT_SLOW_REFRESH_SECONDS = 300;

/** Single place that reads process.env for application configuration. */
export function loadEnvironmentConfig(
    env: EnvironmentSource = process.env,
): EnvironmentConfig {
    const production = env.NODE_ENV === 'production';

    return {
        slowRefreshSeconds: Number(env.CONFIG_SLOW_REFRESH_SECONDS || DEFAULT_SLOW_REFRESH_SECONDS),
        corsOrigins: [...(production ? PRODUCTION_CORS_ORIGINS : DEVELOPMENT_CORS_ORIGINS)],
    };
}
