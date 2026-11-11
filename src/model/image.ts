import { type SocialState } from './social';

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

export interface ImageRecord {
  id: number;
  filePath: string;
}

/** Image DTO of a social-aware response, such as the trip read model. */
export interface ImageInventoryComparison {
  cloudOnly: string[];
  databaseOnly: string[];
  pagination: {
    page: number;
    pageSize: number;
    cloudHasNext: boolean;
    databaseHasNext: boolean;
    databaseTotal: number;
    databaseTotalPages: number;
  };
}

/** Image DTO of a social-aware response, such as the trip read model. */
export interface SocialImageDto extends ImageDto {
  social: SocialState;
}


/** Admin queue item: a database image whose original exists in GCS but thumbnail does not. */
export type MissingThumbnailImageDto = ImageDto;

export interface MissingThumbnailPageDto {
  items: MissingThumbnailImageDto[];
  pagination: {
    page: number;
    pageSize: number;
    hasNext: boolean;
  };
}

export interface GenerateThumbnailResult {
  imageId: number;
  status: 'generated' | 'already_exists' | 'original_missing' | 'not_found' | 'failed';
}

export interface GenerateThumbnailsResponse {
  results: GenerateThumbnailResult[];
  summary: {
    generated: number;
    alreadyExists: number;
    originalMissing: number;
    notFound: number;
    failed: number;
  };
}
