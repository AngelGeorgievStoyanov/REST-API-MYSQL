import { Storage } from '@google-cloud/storage';
import { type StorageEngine } from 'multer';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { performance } from 'node:perf_hooks';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    IMAGE_THUMBNAIL,
    STORAGE_MAX_RETRIES,
    STORAGE_TOTAL_TIMEOUT,
    type AllowedImageFormat,
} from '../constants/imageStorage';
import { thumbnailFileName } from '../storage/imageFileStorage';
import { assertAcceptedImage, ImageObjectAlreadyExistsError } from '../storage/imageValidation';

/**
 * Prefer an explicitly configured service-account file. For local development,
 * fall back to the ignored key file in src/utils when it exists. On deployments
 * without that local file, the Google client uses Application Default Credentials.
 */
const localCredentialsPath = resolve(process.cwd(), 'src/utils/hack-trip-414441f1b5d4.json');
const credentialsPath = process.env['GOOGLE_APPLICATION_CREDENTIALS']?.trim()
    || (existsSync(localCredentialsPath) ? localCredentialsPath : undefined);

export const gcsClient = new Storage({
    ...(credentialsPath ? { keyFilename: credentialsPath } : {}),
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

        const startedAt = performance.now();
        void (async () => {
            try {
                const info = await this.processFile(file);
                logImageTiming('upload.completed', startedAt, {
                    inputBytes: file.size,
                    storedBytes: info.size,
                    outcome: 'success',
                });
                handleResult(null, info);
            } catch (error: unknown) {
                logImageTiming('upload.failed', startedAt, {
                    inputBytes: file.size,
                    outcome: 'failure',
                    ...errorLogDetails(error),
                });
                handleResult(toError(error));
            }
        })();
    }

    private async processFile(file: UploadedFile): Promise<Partial<UploadedFile>> {
        let stageStartedAt = performance.now();
        const chunks: Buffer[] = [];
        for await (const chunk of file.stream as unknown as AsyncIterable<Buffer>) {
            chunks.push(toBuffer(chunk));
        }

        const uploadedBuffer = Buffer.concat(chunks);
        logImageTiming('stream.read', stageStartedAt, { inputBytes: uploadedBuffer.length });

        stageStartedAt = performance.now();
        const format = await assertAcceptedImage(uploadedBuffer, file);
        logImageTiming('image.validation', stageStartedAt, { inputBytes: uploadedBuffer.length, format });

        stageStartedAt = performance.now();
        const sanitizedBuffer = await sanitizeImage(uploadedBuffer, format);
        const inputBytes = uploadedBuffer.length;
        const outputBytes = sanitizedBuffer.length;
        const sizeChangeBytes = outputBytes - inputBytes;
        const sizeChangePercent = inputBytes === 0
            ? null
            : Number(((sizeChangeBytes / inputBytes) * 100).toFixed(2));
        logImageTiming('image.sanitize', stageStartedAt, {
            format,
            inputBytes,
            outputBytes,
            sizeChangeBytes,
            sizeChangePercent,
            sizeResult: sizeChangeBytes < 0 ? 'smaller' : sizeChangeBytes > 0 ? 'larger' : 'unchanged',
        });
        const extension = format === 'jpeg' ? 'jpg' : format;
        const destination = `images/${randomUUID()}.${extension}`;
        const createdObjects: string[] = [];

        try {
            if (this.generateThumbnail) {
                const thumbnailStartedAt = performance.now();
                const thumbnailBuffer = await sharp(sanitizedBuffer)
                    .resize({
                        width: IMAGE_THUMBNAIL.width,
                        height: IMAGE_THUMBNAIL.height,
                        fit: IMAGE_THUMBNAIL.fit,
                        withoutEnlargement: true,
                    })
                    .webp({ quality: IMAGE_THUMBNAIL.quality })
                    .toBuffer();
                logImageTiming('thumbnail.generate', thumbnailStartedAt, {
                    bytes: thumbnailBuffer.length,
                    width: IMAGE_THUMBNAIL.width,
                    height: IMAGE_THUMBNAIL.height,
                });

                const thumbnailDestination = thumbnailFileName(destination);
                const originalStartedAt = performance.now();
                const thumbnailUploadStartedAt = performance.now();
                const uploadResults = await Promise.allSettled([
                    this.saveCreateOnly(destination, sanitizedBuffer, `image/${format}`),
                    this.saveCreateOnly(thumbnailDestination, thumbnailBuffer, 'image/webp'),
                ]);

                if (uploadResults[0].status === 'fulfilled') {
                    createdObjects.push(destination);
                    logImageTiming('gcs.original.upload', originalStartedAt, { bytes: sanitizedBuffer.length, format });
                }
                if (uploadResults[1].status === 'fulfilled') {
                    createdObjects.push(thumbnailDestination);
                    logImageTiming('gcs.thumbnail.upload', thumbnailUploadStartedAt, { bytes: thumbnailBuffer.length });
                }

                const failedUpload = uploadResults.find((result) => result.status === 'rejected');
                if (failedUpload?.status === 'rejected') throw failedUpload.reason;
            } else {
                stageStartedAt = performance.now();
                await this.saveCreateOnly(destination, sanitizedBuffer, `image/${format}`);
                logImageTiming('gcs.original.upload', stageStartedAt, { bytes: sanitizedBuffer.length, format });
                createdObjects.push(destination);
            }
        } catch (error) {
            await Promise.all(createdObjects.map((objectName) => this.removeObject(objectName).catch((cleanupError: unknown) => {
                console.error(`[images] ${JSON.stringify({
                    event: 'upload.cleanup.failed',
                    objectName,
                    ...errorLogDetails(cleanupError),
                })}`);
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

function errorLogDetails(error: unknown): Record<string, unknown> {
    if (typeof error !== 'object' || error === null) {
        return { errorName: 'UnknownError', errorMessage: String(error).slice(0, 300) };
    }

    const readString = (key: string): string | undefined => {
        const value = Reflect.get(error, key);
        return typeof value === 'string' || typeof value === 'number'
            ? String(value).slice(0, 300)
            : undefined;
    };

    return {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message.slice(0, 300) : readString('message'),
        errorCode: readString('code'),
        errorStatus: readString('status') ?? readString('statusCode'),
    };
}

async function sanitizeImage(
    buffer: Buffer,
    format: AllowedImageFormat,
): Promise<Buffer> {
    const image = sharp(buffer, { animated: format === 'gif' }).rotate();

    switch (format) {
        case 'jpeg':
            return image.jpeg({ quality: 88, chromaSubsampling: '4:2:0' }).toBuffer();
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
/** Emits stage durations without logging filenames, image contents or credentials. */
function logImageTiming(stage: string, startedAt: number, details: Record<string, unknown> = {}): void {
    console.info(`[images] ${JSON.stringify({ event: stage, durationMs: Math.round(performance.now() - startedAt), ...details })}`);
}
