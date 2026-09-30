export const IMAGE_SOURCE = {
    TRIP: 'trip',
    POINT: 'point',
    USER: 'user',
} as const;

export type ImageSource =
    (typeof IMAGE_SOURCE)[keyof typeof IMAGE_SOURCE];

export const UPLOAD_FIELD_NAME = 'file';

/** Per-file upload cap; the frontend compresses to a few MB and rejects above 25 MB. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
