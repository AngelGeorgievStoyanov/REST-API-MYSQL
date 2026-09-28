import { IConfigRepository } from '../interface/config-repository';
import {
    SelectConfig,
    SelectOption,
    ServiceConfig,
    ServiceConfigEntry,
    ServiceConfigValueType,
} from '../model/config';
import { DbPool, runQuery } from '../db/mysqlPool';

const selectTypesSql = 'SELECT id, `key`, name, isActive FROM hack_trip.select_types ORDER BY id';
const selectOptionsSql =
    'SELECT id, selectTypeId, `key`, value, sortOrder, isActive FROM hack_trip.select_options ' +
    'ORDER BY selectTypeId, sortOrder, id';
const selectTypeByKeySql = 'SELECT id, `key`, name, isActive FROM hack_trip.select_types WHERE `key` = ?';
const selectOptionsForTypeSql =
    'SELECT id, selectTypeId, `key`, value, sortOrder, isActive FROM hack_trip.select_options ' +
    'WHERE selectTypeId = ? ORDER BY sortOrder, id';
const serviceTypesSql = 'SELECT id, `key`, name, isActive FROM hack_trip.service_types ORDER BY id';
const serviceConfigsSql =
    'SELECT id, serviceTypeId, `key`, value, `type`, isActive FROM hack_trip.service_configs ' +
    'ORDER BY serviceTypeId, id';
const serviceTypeByKeySql = 'SELECT id, `key`, name, isActive FROM hack_trip.service_types WHERE `key` = ?';
const serviceConfigsForTypeSql =
    'SELECT id, serviceTypeId, `key`, value, `type`, isActive FROM hack_trip.service_configs ' +
    'WHERE serviceTypeId = ? ORDER BY id';

interface SelectTypeRow {
    id: number;
    key: string;
    name: string;
    isActive: number | boolean;
}

interface SelectOptionRow {
    id: number;
    selectTypeId: number;
    key: string;
    value: string;
    sortOrder: number;
    isActive: number | boolean;
}

interface ServiceTypeRow {
    id: number;
    key: string;
    name: string;
    isActive: number | boolean;
}

interface ServiceConfigRow {
    id: number;
    serviceTypeId: number;
    key: string;
    value: string;
    type: string;
    isActive: number | boolean;
}

// mysql driver returns BOOLEAN (TINYINT(1)) as 0/1.
const toBoolean = (value: number | boolean): boolean => value === true || value === 1;

const toServiceConfigValueType = (value: string): ServiceConfigValueType =>
    value === 'number' || value === 'boolean' || value === 'json' ? value : 'string';

const toSelectOption = (row: SelectOptionRow): SelectOption => ({
    id: row.id,
    selectTypeId: row.selectTypeId,
    key: row.key,
    value: row.value,
    sortOrder: row.sortOrder,
    isActive: toBoolean(row.isActive),
});

const toSelectConfig = (row: SelectTypeRow, options: SelectOption[]): SelectConfig => ({
    id: row.id,
    key: row.key,
    name: row.name,
    isActive: toBoolean(row.isActive),
    options,
});

const toServiceConfigEntry = (row: ServiceConfigRow): ServiceConfigEntry => ({
    id: row.id,
    serviceTypeId: row.serviceTypeId,
    key: row.key,
    value: row.value,
    type: toServiceConfigValueType(row.type),
    isActive: toBoolean(row.isActive),
});

const toServiceConfig = (row: ServiceTypeRow, configs: ServiceConfigEntry[]): ServiceConfig => ({
    id: row.id,
    key: row.key,
    name: row.name,
    isActive: toBoolean(row.isActive),
    configs,
});

export class ConfigRepository implements IConfigRepository {
    constructor(protected pool: DbPool) { }

    async getSelectTypes(): Promise<SelectConfig[]> {
        const [typeRows, optionRows] = await Promise.all([
            runQuery<SelectTypeRow[]>(this.pool, selectTypesSql),
            runQuery<SelectOptionRow[]>(this.pool, selectOptionsSql),
        ]);

        return typeRows.map((typeRow) =>
            toSelectConfig(typeRow, optionRows.filter((o) => o.selectTypeId === typeRow.id).map(toSelectOption)));
    }

    async getSelectType(key: string): Promise<SelectConfig | null> {
        const typeRows = await runQuery<SelectTypeRow[]>(this.pool, selectTypeByKeySql, [key]);
        const typeRow = typeRows[0];
        if (!typeRow) return null;

        const optionRows = await runQuery<SelectOptionRow[]>(this.pool, selectOptionsForTypeSql, [typeRow.id]);
        return toSelectConfig(typeRow, optionRows.map(toSelectOption));
    }

    async getServiceConfigs(): Promise<ServiceConfig[]> {
        const [typeRows, configRows] = await Promise.all([
            runQuery<ServiceTypeRow[]>(this.pool, serviceTypesSql),
            runQuery<ServiceConfigRow[]>(this.pool, serviceConfigsSql),
        ]);

        return typeRows.map((typeRow) =>
            toServiceConfig(typeRow, configRows.filter((c) => c.serviceTypeId === typeRow.id).map(toServiceConfigEntry)));
    }

    async getServiceConfig(key: string): Promise<ServiceConfig | null> {
        const typeRows = await runQuery<ServiceTypeRow[]>(this.pool, serviceTypeByKeySql, [key]);
        const typeRow = typeRows[0];
        if (!typeRow) return null;

        const configRows = await runQuery<ServiceConfigRow[]>(this.pool, serviceConfigsForTypeSql, [typeRow.id]);
        return toServiceConfig(typeRow, configRows.map(toServiceConfigEntry));
    }
}
