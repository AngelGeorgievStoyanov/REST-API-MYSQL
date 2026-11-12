import {
  BUCKET_NAME,
  IMAGE_THUMBNAIL,
  MAX_IMAGE_PIXELS,
  THUMBNAIL_SUFFIX,
} from '../constants/imageStorage';
import { type File, type GetFilesOptions } from '@google-cloud/storage';

/** A thumbnail is the `_thumb.webp` sidecar of its original in the flat bucket. */
export function thumbnailFileName(filePath: string): string {
  const extensionIndex = filePath.lastIndexOf('.');
  const base = extensionIndex > -1 ? filePath.substring(0, extensionIndex) : filePath;
  return `${base}${THUMBNAIL_SUFFIX}`;
}

export interface ImageFileStorage {
  remove(filePath: string): Promise<void>;
  removeMany(filePaths: string[]): Promise<void>;
}

export interface ImageInventoryStorage {
  /** Object names currently present in the bucket. */
  listPage(page: number, pageSize: number): Promise<{ items: string[]; hasNext: boolean }>;
  exists(filePath: string): Promise<boolean>;
  /** Creates a missing thumbnail from a database-owned original object. */
  generateThumbnail(filePath: string): Promise<'generated' | 'already_exists' | 'original_missing'>;
}

/**
 * Deletes the original and its thumbnail sidecar. The GCS client is imported
 * lazily because it pulls in the native `sharp` dependency, which is only needed
 * when storage is actually touched.
 */
async function removeFromGcs(filePath: string): Promise<void> {
  const { gcsClient } = await import('../clients/googleCloudStorage');
  const bucket = gcsClient.bucket(BUCKET_NAME);

  await Promise.all([
    bucket.file(filePath).delete({ ignoreNotFound: true }),
    bucket.file(thumbnailFileName(filePath)).delete({ ignoreNotFound: true }),
  ]);
}

/** Bucket folders are not images, so only real objects are reported. */
async function listPageFromGcs(
  page: number,
  pageSize: number,
): Promise<{ items: string[]; hasNext: boolean }> {
  const { gcsClient } = await import('../clients/googleCloudStorage');
  const bucket = gcsClient.bucket(BUCKET_NAME);
  let query: GetFilesOptions = { autoPaginate: false, maxResults: pageSize };
  let files: File[] = [];
  let nextQuery: object | undefined;

  for (let currentPage = 1; currentPage <= page; currentPage++) {
    // eslint-disable-next-line no-await-in-loop -- sequential GCS pagination
    [files, nextQuery] = await bucket.getFiles(query);
    if (currentPage === page) break;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- nextQuery is object | undefined
    if (!nextQuery) {
      files = [];
      break;
    }
    query = { ...nextQuery, autoPaginate: false, maxResults: pageSize };
  }

  return {
    items: files.filter((file) => !file.name.endsWith('/')).map((file) => file.name),
    hasNext: nextQuery !== undefined,
  };
}

async function existsInGcs(filePath: string): Promise<boolean> {
  const { gcsClient } = await import('../clients/googleCloudStorage');
  const [exists] = await gcsClient.bucket(BUCKET_NAME).file(filePath).exists();
  return exists;
}

async function generateThumbnailInGcs(
  filePath: string,
): Promise<'generated' | 'already_exists' | 'original_missing'> {
  const [{ gcsClient }, sharpModule] = await Promise.all([
    import('../clients/googleCloudStorage'),
    import('sharp'),
  ]);
  const bucket = gcsClient.bucket(BUCKET_NAME);
  const original = bucket.file(filePath);
  const thumbnail = bucket.file(thumbnailFileName(filePath));
  const [[originalExists], [thumbnailExists]] = await Promise.all([
    original.exists(),
    thumbnail.exists(),
  ]);

  if (!originalExists) return 'original_missing';
  if (thumbnailExists) return 'already_exists';

  const [buffer] = await original.download();
  const thumbnailBuffer = await sharpModule
    .default(buffer, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize({
      width: IMAGE_THUMBNAIL.width,
      height: IMAGE_THUMBNAIL.height,
      fit: IMAGE_THUMBNAIL.fit,
      withoutEnlargement: true,
    })
    .webp({ quality: IMAGE_THUMBNAIL.quality })
    .toBuffer();

  try {
    await thumbnail.save(thumbnailBuffer, {
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: 'image/webp' },
    });
    return 'generated';
  } catch (error) {
    if (typeof error === 'object' && error !== null && Number(Reflect.get(error, 'code')) === 412) {
      return 'already_exists';
    }
    throw error;
  }
}

export const gcsImageFileStorage: ImageFileStorage & ImageInventoryStorage = {
  remove: removeFromGcs,
  async removeMany(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      // eslint-disable-next-line no-await-in-loop -- sequential deletion for GCS consistency
      await removeFromGcs(filePath);
    }
  },
  listPage: listPageFromGcs,
  exists: existsInGcs,
  generateThumbnail: generateThumbnailInGcs,
};
