import { dynamicConfig } from '../services/dynamicConfig';
import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { IMAGE_BASE_URL_KEY, VISUAL_SERVICE } from '../constants/trip';
import { ImageDto, SocialImageDto } from '../model/image';
import { SocialStates } from '../model/social';
import { thumbnailFileName } from '../storage/imageFileStorage';

function readImageBaseUrl(): string | null {
    const service = dynamicConfig.getServiceConfig(VISUAL_SERVICE);
    const entry = service?.configs.find((config) => config.key === IMAGE_BASE_URL_KEY);

    if (!entry || entry.value.length === 0) return null;
    return entry.value.replace(/\/+$/, '');
}

/** `images.filePath` stores a bare filename; legacy rows may already hold a URL. */
export function toImageUrl(filePath: string): string {
    if (/^https?:\/\//i.test(filePath)) return filePath;

    const baseUrl = readImageBaseUrl();
    return baseUrl ? `${baseUrl}/${filePath}` : filePath;
}

/** The single source of truth for the API representation of an image row. */
export function toImageDto(image: { id: number; filePath: string }): ImageDto {
    return {
        id: image.id,
        url: toImageUrl(image.filePath),
        thumbnailUrl: toImageUrl(thumbnailFileName(image.filePath)),
    };
}

/** Social-aware variant; the state comes from the batch already loaded for the request. */
export function toSocialImageDto(image: { id: number; filePath: string }, states: SocialStates): SocialImageDto {
    return {
        ...toImageDto(image),
        social: states.get(SOCIAL_TARGET_TYPE.IMAGE, image.id),
    };
}
