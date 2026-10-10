import { prisma } from '../clients/prisma';
import { type EnvironmentConfig } from '../config/environment';
import { ConfigRepository } from '../repositories/configRepository';
import { dynamicConfig } from '../services/dynamicConfig';

/**
 * Startup sequence of the application: the runtime configuration cache is filled
 * from the environment before the HTTP server accepts the first request. A failure
 * here is fatal, so the caller decides how to report it.
 */
export async function initializeApplication(environment: EnvironmentConfig): Promise<void> {
    await dynamicConfig.init(new ConfigRepository(prisma), environment);
}

/** Releases the runtime resources the application owns; safe to call more than once. */
export async function releaseApplicationResources(): Promise<void> {
    dynamicConfig.stopRefreshTimer();
    await prisma.$disconnect().catch(() => undefined);
}
