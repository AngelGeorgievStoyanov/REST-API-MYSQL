import { GoogleCloudStorage } from '../clients/googleCloudStorage';
import { BUCKET_NAME } from '../constants/imageStorage';

export const storage = new GoogleCloudStorage({
    bucketName: BUCKET_NAME,
    generateThumbnail: true,
});