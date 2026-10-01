import { AdminPage } from '../model/admin';
import { ImageRepository } from '../repositories/imageRepository';
import { ImageInventoryStorage, thumbnailFileName } from '../storage/imageFileStorage';
import { parseAdminPagination, adminPage } from '../utils/adminPagination';

/** The difference between the flat GCS bucket and the `images` table. */
export interface ImageInventoryComparison {
    /** Objects present in GCS that no `images` row references — orphaned uploads. */
    cloudOnly: string[];
    /** `images` rows whose file is missing from GCS. */
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

export class ImageInventoryService {
    constructor(private readonly images: ImageRepository, private readonly storage: ImageInventoryStorage) { }

    async cloudImages(query: unknown): Promise<AdminPage<string>> {
        const pagination = parseAdminPagination(query);
        const page = await this.storage.listPage(pagination.page, pagination.pageSize);

        return {
            items: sortUnique(page.items),
            pagination: { page: pagination.page, pageSize: pagination.pageSize, hasNext: page.hasNext },
        };
    }

    async databaseImages(query: unknown): Promise<AdminPage<string>> {
        const pagination = parseAdminPagination(query);
        const [items, total] = await Promise.all([
            this.images.listFilePathsPage(pagination.skip, pagination.pageSize),
            this.images.countImages(),
        ]);

        return adminPage(items, total, pagination.page, pagination.pageSize);
    }

    /**
     * A thumbnail is a sidecar of its original, so only the original has to be
     * referenced by a row: the objects a healthy store may hold are the referenced
     * files plus their thumbnails. Anything else in the bucket is an orphan.
     */
    async compare(query: unknown): Promise<ImageInventoryComparison> {
        const pagination = parseAdminPagination(query);
        const [cloudPage, databaseFiles, databaseTotal] = await Promise.all([
            this.storage.listPage(pagination.page, pagination.pageSize),
            this.images.listFilePathsPage(pagination.skip, pagination.pageSize),
            this.images.countImages(),
        ]);
        const referencedPaths = await this.images.findPathsForCloudObjects(cloudPage.items);
        const expectedCloudPaths = new Set(referencedPaths.flatMap((filePath) => [
            filePath,
            thumbnailFileName(filePath),
        ]));
        const databasePresence = await Promise.all(databaseFiles.map((filePath) => this.storage.exists(filePath)));

        return {
            cloudOnly: cloudPage.items.filter((file) => !expectedCloudPaths.has(file)),
            databaseOnly: databaseFiles.filter((_file, index) => !databasePresence[index]),
            pagination: {
                page: pagination.page,
                pageSize: pagination.pageSize,
                cloudHasNext: cloudPage.hasNext,
                databaseHasNext: pagination.skip + databaseFiles.length < databaseTotal,
                databaseTotal,
                databaseTotalPages: databaseTotal === 0 ? 0 : Math.ceil(databaseTotal / pagination.pageSize),
            },
        };
    }
}

function sortUnique(values: string[]): string[] {
    return [...new Set(values)].sort();
}
