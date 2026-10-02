import { PublicServiceConfig, ServiceConfig } from '../model/config';

const PUBLIC_CONFIG_KEYS = {
    google_maps: ['map_width', 'map_height', 'zoom_control', 'gesture_handling', 'point_map_height', 'point_map_type_control'],
    mui: ['theme_direction'],
    ui: ['page_size_options', 'page_size_default'],
    visual: [
        'image_base_url',
        'background_images_base_url',
        'thumb_width',
        'thumb_height',
        'thumb_quality',
        'thumb_fit',
        'thumb_auto',
    ],
    routing: ['home_path', 'login_path', 'not_found_path', 'verify_email_path'],
} as const satisfies Record<string, readonly string[]>;

export function toPublicServiceConfigList(services: ServiceConfig[]): PublicServiceConfig[] {
    return services.flatMap((service) => {
        const allowedKeys = PUBLIC_CONFIG_KEYS[service.key as keyof typeof PUBLIC_CONFIG_KEYS];
        if (!allowedKeys) return [];

        const configs = service.configs
            .filter((config) => (allowedKeys as readonly string[]).includes(config.key))
            .map((config) => ({
                id: config.id,
                serviceTypeId: config.serviceTypeId,
                key: config.key,
                value: config.value,
                type: config.type,
                isActive: config.isActive,
            }));

        if (configs.length === 0) return [];

        return [{
            id: service.id,
            key: service.key,
            name: service.name,
            isActive: service.isActive,
            configs,
        }];
    });
}