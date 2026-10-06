import { dynamicConfig } from '../services/dynamicConfig';
import { BACKGROUND_IMAGES_BASE_URL_KEY, IMAGE_BASE_URL_KEY, VISUAL_SERVICE } from '../constants/trip';

export function getImageBaseUrl(): string | null {
    const service = dynamicConfig.getServiceConfig(VISUAL_SERVICE);
    const entry = service?.configs.find((config) => config.key === IMAGE_BASE_URL_KEY);

    if (!entry || entry.value.length === 0) return null;
    return entry.value.replace(/\/+$/, '');
}

/** Public base URL the Frontend joins with one random background object name. */
export function getBackgroundImagesBaseUrl(): string | null {
    const service = dynamicConfig.getServiceConfig(VISUAL_SERVICE);
    const entry = service?.configs.find((config) => config.key === BACKGROUND_IMAGES_BASE_URL_KEY);

    if (!entry || entry.value.length === 0) return null;
    return entry.value.replace(/\/+$/, '');
}
