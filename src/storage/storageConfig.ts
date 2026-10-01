import { GoogleCloudStorage } from '../clients/googleCloudStorage';
import { BUCKET_NAME, OBJECT_NAME_RANDOM_DIGITS } from '../constants/imageStorage';

export const storage = new GoogleCloudStorage({
    bucketName: BUCKET_NAME,
    destination: (req, f, cb) =>
        cb(null, Date.now() + Math.random().toString().slice(-OBJECT_NAME_RANDOM_DIGITS) + `${f.originalname}`),
    generateThumbnail: true,
});