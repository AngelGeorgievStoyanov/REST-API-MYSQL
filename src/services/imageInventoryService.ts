import { ImageRepository } from '../repositories/imageRepository';
import { ImageFileStorage, thumbnailFileName } from '../storage/imageFileStorage';

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
     * A thumbnail is a sidecar of its original, so only the original has to be
     * referenced by a row: the objects a healthy store may hold are the referenced
     * files plus their thumbnails. Anything else in the bucket is an orphan.
     */
    async compare(): Promise<ImageInventoryComparison> {
        const [cloudFiles, databaseFiles] = await Promise.all([this.cloudImages(), this.databaseImages()]);

        const expected = new Set<string>();
        for (const filePath of databaseFiles) {
            expected.add(filePath);
            expected.add(thumbnailFileName(filePath));
        }

        const present = new Set(cloudFiles);
        const cloudOnly = cloudFiles.filter((file) => !expected.has(file));
        const databaseOnly = databaseFiles.filter((file) => !present.has(file));

        return { cloudOnly, databaseOnly };
    }
}

function sortUnique(values: string[]): string[] {
    return [...new Set(values)].sort();
}
