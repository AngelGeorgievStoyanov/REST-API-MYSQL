import { ImageRepository } from '../repositories/imageRepository';
import { ImageFileStorage, isThumbnailFileName, originalFileName } from '../storage/imageFileStorage';

/** The difference between the flat GCS bucket and the `images` table. */
export interface ImageInventoryComparison {
    /** Objects present in GCS that no `images` row references — orphaned uploads. */
    cloudOnly: string[];
    /** `images` rows whose file is missing from GCS. */
    databaseOnly: string[];
}

export class ImageInventoryService {
    constructor(private readonly images: ImageRepository, private readonly storage: ImageFileStorage) { }

    async cloudImages(): Promise<string[]> {
        return sortUnique(await this.storage.list());
    }

    async databaseImages(): Promise<string[]> {
        return sortUnique(await this.images.listFilePaths());
    }

    /**
     * A thumbnail is a sidecar of its original, so it only counts as orphaned when
     * the original is missing from the database as well. The returned names are the
     * bucket objects themselves, so they can be handed to storage maintenance.
     */
    async compare(): Promise<ImageInventoryComparison> {
        const [cloudFiles, databaseFiles] = await Promise.all([this.cloudImages(), this.databaseImages()]);
        const known = new Set(databaseFiles);
        const present = new Set(cloudFiles);

        const cloudOnly = cloudFiles.filter((file) => !known.has(isThumbnailFileName(file) ? originalFileName(file) : file));
        const databaseOnly = databaseFiles.filter((file) => !present.has(file));

        return { cloudOnly, databaseOnly };
    }
}

function sortUnique(values: string[]): string[] {
    return [...new Set(values)].sort();
}
