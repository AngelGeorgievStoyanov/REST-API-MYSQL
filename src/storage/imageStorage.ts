import { BUCKET_NAME } from '../constants/common';
import { ImageSource } from '../constants/imageStorage';
import { gcsClient } from '../clients/googleCloudStorage';

export const deleteFile = async (
    filePath: string,
    source: ImageSource
): Promise<void> => {
    const bucket = gcsClient.bucket(BUCKET_NAME);

    const extensionIndex = filePath.lastIndexOf('.');
    const thumbnailPath =
        extensionIndex > -1
            ? `${filePath.substring(0, extensionIndex)}_thumb.webp`
            : `${filePath}_thumb.webp`;

    console.log(`[Storage][${source}] Deleting image: ${filePath}`);

    await bucket.file(filePath).delete({
        ignoreNotFound: true,
    });

    console.log(`[Storage][${source}] Deleted image: ${filePath}`);

    console.log(
        `[Storage][${source}] Deleting thumbnail: ${thumbnailPath}`
    );

    await bucket.file(thumbnailPath).delete({
        ignoreNotFound: true,
    });

    console.log(
        `[Storage][${source}] Deleted thumbnail: ${thumbnailPath}`
    );
};