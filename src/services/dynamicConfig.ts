import { PublicServiceConfig, SelectConfig, ServiceConfig } from '../model/config';
import { ConfigRepository } from '../repositories/configRepository';
import { getErrorMessage } from '../utils/error';
import { EnvironmentConfig } from '../config/environment';
import { toPublicServiceConfigList } from '../mappers/publicConfigMapper';
import { listBackgroundImageNames } from '../storage/backgroundImageStorage';

export interface DynamicConfig {
    selects: SelectConfig[];
    services: ServiceConfig[];
    loadedAt: number;
}

let repository: ConfigRepository | null = null;
let currentConfig: DynamicConfig | null = null;
let environment: EnvironmentConfig | null = null;
let refreshInFlight: Promise<void> | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
/**
 * Object names of the public background bucket, loaded by the slow refresh.
 * Starts empty and is only replaced by a successful load: a failed refresh
 * keeps the last successfully loaded list.
 */
let backgroundImages: string[] = [];

async function init(configRepository: ConfigRepository, configEnvironment: EnvironmentConfig): Promise<void> {
    repository = configRepository;
    environment = configEnvironment;

    try {
        await refreshSlow();
        await refreshFast();
    } catch (err) {
        const reason = getErrorMessage(err);
        repository = null;
        environment = null;
        throw new Error(`Initial config load failed: ${reason}`, { cause: err });
    }

    startRefreshTimer();

    console.log(`[config] initial load ok (slow refresh every ${environment.slowRefreshSeconds}s)`);
}

/** Manual refresh; a failed read keeps the last known good config. Concurrent calls share one DB load. */
async function refreshDynamicConfigs(): Promise<void> {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = runRefresh();
    try {
        await refreshInFlight;
    } finally {
        refreshInFlight = null;
    }
}

function startRefreshTimer(): void {
    if (!repository || !environment) {
        throw new Error('dynamicConfig.init() must run before startRefreshTimer().');
    }
    if (refreshTimer) return;

    refreshTimer = setInterval(() => {
        refreshDynamicConfigs().catch((err: unknown) => {
            const reason = getErrorMessage(err);
            console.log(`[config] slow refresh failed, keeping last known good config: ${reason}`);
        });
    }, environment.slowRefreshSeconds * 1000);
    refreshTimer.unref();
}

function stopRefreshTimer(): void {
    if (!refreshTimer) return;

    clearInterval(refreshTimer);
    refreshTimer = null;
}

function getConfig(): DynamicConfig {
    if (!currentConfig) {
        throw new Error('dynamicConfig is not loaded yet.');
    }
    return currentConfig;
}

function getSelectTypes(): SelectConfig[] {
    return getConfig().selects;
}

function getSelectType(key: string): SelectConfig | null {
    return getConfig().selects.find((selectType) => selectType.key === key) ?? null;
}

function getServiceConfigs(): ServiceConfig[] {
    return getConfig().services;
}

function getServiceConfig(key: string): ServiceConfig | null {
    return getConfig().services.find((serviceConfig) => serviceConfig.key === key) ?? null;
}

/**
 * Public-safe service configuration: the API mapper exposes only the documented
 * public keys, so no internal configuration row reaches the response. The mapper
 * runs at the service boundary; the controller only returns the prepared result.
 */
function getPublicServiceConfigs(): PublicServiceConfig[] {
    return toPublicServiceConfigList(getConfig().services);
}

async function runRefresh(): Promise<void> {
    await refreshSlow();
    await refreshFast();
}

/** FAST config group: reserved for frequently changing values; no DB queries yet. */
async function refreshFast(): Promise<void> { }

async function refreshSlow(): Promise<void> {
    if (!repository) {
        throw new Error('dynamicConfig is not initialized (init was not called).');
    }

    // Background discovery runs first and never throws: an unreadable bucket
    // neither fails startup nor discards the last successfully loaded list.
    await refreshBackgroundImages();

    const [selects, services] = await Promise.all([
        repository.getSelectTypes(),
        repository.getServiceConfigs(),
    ]);

    if (selects.length > 0) {
        // Atomic success path: the selected config is fully valid, so it becomes the new current config.
        currentConfig = { selects, services, loadedAt: Date.now() };
        return;
    }

    // Never replace a valid config with an empty one (e.g. a truncated table).
    throw new Error('Slow config load produced no select_types (select_types empty; seed data missing?).');
}

/**
 * Reloads the background object names from GCS. A successful load replaces the
 * current list; a failure logs a warning and keeps the previous value, so the
 * endpoint stays answerable with the last known good list.
 */
async function refreshBackgroundImages(): Promise<void> {
    try {
        backgroundImages = await listBackgroundImageNames();
    } catch (err) {
        console.warn(`[config] background-image refresh failed, keeping last known good list: ${getErrorMessage(err)}`);
    }
}

/** Currently available background object names; empty until the first successful load. */
function getBackgroundImages(): string[] {
    return backgroundImages;
}

export const dynamicConfig = {
    init,
    refreshDynamicConfigs,
    stopRefreshTimer,
    getConfig,
    getSelectTypes,
    getSelectType,
    getServiceConfigs,
    getServiceConfig,
    getPublicServiceConfigs,
    getBackgroundImages,
};

