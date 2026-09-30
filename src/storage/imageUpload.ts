import multer, { MulterError, StorageEngine } from 'multer';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { MAX_UPLOAD_BYTES, UPLOAD_FIELD_NAME } from '../constants/imageStorage';
import { ApiError } from '../utils/apiError';

let uploadSingleFile: RequestHandler | null = null;

/**
 * The storage engine is loaded on the first upload only: it pulls in the native
 * `sharp` dependency, which the rest of the API must not need just to boot.
 */
function getUploadMiddleware(): RequestHandler {
    if (!uploadSingleFile) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { storage } = require('./storageConfig') as { storage: StorageEngine };
        uploadSingleFile = multer({ storage, limits: { fileSize: MAX_UPLOAD_BYTES } }).single(UPLOAD_FIELD_NAME);
    }
    return uploadSingleFile;
}

/**
 * Uploads exactly one image through the shared GCS storage engine. Multer
 * failures (size, unexpected field) are turned into the API validation error
 * instead of an unmapped 500.
 */
export function imageUpload(req: Request, res: Response, next: NextFunction): void {
    getUploadMiddleware()(req, res, (error: unknown) => {
        if (error instanceof MulterError) {
            next(ApiError.validation(`Image upload failed: ${error.message}.`));
            return;
        }
        next(error ?? undefined);
    });
}

/** The storage engine reports the stored object name as `destination`. */
export function uploadedFileName(req: Request): string {
    const file = req.file as unknown as { destination?: unknown } | undefined;

    if (!file || typeof file.destination !== 'string' || file.destination.length === 0) {
        throw ApiError.validation(`An image file is required in the "${UPLOAD_FIELD_NAME}" field.`);
    }
    return file.destination;
}
