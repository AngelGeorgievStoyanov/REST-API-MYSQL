export const UPLOAD_FIELD_NAME = 'file';

/** Per-file upload cap; the frontend compresses to a few MB and rejects above 25 MB. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Multipart ceilings of the upload middleware. The contract carries exactly one
 * binary part and no metadata — the resource is addressed by the URL — so every
 * other boundary stays deliberately small: a malicious or malformed form is
 * refused before the body is buffered.
 */
export const IMAGE_UPLOAD_LIMITS = {
    /** One binary part per request. */
    files: 1,
    fileSize: MAX_UPLOAD_BYTES,
    /** Text parts are not part of the contract; a small allowance only. */
    fields: 5,
    fieldSize: 8 * 1024,
    fieldNameSize: 64,
    /** Total multipart parts: the file, the allowance above and headroom. */
    parts: 10,
} as const;

/**
 * Sidecar suffix of the thumbnail of an object inside the flat single-bucket GCS
 * image store: the original keeps the uploaded name, its thumbnail sits next to
 * it under this suffix.
 */
export const THUMBNAIL_SUFFIX = '_thumb.webp';
