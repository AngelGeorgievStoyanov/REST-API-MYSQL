import path from 'path';
import sharp from 'sharp';
import {
    ALLOWED_IMAGE_EXTENSIONS,
    ALLOWED_IMAGE_FORMATS,
    ALLOWED_IMAGE_MIME_TYPES,
    MAX_IMAGE_HEIGHT,
    MAX_IMAGE_PIXELS,
    MAX_IMAGE_WIDTH,
} from '../constants/imageStorage';

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

export class ImageObjectAlreadyExistsError extends Error {
    constructor() {
        super('The generated image object already exists.');
        this.name = 'ImageObjectAlreadyExistsError';
    }
}

/** Declared properties of the uploaded part, as reported by the multipart parser. */
export interface UploadedFileFacts {
    mimetype: string;
    originalname: string;
}

/** Header facts of the decoded bytes: what the file really is and how large. */
interface DecodedImageFacts {
    format: string;
    width: number | undefined;
    height: number | undefined;
    /** Frames of a multi-page/animated image; every frame shares the pixel budget. */
    pages: number | undefined;
}

/**
 * Accepts a file only when its declared type, its extension and the format
 * actually decoded from its bytes are all in the accepted set, and when its
 * decoded dimensions stay inside the documented size ceilings. The bytes decide:
 * `Content-Type` and the file name come from the client and are only a first gate.
 *
 * It runs on the buffered upload, before the object is stored, so an unsupported
 * or oversized file never reaches GCS and never pays for a re-encode.
 */
export async function assertAcceptedImage(
    fileBuffer: Buffer,
    file: UploadedFileFacts,
): Promise<typeof ALLOWED_IMAGE_FORMATS[number]> {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!(ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(extension)) {
        throw new UnsupportedImageError(`Unsupported file extension "${extension || file.originalname}".`);
    }

    const declaredType = (file.mimetype.split(';')[0] ?? '').trim().toLowerCase();
    if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(declaredType)) {
        throw new UnsupportedImageError(`Unsupported content type "${file.mimetype}".`);
    }

    const decoded = await decodeFacts(fileBuffer);
    if (!(ALLOWED_IMAGE_FORMATS as readonly string[]).includes(decoded.format)) {
        throw new UnsupportedImageError(`Unsupported image format "${decoded.format}".`);
    }

    assertAcceptedDimensions(decoded);

    return decoded.format as typeof ALLOWED_IMAGE_FORMATS[number];
}

/**
 * Size ceiling of one upload, checked on the header of the buffered file. It is
 * deliberately part of the same pre-storage step as the format check: an image
 * that fails here is never decoded at full size, re-encoded or stored.
 */
function assertAcceptedDimensions(decoded: DecodedImageFacts): void {
    const { width, height, pages } = decoded;
    if (width === undefined || height === undefined || width <= 0 || height <= 0) {
        throw new UnsupportedImageError('The uploaded image reports no usable dimensions.');
    }

    if (width > MAX_IMAGE_WIDTH || height > MAX_IMAGE_HEIGHT) {
        throw new UnsupportedImageError(
            `Unsupported image size ${width}x${height}: at most ${MAX_IMAGE_WIDTH}x${MAX_IMAGE_HEIGHT} is accepted.`,
        );
    }

    const frames = pages ?? 1;
    if (width * height * frames > MAX_IMAGE_PIXELS) {
        throw new UnsupportedImageError(
            `Unsupported image size ${width}x${height} in ${frames} frame(s): the limit is ${MAX_IMAGE_PIXELS} pixels.`,
        );
    }
}

/** Format and dimensions of the actual bytes; anything undecodable is refused. */
async function decodeFacts(fileBuffer: Buffer): Promise<DecodedImageFacts> {
    try {
        const metadata = await sharp(fileBuffer).metadata();
        return {
            format: metadata.format ?? 'unknown', // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- sharp metadata.format can be undefined
            width: metadata.width,
            height: metadata.height,
            // `sharp` reports the height of a single page for multi-page images.
            pages: metadata.pages,
        };
    } catch {
        throw new UnsupportedImageError('The uploaded file is not a readable image.');
    }
}
