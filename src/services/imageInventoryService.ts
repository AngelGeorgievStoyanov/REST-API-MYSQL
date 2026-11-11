import { toAdminCursorPageDto, toAdminPageDto } from '../mappers/adminMapper';
import { toImageDto } from '../mappers/imageMapper';
import { toImageInventoryComparison } from '../mappers/imageInventoryMapper';
import { type AdminPage } from '../model/admin';
import {
  type GenerateThumbnailsResponse,
  type ImageInventoryComparison,
  type MissingThumbnailPageDto,
} from '../model/image';
import { type ImageRepository } from '../repositories/imageRepository';
import { BUCKET_NAME } from '../constants/imageStorage';
import { type ImageInventoryStorage, thumbnailFileName } from '../storage/imageFileStorage';
import { parseAdminPagination } from '../utils/adminPagination';
import { getImageBaseUrl } from '../utils/image';

/** The difference between the flat GCS bucket and the `images` table. */

export class ImageInventoryService {
  constructor(
    private readonly images: ImageRepository,
    private readonly storage: ImageInventoryStorage,
  ) {}

  /**
   * Scan database rows in stable batches and return only rows whose original
   * object exists in GCS while the derived thumbnail sidecar is absent.
   * Pagination applies to the filtered result, not the raw database rows.
   */
  async missingThumbnails(query: unknown): Promise<MissingThumbnailPageDto> {
    const pagination = parseAdminPagination(query);
    const pageStart = (pagination.page - 1) * pagination.pageSize;
    const targetCount = pageStart + pagination.pageSize + 1;
    const scanBatchSize = 100;
    const baseUrl = getImageBaseUrl();
    const missing: Array<{ id: number; filePath: string }> = [];
    let skip = 0;
    let databaseHasMore = true;

    while (missing.length < targetCount && databaseHasMore) {
      const rows = await this.images.listImageRecordsPage(skip, scanBatchSize);
      databaseHasMore = rows.length === scanBatchSize;
      skip += rows.length;
      // Limit concurrent GCS metadata requests; scanning 100 DB rows must not
      // fan out into 200 simultaneous storage requests.
      for (let index = 0; index < rows.length; index += 10) {
        const batch = rows.slice(index, index + 10);
        // eslint-disable-next-line no-await-in-loop -- process small GCS batches sequentially to cap request concurrency.
        const checks = await Promise.all(batch.map(async (row) => {
          const objectPath = toStorageObjectPath(row.filePath, baseUrl);
          if (!objectPath) return null;
          const [originalExists, thumbnailExists] = await Promise.all([
            this.storage.exists(objectPath),
            this.storage.exists(thumbnailFileName(objectPath)),
          ]);
          return originalExists && !thumbnailExists ? row : null;
        }));
        for (const row of checks) if (row) missing.push(row);
        if (missing.length >= targetCount) break;
      }
      if (rows.length === 0) databaseHasMore = false;
    }

    const selected = missing.slice(pageStart, pageStart + pagination.pageSize);
    return {
      items: selected.map((row) => toImageDto(row, baseUrl)),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        hasNext: missing.length > pageStart + pagination.pageSize,
      },
    };
  }

  /** Generates thumbnails only for explicitly selected database image IDs. */
  async generateThumbnails(ids: number[]): Promise<GenerateThumbnailsResponse> {
    const rows = await this.images.findByIds(ids);
    const byId = new Map<number, (typeof rows)[number]>(
      rows.map((row) => [row.id, row] as const),
    );
    const results: GenerateThumbnailsResponse['results'] = [];

    for (const imageId of ids) {
      const row = byId.get(imageId);
      if (!row) {
        results.push({ imageId, status: 'not_found' });
        continue;
      }
      try {
        const objectPath = toStorageObjectPath(row.filePath, getImageBaseUrl());
        // eslint-disable-next-line no-await-in-loop -- sequential generation keeps memory and GCS load bounded.
        const status = objectPath
          ? await this.storage.generateThumbnail(objectPath)
          : 'original_missing';
        results.push({ imageId, status });
      } catch {
        results.push({ imageId, status: 'failed' });
      }
    }

    const count = (status: GenerateThumbnailsResponse['results'][number]['status']) =>
      results.filter((result) => result.status === status).length;

    return {
      results,
      summary: {
        generated: count('generated'),
        alreadyExists: count('already_exists'),
        originalMissing: count('original_missing'),
        notFound: count('not_found'),
        failed: count('failed'),
      },
    };
  }

  async cloudImages(query: unknown): Promise<AdminPage<string>> {
    const pagination = parseAdminPagination(query);
    const page = await this.storage.listPage(pagination.page, pagination.pageSize);

    return toAdminCursorPageDto(
      sortUnique(page.items),
      pagination.page,
      pagination.pageSize,
      page.hasNext,
    );
  }

  async databaseImages(query: unknown): Promise<AdminPage<string>> {
    const pagination = parseAdminPagination(query);
    const [items, total] = await Promise.all([
      this.images.listFilePathsPage(pagination.skip, pagination.pageSize),
      this.images.countImages(),
    ]);

    return toAdminPageDto(items, total, pagination.page, pagination.pageSize);
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
    const expectedCloudPaths = new Set(
      referencedPaths.flatMap((filePath) => [filePath, thumbnailFileName(filePath)]),
    );
    const databasePresence = await Promise.all(
      databaseFiles.map((filePath) => this.storage.exists(filePath)),
    );

    return toImageInventoryComparison({
      cloudOnly: cloudPage.items.filter((file) => !expectedCloudPaths.has(file)),
      databaseOnly: databaseFiles.filter((_file, index) => !databasePresence[index]),
      page: pagination.page,
      pageSize: pagination.pageSize,
      cloudHasNext: cloudPage.hasNext,
      databaseHasNext: pagination.skip + databaseFiles.length < databaseTotal,
      databaseTotal,
    });
  }
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}


/**
 * Older rows may contain the public GCS URL instead of the object name.
 * Resolve only URLs that belong to this configured image base URL or the
 * canonical Google Cloud Storage host for this bucket; never fetch arbitrary URLs.
 */
function toStorageObjectPath(filePath: string, baseUrl: string | null): string | null {
  if (!/^https?:\/\//i.test(filePath)) return filePath;

  if (baseUrl && filePath.startsWith(`${baseUrl}/`)) {
    return filePath.slice(baseUrl.length + 1);
  }

  try {
    const url = new URL(filePath);
    if (url.hostname === 'storage.googleapis.com') {
      const prefix = `/${BUCKET_NAME}/`;
      return url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : null;
    }
    if (url.hostname === `${BUCKET_NAME}.storage.googleapis.com`) {
      return url.pathname.replace(/^\//, '');
    }
  } catch {
    return null;
  }

  return null;
}
