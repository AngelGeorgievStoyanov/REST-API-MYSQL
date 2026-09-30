import { SocialState } from './social';

/**
 * API representation of one `images` row. The live table stores the original
 * `filePath` only — there is no thumbnail column, so the thumbnail URL follows
 * from the storage naming convention (`_thumb.webp` sidecar).
 */
export interface ImageDto {
    id: number;
    url: string;
    thumbnailUrl: string;
}

/** Image DTO of a social-aware response, such as the trip read model. */
export interface SocialImageDto extends ImageDto {
    social: SocialState;
}
