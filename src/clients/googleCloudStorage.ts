import { Storage } from '@google-cloud/storage';
import { Request } from 'express';
import { StorageEngine } from 'multer';
import path from 'path';
import sharp from 'sharp';

import {
    STORAGE_MAX_RETRIES,
    STORAGE_TOTAL_TIMEOUT,
} from '../constants/common';

const KEY_FILENAME = path.join(
    __dirname,
    '../utils/hack-trip-414441f1b5d4.json'
);

/**
 * Central Google Cloud Storage client.
 *
 * This is the ONLY place in the codebase that creates `new Storage(...)`.
 * All storage consumers (imageStorage, storageConfig, controllers) must
 * reuse this instance instead of creating their own clients.
 */
export const gcsClient = new Storage({
    keyFilename: KEY_FILENAME,
    retryOptions: {
        autoRetry: true,
        maxRetries: STORAGE_MAX_RETRIES,
        totalTimeout: STORAGE_TOTAL_TIMEOUT,
    },
});

type UploadedFile = Parameters<StorageEngine['_handleFile']>[1];
const THUMBNAIL_WIDTH = 800;
const THUMBNAIL_HEIGHT = 600;
const THUMBNAIL_QUALITY = 80;
const THUMBNAIL_FIT = 'inside';

interface GoogleCloudStorageOptions {
    bucketName: string;
    generateThumbnail?: boolean;
    destination: (
        req: Request,
        file: UploadedFile,
        callback: (error: Error | null, destination: string) => void
    ) => void;
}

/**
 * Custom Multer StorageEngine backed by the central GCS client.
 *
 * It does not create its own GCS client; it reuses `gcsClient`.
 */
export class GoogleCloudStorage implements StorageEngine {
    private readonly selectedBucket;
    private readonly destination: GoogleCloudStorageOptions['destination'];
    private readonly generateThumbnail: boolean;

    constructor(options: GoogleCloudStorageOptions) {
        const {
            bucketName,
            destination,
            generateThumbnail = false,
        } = options;

        this.selectedBucket = gcsClient.bucket(bucketName);
        this.destination = destination;
        this.generateThumbnail = generateThumbnail;
    }

    _handleFile(
        req: Request,
        file: UploadedFile,
        callback: (
            error?: Error | null,
            info?: Partial<UploadedFile>
        ) => void
    ): void {
        try {
            this.destination(req, file, async (destinationError, destination) => {
                if (destinationError) {
                    callback(destinationError);
                    return;
                }

                try {
                    const chunks: Buffer[] = [];

                    for await (const chunk of file.stream) {
                        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                    }

                    const fileBuffer = Buffer.concat(chunks);

                    const bucketFile = this.selectedBucket.file(destination);

                    await bucketFile.save(fileBuffer);

                    if (this.generateThumbnail) {
                        const thumbnailBuffer = await sharp(fileBuffer)
                            .resize({
                                width: THUMBNAIL_WIDTH,
                                height: THUMBNAIL_HEIGHT,
                                fit: THUMBNAIL_FIT,
                                withoutEnlargement: true,
                            })
                            .webp({
                                quality: THUMBNAIL_QUALITY,
                            })
                            .toBuffer();

                        const extensionIndex = destination.lastIndexOf('.');
                        const thumbnailDestination =
                            extensionIndex > -1
                                ? `${destination.substring(
                                    0,
                                    extensionIndex
                                )}_thumb.webp`
                                : `${destination}_thumb.webp`;

                        const thumbnailFile =
                            this.selectedBucket.file(thumbnailDestination);

                        await thumbnailFile.save(thumbnailBuffer, {
                            metadata: {
                                contentType: 'image/webp',
                            },
                        });
                    }

                    callback(null, {
                        destination,
                        size: fileBuffer.length,
                    });
                } catch (error) {
                    callback(error as Error);
                }
            });
        } catch (error) {
            callback(error as Error);
        }
    }

    _removeFile(
        _req: Request,
        file: UploadedFile,
        callback: (error: Error | null) => void
    ): void {
        const destination = file.destination;

        if (!destination) {
            callback(null);
            return;
        }

        const bucketFile = this.selectedBucket.file(destination);

        bucketFile
            .exists()
            .then(([exists]) =>
                exists ? bucketFile.delete() : undefined
            )
            .then(() => callback(null))
            .catch((error: Error) => callback(error));
    }
}