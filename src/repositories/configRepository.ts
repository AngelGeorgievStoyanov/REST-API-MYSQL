import { type PrismaClient } from '@prisma/client';
import { toSelectConfigList, toServiceConfigList } from '../mappers/configMapper';
import { type SelectConfig, type ServiceConfig } from '../model/config';


/**
 * Persistence layer for dynamic configuration.
 *
 * Uses the shared PrismaClient (Prisma is the ORM) and no raw SQL. Returns domain
 * models from `src/model/config.ts`.
 */
export class ConfigRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async getSelectTypes(): Promise<SelectConfig[]> {
        const types = await this.prisma.selectType.findMany({
            include: { options: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
            orderBy: { id: 'asc' },
        });

        return toSelectConfigList(types);
    }

    async getServiceConfigs(): Promise<ServiceConfig[]> {
        const types = await this.prisma.serviceType.findMany({
            include: { configs: { orderBy: { id: 'asc' } } },
            orderBy: { id: 'asc' },
        });

        return toServiceConfigList(types);
    }

}

