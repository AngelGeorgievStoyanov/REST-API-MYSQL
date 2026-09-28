import { GoogleCloudStorage } from '../clients/googleCloudStorage';
import { BUCKET_NAME } from '../constants/common';

export const storage = new GoogleCloudStorage({
    bucketName: BUCKET_NAME,
    destination: (req, f, cb) =>
        cb(null, Date.now() + Math.random().toString().slice(-3) + `${f.originalname}`),
    generateThumbnail: true,
});