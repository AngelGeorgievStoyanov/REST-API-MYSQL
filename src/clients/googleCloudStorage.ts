import { Storage } from '@google-cloud/storage';
import { StorageEngine } from 'multer';
import { randomUUID } from 'crypto';
import path from 'path';
import sharp from 'sharp';

import {
    IMAGE_THUMBNAIL,
    STORAGE_MAX_RETRIES,
    STORAGE_TOTAL_TIMEOUT,
} from '../constants/imageStorage';
import { thumbnailFileName } from '../storage/imageFileStorage';
import { assertAcceptedImage, ImageObjectAlreadyExistsError } from '../storage/imageValidation';

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
        void this.storeFile(file, callback).catch((error: unknown) => callback(toError(error)));
    }

    private async storeFile(
        file: UploadedFile,
        callback: (error?: Error | null, info?: Partial<UploadedFile>) => void,
    ): Promise<void> {
        const chunks: Buffer[] = [];
        for await (const chunk of file.stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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

            callback(null, { destination, size: sanitizedBuffer.length });
        } catch (error) {
            await Promise.all(createdObjects.map((objectName) => this.removeObject(objectName).catch((cleanupError: unknown) => {
                console.log(`[images] could not remove failed upload object "${objectName}": ${toError(cleanupError).message}`);
            })));
            callback(toError(error));
        }
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

async function sanitizeImage(
    buffer: Buffer,
    format: typeof import('../constants/imageStorage').ALLOWED_IMAGE_FORMATS[number],
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