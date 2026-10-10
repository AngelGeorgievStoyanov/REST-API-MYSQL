import {
    type SelectOption as PrismaSelectOption,
    type SelectType as PrismaSelectType,
    type ServiceConfig as PrismaServiceConfig,
    type ServiceType as PrismaServiceType,
} from '@prisma/client';
import {
    type SelectConfig,
    type SelectOption,
    type ServiceConfig,
    type ServiceConfigEntry,
    type ServiceConfigValueType,
} from '../model/config';

/** Prisma persistence-to-domain mapping used by ConfigRepository. */
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

const toSelectConfig = (row: SelectTypeWithOptions): SelectConfig => ({
    id: row.id,
    key: row.key,
    name: row.name,
    isActive: row.isActive,
    options: row.options.map(toSelectOption),
});

const toServiceConfigEntry = (row: PrismaServiceConfig): ServiceConfigEntry => ({
    id: row.id,
    serviceTypeId: row.serviceTypeId,
    key: row.key,
    value: row.value,
    type: toServiceConfigValueType(row.type),
    isActive: row.isActive,
});

const toServiceConfig = (row: ServiceTypeWithConfigs): ServiceConfig => ({
    id: row.id,
    key: row.key,
    name: row.name,
    isActive: row.isActive,
    configs: row.configs.map(toServiceConfigEntry),
});

export const toSelectConfigList = (rows: SelectTypeWithOptions[]): SelectConfig[] => rows.map(toSelectConfig);

export const toServiceConfigList = (rows: ServiceTypeWithConfigs[]): ServiceConfig[] => rows.map(toServiceConfig);