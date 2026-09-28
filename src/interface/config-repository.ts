import { SelectConfig, ServiceConfig } from '../model/config';

export interface IConfigRepository {
    getSelectTypes(): Promise<SelectConfig[]>;
    getSelectType(key: string): Promise<SelectConfig | null>;
    getServiceConfigs(): Promise<ServiceConfig[]>;
    getServiceConfig(key: string): Promise<ServiceConfig | null>;
}
