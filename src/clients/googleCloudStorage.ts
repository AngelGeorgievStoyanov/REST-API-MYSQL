import { Storage } from '@google-cloud/storage';
import { Request } from 'express';
import { StorageEngine } from 'multer';
import path from 'path';
import sharp from 'sharp';

import {
    IMAGE_THUMBNAIL,
    STORAGE_MAX_RETRIES,
    STORAGE_TOTAL_TIMEOUT,
} from '../constants/imageStorage';
import { thumbnailFileName } from '../storage/imageFileStorage';
import { assertAcceptedImage } from '../storage/imageValidation';

const KEY_FILENAME = path.join(
    __dirname,
    '../utils/hack-trip-414441f1b5d4.json'
);

export const gcsClient = new Storage({
    keyFilename: KEY_FILENAME,
    retryOptions: {
        autoRetry: true,
        maxRetries: STORAGE_MAX_RETRIES,
        totalTimeout: STORAGE_TOTAL_TIMEOUT,
    },
});

type UploadedFile = Parameters<StorageEngine['_handleFile']>[1];

interface GoogleCloudStorageOptions {
    bucketName: string;
    generateThumbnail?: boolean;
    destination: (
        req: Request,
        file: UploadedFile,
        callback: (error: Error | null, destination: string) => void
    ) => void;
}

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

                    // The bytes decide the format, and an unsupported file must never
                    // reach the bucket: validation happens before the upload.
                    await assertAcceptedImage(fileBuffer, file);

                    const bucketFile = this.selectedBucket.file(destination);

                    await bucketFile.save(fileBuffer);

                    if (this.generateThumbnail) {
                        const thumbnailBuffer = await sharp(fileBuffer)
                            .resize({
                                width: IMAGE_THUMBNAIL.width,
                                height: IMAGE_THUMBNAIL.height,
                                fit: IMAGE_THUMBNAIL.fit,
                                withoutEnlargement: true,
                            })
                            .webp({
                                quality: IMAGE_THUMBNAIL.quality,
                            })
                            .toBuffer();

                        const thumbnailDestination = thumbnailFileName(destination);

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

        // The thumbnail sidecar belongs to its original: a rejected request must
        // not leave the generated thumbnail behind as an orphan object.
        const objectNames = this.generateThumbnail
            ? [destination, thumbnailFileName(destination)]
            : [destination];

        Promise.all(objectNames.map((objectName) => this.removeObject(objectName)))
            .then(() => callback(null))
            .catch((error: Error) => callback(error));
    }

    private async removeObject(objectName: string): Promise<void> {
        const bucketFile = this.selectedBucket.file(objectName);
        const [exists] = await bucketFile.exists();

        if (exists) await bucketFile.delete();
    }
}