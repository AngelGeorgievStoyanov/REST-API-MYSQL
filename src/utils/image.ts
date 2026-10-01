import { dynamicConfig } from '../services/dynamicConfig';
import { IMAGE_BASE_URL_KEY, VISUAL_SERVICE } from '../constants/trip';

export function getImageBaseUrl(): string | null {
    const service = dynamicConfig.getServiceConfig(VISUAL_SERVICE);
    const entry = service?.configs.find((config) => config.key === IMAGE_BASE_URL_KEY);

    if (!entry || entry.value.length === 0) return null;
    return entry.value.replace(/\/+$/, '');
}
