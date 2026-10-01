import path from 'path';
import sharp from 'sharp';
import { ALLOWED_IMAGE_EXTENSIONS, ALLOWED_IMAGE_FORMATS, ALLOWED_IMAGE_MIME_TYPES } from '../constants/imageStorage';

/**
 * A file the upload pipeline refuses. It is a client error, so the upload
 * middleware maps it to the API validation contract instead of a 500.
 */
export class UnsupportedImageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnsupportedImageError';
    }
}

/** Declared properties of the uploaded part, as reported by the multipart parser. */
export interface UploadedFileFacts {
    mimetype: string;
    originalname: string;
}

/**
 * Accepts a file only when its declared type, its extension and the format
 * actually decoded from its bytes are all in the accepted set. The bytes decide:
 * `Content-Type` and the file name come from the client and are only a first gate.
 *
 * It runs on the buffered upload, before the object is stored, so an unsupported
 * file never reaches GCS.
 */
export async function assertAcceptedImage(fileBuffer: Buffer, file: UploadedFileFacts): Promise<void> {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!(ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(extension)) {
        throw new UnsupportedImageError(`Unsupported file extension "${extension || file.originalname}".`);
    }

    const declaredType = file.mimetype.split(';')[0].trim().toLowerCase();
    if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(declaredType)) {
        throw new UnsupportedImageError(`Unsupported content type "${file.mimetype}".`);
    }

    const format = await decodeFormat(fileBuffer);
    if (!(ALLOWED_IMAGE_FORMATS as readonly string[]).includes(format)) {
        throw new UnsupportedImageError(`Unsupported image format "${format}".`);
    }
}

/** The format of the actual bytes; anything undecodable is refused. */
async function decodeFormat(fileBuffer: Buffer): Promise<string> {
    try {
        const metadata = await sharp(fileBuffer).metadata();
        return metadata.format ?? 'unknown';
    } catch {
        throw new UnsupportedImageError('The uploaded file is not a readable image.');
    }
}
