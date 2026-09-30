export const UPLOAD_FIELD_NAME = 'file';

/** Per-file upload cap; the frontend compresses to a few MB and rejects above 25 MB. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Sidecar suffix of the thumbnail of an object inside the flat single-bucket GCS
 * image store: the original keeps the uploaded name, its thumbnail sits next to
 * it under this suffix.
 */
export const THUMBNAIL_SUFFIX = '_thumb.webp';
