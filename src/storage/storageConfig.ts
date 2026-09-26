import { GoogleCloudStorage } from '../clients/googleCloudStorage';
import { BUCKET_NAME } from '../constants/common';

/**
 * Multer storage setup.
 *
 * This wires Multer to the custom `GoogleCloudStorage` StorageEngine,
 * which in turn reuses the single central GCS client defined in
 * `src/clients/googleCloudStorage.ts`.
 */
export const storage = new GoogleCloudStorage({
    bucketName: BUCKET_NAME,
    destination: (req, f, cb) =>
        cb(null, Date.now() + Math.random().toString().slice(-3) + `${f.originalname}`),
    generateThumbnail: true,
});