import {
    PrismaClient,
    SelectOption as PrismaSelectOption,
    SelectType as PrismaSelectType,
    ServiceConfig as PrismaServiceConfig,
    ServiceType as PrismaServiceType,
} from '@prisma/client';
import {
    SelectConfig,
    SelectOption,
    ServiceConfig,
    ServiceConfigEntry,
    ServiceConfigValueType,
} from '../model/config';

type SelectTypeWithOptions = PrismaSelectType & { options: PrismaSelectOption[] };
type ServiceTypeWithConfigs = PrismaServiceType & { configs: PrismaServiceConfig[] };

const toServiceConfigValueType = (value: string): ServiceConfigValueType =>
    value === 'number' || value === 'boolean' || value === 'json' ? value : 'string';

const toSelectOption = (row: PrismaSelectOption): SelectOption => ({
    id: row.id,
    selectTypeId: row.selectTypeId,
    key: row.key,
    value: row.value,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
});

const toSelectConfig = (row: PrismaSelectType, options: SelectOption[]): SelectConfig => ({
    id: row.id,
    key: row.key,
    name: row.name,
    isActive: row.isActive,
    options,
});

const toServiceConfigEntry = (row: PrismaServiceConfig): ServiceConfigEntry => ({
    id: row.id,
    serviceTypeId: row.serviceTypeId,
    key: row.key,
    value: row.value,
    type: toServiceConfigValueType(row.type),
    isActive: row.isActive,
});

const toServiceConfig = (row: PrismaServiceType, configs: ServiceConfigEntry[]): ServiceConfig => ({
    id: row.id,
    key: row.key,
    name: row.name,
    isActive: row.isActive,
    configs,
});

/**
 * Persistence layer for dynamic configuration.
 *
 * Uses the shared PrismaClient (Prisma is the ORM) and no raw SQL. Returns domain
 * models from `src/model/config.ts`.
 */
export class ConfigRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async getSelectTypes(): Promise<SelectConfig[]> {
        const types: SelectTypeWithOptions[] = await this.prisma.selectType.findMany({
            include: { options: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
            orderBy: { id: 'asc' },
        });

        return types.map((type) => toSelectConfig(type, type.options.map(toSelectOption)));
    }

    async getServiceConfigs(): Promise<ServiceConfig[]> {
        const types: ServiceTypeWithConfigs[] = await this.prisma.serviceType.findMany({
            include: { configs: { orderBy: { id: 'asc' } } },
            orderBy: { id: 'asc' },
        });

        return types.map((type) => toServiceConfig(type, type.configs.map(toServiceConfigEntry)));
    }

}

