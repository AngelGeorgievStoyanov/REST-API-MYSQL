import { BUCKET_NAME } from '../constants/common';
import { THUMBNAIL_SUFFIX } from '../constants/imageStorage';

/** A thumbnail is the `_thumb.webp` sidecar of its original in the flat bucket. */
export function thumbnailFileName(filePath: string): string {
    const extensionIndex = filePath.lastIndexOf('.');
    const base = extensionIndex > -1 ? filePath.substring(0, extensionIndex) : filePath;
    return `${base}${THUMBNAIL_SUFFIX}`;
}

export function isThumbnailFileName(filePath: string): boolean {
    return filePath.endsWith(THUMBNAIL_SUFFIX);
}

/** The original object a thumbnail sidecar belongs to. */
export function originalFileName(filePath: string): string {
    if (!isThumbnailFileName(filePath)) return filePath;

    return filePath.substring(0, filePath.length - THUMBNAIL_SUFFIX.length);
}

export interface ImageFileStorage {
    remove(filePath: string): Promise<void>;
    removeMany(filePaths: string[]): Promise<void>;
    /** Object names currently present in the bucket. */
    list(): Promise<string[]>;
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
async function listFromGcs(): Promise<string[]> {
    const { gcsClient } = await import('../clients/googleCloudStorage');
    const [files] = await gcsClient.bucket(BUCKET_NAME).getFiles();

    return files.filter((file) => !file.name.endsWith('/')).map((file) => file.name);
}

export const gcsImageFileStorage: ImageFileStorage = {
    remove: removeFromGcs,
    async removeMany(filePaths: string[]): Promise<void> {
        for (const filePath of filePaths) {
            await removeFromGcs(filePath);
        }
    },
    list: listFromGcs,
};
