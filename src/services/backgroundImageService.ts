import { ApiError } from '../utils/apiError';
import { getBackgroundImagesBaseUrl } from '../utils/image';
import { dynamicConfig } from './dynamicConfig';

/**
 * Owns the public random background value: it picks one entry from the
 * dynamic-config list that the slow refresh loads from GCS and joins it with
 * the configured public base URL. Controllers only return this prepared result.
 */
export class BackgroundImageService {
    getRandomBackground(): { url: string } {
        const names = dynamicConfig.getBackgroundImages();
        if (names.length === 0) {
            throw ApiError.notFound('No background image is available.');
        }

        const baseUrl = getBackgroundImagesBaseUrl();
        if (baseUrl === null) {
            throw ApiError.internal('The background image base URL is not configured.');
        }

        const urlBase: string = baseUrl;
        const name = names[Math.floor(Math.random() * names.length)];
        if (!name) throw ApiError.notFound('No background image is available.');
        return { url: `${urlBase}/${name}` };
    }
}