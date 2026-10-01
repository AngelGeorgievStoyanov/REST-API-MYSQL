export const UPLOAD_FIELD_NAME = 'file';

/** Per-file upload cap; the frontend compresses to a few MB and rejects above 25 MB. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Images one owner entity may carry: 9 per Trip (a Day row) and 9 per Point,
 * counted from the `images` rows attached to that entity. It is never a global,
 * per-user or per-request cap — every request carries exactly one file.
 */
export const MAX_IMAGES_PER_ENTITY = 9;

/** `409` answered when an entity already carries the maximum number of images. */
export const IMAGE_LIMIT_MESSAGE = `A maximum of ${MAX_IMAGES_PER_ENTITY} images is allowed per trip day or point.`;

/**
 * Formats the upload pipeline accepts, as reported by the decoder. The byte
 * content is the authority, so a forged Content-Type cannot smuggle another
 * format in; HEIC/HEIF, SVG, TIFF and AVIF are deliberately not accepted.
 */
export const ALLOWED_IMAGE_FORMATS = ['jpeg', 'png', 'webp', 'gif'] as const;

/** Declared `Content-Type` values accepted as a cheap first gate. */
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** Declared file extensions matching the accepted formats. */
export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'] as const;

/**
 * Multipart ceilings of the upload middleware. The contract carries exactly one
 * binary part and no metadata — the entity is addressed by the URL — so every
 * other boundary is closed: a malformed form is refused before the body is
 * buffered and before anything reaches GCS.
 */
export const IMAGE_UPLOAD_LIMITS = {
    /** Exactly one binary part per request. */
    files: 1,
    fileSize: MAX_UPLOAD_BYTES,
    /** No text parts are part of the contract. */
    fields: 0,
    fieldSize: 8 * 1024,
    fieldNameSize: 64,
    /**
     * Total multipart parts. The parser treats the limit as reached on the part
     * that hits it, so one allowed part needs `2` here; `files`/`fields` keep the
     * form closed to anything else.
     */
    parts: 2,
} as const;

/**
 * Sidecar suffix of the thumbnail of an object inside the flat single-bucket GCS
 * image store: the original keeps the uploaded name, its thumbnail sits next to
 * it under this suffix.
 */
export const THUMBNAIL_SUFFIX = '_thumb.webp';

/**
 * Recipe of the thumbnail generated next to every stored image. The original is
 * kept exactly as uploaded; only the sidecar is resized and re-encoded.
 */
export const IMAGE_THUMBNAIL = {
    width: 800,
    height: 600,
    quality: 80,
    /** `sharp` fit mode: the image is scaled down inside the box, never cropped. */
    fit: 'inside',
} as const;

/**
 * The single GCS bucket of the flat image store: every original and its thumbnail
 * sidecar live at the bucket root.
 */
export const BUCKET_NAME = 'hack-trip';

/**
 * Digits of random entropy appended to a generated object name. A name is
 * `<timestamp><entropy><original name>`, so two uploads in the same millisecond
 * still land on distinct objects.
 */
export const OBJECT_NAME_RANDOM_DIGITS = 3;

/** `retryOptions.maxRetries` handed to the GCS client for one storage operation. */
export const STORAGE_MAX_RETRIES = 3;

/** `retryOptions.totalTimeout` handed to the GCS client for one storage operation. */
export const STORAGE_TOTAL_TIMEOUT = 30;
