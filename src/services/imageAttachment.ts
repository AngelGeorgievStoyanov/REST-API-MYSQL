import { IMAGE_LIMIT_MESSAGE } from '../constants/imageStorage';
import { ImageFileStorage } from '../storage/imageFileStorage';
import { ApiError } from '../utils/apiError';
import { getErrorMessage } from '../utils/error';

/**
 * Writes the `images` row of a file that is already in the bucket.
 *
 * The row is the only thing that makes an upload real, so a write that fails —
 * or that finds the entity full — removes the freshly stored object again: an
 * upload must never leave an orphan in the bucket.
 *
 * Returns the created image id.
 */
export async function attachUploadedImage(
    storage: ImageFileStorage,
    filePath: string,
    writeRow: () => Promise<number | null>,
): Promise<number> {
    let imageId: number | null;

    try {
        imageId = await writeRow();
    } catch (error) {
        await removeQuietly(storage, filePath);
        throw error;
    }

    if (imageId === null) {
        await removeQuietly(storage, filePath);
        throw ApiError.conflict(IMAGE_LIMIT_MESSAGE);
    }

    return imageId;
}

/** Cleanup must not mask the original failure. */
async function removeQuietly(storage: ImageFileStorage, filePath: string): Promise<void> {
    try {
        await storage.remove(filePath);
    } catch (error) {
        console.log(`[images] could not remove the unused upload "${filePath}": ${getErrorMessage(error)}`);
    }
}
