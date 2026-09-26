export const IMAGE_SOURCE = {
    TRIP: 'trip',
    POINT: 'point',
    USER: 'user',
} as const;

export type ImageSource =
    (typeof IMAGE_SOURCE)[keyof typeof IMAGE_SOURCE];