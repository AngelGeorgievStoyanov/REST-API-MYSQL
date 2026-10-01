import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { ImageDto, ImageRecord, SocialImageDto } from '../model/image';
import { SocialStates } from '../model/social';
import { thumbnailFileName } from '../storage/imageFileStorage';


/** `images.filePath` stores a bare filename; legacy rows may already hold a URL. */
export function toImageUrl(filePath: string, baseUrl: string | null): string {
    if (/^https?:\/\//i.test(filePath)) return filePath;

    return baseUrl ? `${baseUrl}/${filePath}` : filePath;
}

export function toImageDto(image: ImageRecord, baseUrl: string | null): ImageDto {
    return {
        id: image.id,
        url: toImageUrl(image.filePath, baseUrl),
        thumbnailUrl: toImageUrl(thumbnailFileName(image.filePath), baseUrl),
    };
}


export function toSocialImageDto(
    image: ImageRecord,
    states: SocialStates,
    baseUrl: string | null,
): SocialImageDto {
    return {
        ...toImageDto(image, baseUrl),
        social: states.get(SOCIAL_TARGET_TYPE.IMAGE, image.id),
    };
}