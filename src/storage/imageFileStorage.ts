import { BUCKET_NAME } from '../constants/common';

/**
 * Storage layout of the flat single-bucket GCS image store: the original keeps
 * the uploaded name, its thumbnail is a `_thumb.webp` sidecar next to it.
 */
export function thumbnailFileName(filePath: string): string {
    const extensionIndex = filePath.lastIndexOf('.');
    const base = extensionIndex > -1 ? filePath.substring(0, extensionIndex) : filePath;
    return `${base}_thumb.webp`;
}

export interface ImageFileStorage {
    remove(filePath: string): Promise<void>;
    removeMany(filePaths: string[]): Promise<void>;
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

export const gcsImageFileStorage: ImageFileStorage = {
    remove: removeFromGcs,
    async removeMany(filePaths: string[]): Promise<void> {
        for (const filePath of filePaths) {
            await removeFromGcs(filePath);
        }
    },
};
