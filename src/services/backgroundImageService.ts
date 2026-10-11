import { ApiError } from '../utils/apiError';
import { getBackgroundImagesBaseUrl } from '../utils/image';
import { dynamicConfig } from './dynamicConfig';

/**
 * Owns the public random background value: it picks one entry from the
 * dynamic-config list that the slow refresh loads from GCS and joins it with
 * the configured public base URL. Controllers only return the prepared result.
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

    /**
     * Returns a current background and a distinct next background for preloading.
     * When fewer than two images are available, `next` references the same image
     * as `current` so the Frontend always receives a usable pair.
     */
    getBackgroundPair(): { current: { url: string }; next: { url: string } } {
        const names = dynamicConfig.getBackgroundImages();
        if (names.length === 0) {
            throw ApiError.notFound('No background image is available.');
        }

        const baseUrl = getBackgroundImagesBaseUrl();
        if (baseUrl === null) {
            throw ApiError.internal('The background image base URL is not configured.');
        }

        const urlBase: string = baseUrl;
        const firstIndex = Math.floor(Math.random() * names.length);
        let secondIndex = Math.floor(Math.random() * names.length);
        if (names.length > 1) {
            while (secondIndex === firstIndex) {
                secondIndex = Math.floor(Math.random() * names.length);
            }
        }

        const currentName = names[firstIndex];
        const nextName = names.length > 1 ? names[secondIndex] : names[firstIndex];

        if (!currentName) throw ApiError.notFound('No background image is available.');
        if (!nextName) throw ApiError.notFound('No background image is available.');

        return {
            current: { url: `${urlBase}/${currentName}` },
            next: { url: `${urlBase}/${nextName}` },
        };
    }
}