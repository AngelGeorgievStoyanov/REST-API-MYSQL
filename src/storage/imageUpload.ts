import multer, { MulterError, type StorageEngine } from 'multer';
import { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { IMAGE_UPLOAD_LIMITS, UPLOAD_FIELD_NAME } from '../constants/imageStorage';
import { ImageObjectAlreadyExistsError, UnsupportedImageError } from './imageValidation';
import { ApiError } from '../utils/apiError';
import { performance } from 'node:perf_hooks';

let uploadSingleFile: RequestHandler | null = null;

/**
 * The storage engine is loaded on the first upload only: it pulls in the native
 * `sharp` dependency, which the rest of the API must not need just to boot.
 */
function getUploadMiddleware(): RequestHandler {
    if (!uploadSingleFile) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { storage } = require('./storageConfig') as { storage: StorageEngine };
        uploadSingleFile = multer({ storage, limits: IMAGE_UPLOAD_LIMITS }).single(UPLOAD_FIELD_NAME);
    }
    return uploadSingleFile;
}

/**
 * Uploads exactly one image through the shared GCS storage engine. Multer
 * failures (size, unexpected field) and unsupported files are turned into the API
 * validation error instead of an unmapped 500.
 */
export function imageUpload(req: Request, res: Response, next: NextFunction): void {
    const startedAt = performance.now();
    getUploadMiddleware()(req, res, (error: unknown) => {
            console.info(`[images] ${JSON.stringify({
                event: error ? 'upload.middleware.failed' : 'upload.middleware.completed',
                durationMs: Math.round(performance.now() - startedAt),
                inputBytes: req.file?.size,
                ...imageUploadErrorDetails(error),
            })}`);
            if (error instanceof MulterError) {
                next(ApiError.validation(`Image upload failed: ${error.message}.`));
                return;
            }

            if (error instanceof UnsupportedImageError) {
                next(ApiError.validation(`Image upload failed: ${error.message}`));
                return;
            }

            if (error instanceof ImageObjectAlreadyExistsError) {
                next(ApiError.conflict('The image could not be stored because its generated key already exists.'));
                return;
            }

            next(error ?? undefined);
        });
}

function imageUploadErrorDetails(error: unknown): Record<string, unknown> {
    // Successful middleware completion has no error; do not log it as UnknownError.
    if (error === undefined || error === null) return {};

    if (typeof error !== 'object') {
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

/** The storage engine reports the stored object name as `destination`. */
export function uploadedFileName(req: Request): string {
    const file = req.file as unknown as { destination?: unknown } | undefined;

    if (!file || typeof file.destination !== 'string' || file.destination.length === 0) {
        throw ApiError.validation(`An image file is required in the "${UPLOAD_FIELD_NAME}" field.`);
    }
    return file.destination;
}
