export interface EnvironmentConfig {
    slowRefreshSeconds: number;
}

export type EnvironmentSource = Record<string, string | undefined>;

/** Single place that reads process.env for application configuration. */
export function loadEnvironmentConfig(
    env: EnvironmentSource = process.env,
): EnvironmentConfig {
    return {
        slowRefreshSeconds: Number(env.CONFIG_SLOW_REFRESH_SECONDS || 300),
    };
}
