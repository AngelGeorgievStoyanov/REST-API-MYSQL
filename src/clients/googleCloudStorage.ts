import { Storage } from '@google-cloud/storage';
import { type StorageEngine } from 'multer';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

import {
    IMAGE_THUMBNAIL,
    STORAGE_MAX_RETRIES,
    STORAGE_TOTAL_TIMEOUT,
    type AllowedImageFormat,
} from '../constants/imageStorage';
import { thumbnailFileName } from '../storage/imageFileStorage';
import { assertAcceptedImage, ImageObjectAlreadyExistsError } from '../storage/imageValidation';

/**
 * Credentials come from the Google Application Default Credentials chain, never
 * from a path in the source tree: `GOOGLE_APPLICATION_CREDENTIALS` may point at
 * a service-account key file anywhere on the deployment machine, a `gcloud` login
 * or the deployment's own identity. The key file's location is therefore machine
 * configuration only, and no credential path or filename exists in the source.
 */
export const gcsClient = new Storage({
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
}

export class GoogleCloudStorage implements StorageEngine {
    private readonly selectedBucket;
    private readonly generateThumbnail: boolean;

    constructor(options: GoogleCloudStorageOptions) {
        const {
            bucketName,
            generateThumbnail = false,
        } = options;

        this.selectedBucket = gcsClient.bucket(bucketName);
        this.generateThumbnail = generateThumbnail;
    }

    _handleFile(
        _req: Parameters<StorageEngine['_handleFile']>[0],
        file: UploadedFile,
        callback: (
            error?: Error | null,
            info?: Partial<UploadedFile>
        ) => void
    ): void {
        let called = false;

        const handleResult = (error?: Error | null, info?: Partial<UploadedFile>): void => {
            if (called) return;
            called = true;
            callback(error, info);
        };

        void (async () => {
            try {
                const info = await this.processFile(file);
                handleResult(null, info);
            } catch (error: unknown) {
                handleResult(toError(error));
            }
        })();
    }

    private async processFile(file: UploadedFile): Promise<Partial<UploadedFile>> {
        const chunks: Buffer[] = [];
        for await (const chunk of file.stream as unknown as AsyncIterable<Buffer>) {
            chunks.push(toBuffer(chunk));
        }

        const uploadedBuffer = Buffer.concat(chunks);
        const format = await assertAcceptedImage(uploadedBuffer, file);
        const sanitizedBuffer = await sanitizeImage(uploadedBuffer, format);
        const extension = format === 'jpeg' ? 'jpg' : format;
        const destination = `images/${randomUUID()}.${extension}`;
        const createdObjects: string[] = [];

        try {
            await this.saveCreateOnly(destination, sanitizedBuffer, `image/${format}`);
            createdObjects.push(destination);

            if (this.generateThumbnail) {
                const thumbnailBuffer = await sharp(sanitizedBuffer)
                    .resize({
                        width: IMAGE_THUMBNAIL.width,
                        height: IMAGE_THUMBNAIL.height,
                        fit: IMAGE_THUMBNAIL.fit,
                        withoutEnlargement: true,
                    })
                    .webp({ quality: IMAGE_THUMBNAIL.quality })
                    .toBuffer();
                const thumbnailDestination = thumbnailFileName(destination);
                await this.saveCreateOnly(thumbnailDestination, thumbnailBuffer, 'image/webp');
                createdObjects.push(thumbnailDestination);
            }
        } catch (error) {
            await Promise.all(createdObjects.map((objectName) => this.removeObject(objectName).catch((cleanupError: unknown) => {
                console.log(`[images] could not remove failed upload object "${objectName}": ${toError(cleanupError).message}`);
            })));
            throw error;
        }

        return { destination, size: sanitizedBuffer.length };
    }

    private async saveCreateOnly(objectName: string, data: Buffer, contentType: string): Promise<void> {
        try {
            await this.selectedBucket.file(objectName).save(data, {
                preconditionOpts: { ifGenerationMatch: 0 },
                metadata: { contentType },
            });
        } catch (error) {
            if (isPreconditionFailure(error)) throw new ImageObjectAlreadyExistsError();
            throw error;
        }
    }

    _removeFile(
        _req: Parameters<StorageEngine['_removeFile']>[0],
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

        void this.removeFiles(objectNames, callback);
    }

    private async removeFiles(objectNames: string[], callback: (error: Error | null) => void): Promise<void> {
        let called = false;

        const handleResult = (error: Error | null): void => {
            if (called) return;
            called = true;
            callback(error);
        };

        try {
            await Promise.all(objectNames.map((objectName) => this.removeObject(objectName)));
            handleResult(null);
        } catch (error: unknown) {
            handleResult(toError(error));
        }
    }

    private async removeObject(objectName: string): Promise<void> {
        const bucketFile = this.selectedBucket.file(objectName);
        const [exists] = await bucketFile.exists();

        if (exists) await bucketFile.delete();
    }
}

async function sanitizeImage(
    buffer: Buffer,
    format: AllowedImageFormat,
): Promise<Buffer> {
    const image = sharp(buffer, { animated: format === 'gif' }).rotate();

    switch (format) {
        case 'jpeg':
            return image.jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
        case 'png':
            return image.png().toBuffer();
        case 'webp':
            return image.webp({ quality: 100, lossless: true }).toBuffer();
        case 'gif':
            return image.gif().toBuffer();
    }
}

function isPreconditionFailure(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    return Number(Reflect.get(error, 'code')) === 412;
}

function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error('Image storage operation failed.');
}

function toBuffer(chunk: Buffer): Buffer {
    return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
}