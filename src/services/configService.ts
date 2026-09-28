import { IConfigRepository } from '../interface/config-repository';
import { SelectConfig, ServiceConfig } from '../model/config';

export const DEFAULT_CONFIG_CACHE_TTL_SECONDS = 300;

export type ConfigEnvSource = Record<string, string | undefined>;

/** `CONFIG_CACHE_TTL` is cache TTL in seconds; read at call time, after dotenv.config(). */
export function getConfigCacheTtlSeconds(env: ConfigEnvSource = process.env): number {
    const raw = (env.CONFIG_CACHE_TTL || '').trim();
    if (raw === '') return DEFAULT_CONFIG_CACHE_TTL_SECONDS;

    const ttl = Number(raw);
    if (!Number.isInteger(ttl) || ttl < 1) {
        throw new Error(`Invalid CONFIG_CACHE_TTL "${raw}" (expected a positive integer number of seconds).`);
    }
    return ttl;
}

interface ConfigSnapshot {
    selectTypes: SelectConfig[];
    serviceConfigs: ServiceConfig[];
    loadedAt: number;
}

export class ConfigService {
    private snapshot: ConfigSnapshot | null = null;
    private refreshInFlight: Promise<void> | null = null;
    private refreshTimer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly repository: IConfigRepository,
        private readonly ttlSeconds: number = getConfigCacheTtlSeconds(),
    ) { }

    /** Throws on DB error or when the loaded configuration is empty. */
    async initialLoad(): Promise<void> {
        await this.refresh();

        const snapshot = this.snapshot;
        if (snapshot && snapshot.selectTypes.length === 0 && snapshot.serviceConfigs.length === 0) {
            this.snapshot = null;
            throw new Error('Initial config load produced no configuration (select_types/service_types empty; seed data missing?).');
        }
    }

    /** Manual refresh; the previous snapshot survives a failed read. */
    async refresh(): Promise<void> {
        if (this.refreshInFlight) return this.refreshInFlight;

        this.refreshInFlight = this.loadFromDb();
        try {
            await this.refreshInFlight;
        } finally {
            this.refreshInFlight = null;
        }
    }

    startPeriodicRefresh(): void {
        if (this.refreshTimer) return;

        this.refreshTimer = setInterval(() => {
            this.refresh().catch((err) => {
                console.log(`[config] periodic refresh failed, keeping last known good config: ${err?.message}`);
            });
        }, this.ttlSeconds * 1000);
        this.refreshTimer.unref();
    }

    stopPeriodicRefresh(): void {
        if (!this.refreshTimer) return;

        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
    }

    async getSelectTypes(): Promise<SelectConfig[]> {
        return (await this.getSnapshot()).selectTypes;
    }

    async getSelectType(key: string): Promise<SelectConfig | null> {
        const selectTypes = (await this.getSnapshot()).selectTypes;
        return selectTypes.find((selectType) => selectType.key === key) ?? null;
    }

    async getServiceConfigs(): Promise<ServiceConfig[]> {
        return (await this.getSnapshot()).serviceConfigs;
    }

    async getServiceConfig(key: string): Promise<ServiceConfig | null> {
        const serviceConfigs = (await this.getSnapshot()).serviceConfigs;
        return serviceConfigs.find((serviceConfig) => serviceConfig.key === key) ?? null;
    }

    private async loadFromDb(): Promise<void> {
        const [selectTypes, serviceConfigs] = await Promise.all([
            this.repository.getSelectTypes(),
            this.repository.getServiceConfigs(),
        ]);

        // Replaced only after a successful read, so a failed refresh keeps the last good config.
        this.snapshot = { selectTypes, serviceConfigs, loadedAt: Date.now() };
    }

    private async getSnapshot(): Promise<ConfigSnapshot> {
        if (!this.snapshot) {
            // Startup load failed (or empty): retry here instead of serving nothing.
            await this.refresh();
            return this.snapshot as ConfigSnapshot;
        }

        if (Date.now() - this.snapshot.loadedAt >= this.ttlSeconds * 1000) {
            try {
                await this.refresh();
            } catch (err) {
                console.log(`[config] refresh failed, serving last known good config: ${err?.message}`);
            }
        }

        return this.snapshot;
    }
}
