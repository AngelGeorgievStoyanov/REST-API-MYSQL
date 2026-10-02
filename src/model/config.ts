export type ServiceConfigValueType = 'string' | 'number' | 'boolean' | 'json';

export interface SelectOption {
    id: number;
    selectTypeId: number;
    key: string;
    value: string;
    sortOrder: number;
    isActive: boolean;
}

export interface SelectConfig {
    id: number;
    key: string;
    name: string;
    isActive: boolean;
    options: SelectOption[];
}

export interface ServiceConfigEntry {
    id: number;
    serviceTypeId: number;
    key: string;
    value: string;
    type: ServiceConfigValueType;
    isActive: boolean;
}

export interface ServiceConfig {
    id: number;
    key: string;
    name: string;
    isActive: boolean;
    configs: ServiceConfigEntry[];
}

export interface PublicServiceConfigEntry {
    id: number;
    serviceTypeId: number;
    key: string;
    value: string;
    type: ServiceConfigValueType;
    isActive: boolean;
}

export interface PublicServiceConfig {
    id: number;
    key: string;
    name: string;
    isActive: boolean;
    configs: PublicServiceConfigEntry[];
}
