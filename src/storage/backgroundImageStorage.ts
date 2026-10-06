import { gcsClient } from '../clients/googleCloudStorage';
import { BACKGROUND_BUCKET_NAME } from '../constants/imageStorage';

/**
 * Read-only discovery of the public background bucket: object names only, no
 * bytes are downloaded and nothing is ever written. This is the single GCS
 * listing path for backgrounds; it is called by the slow dynamic-configuration
 * refresh, never by an HTTP controller.
 */
export async function listBackgroundImageNames(): Promise<string[]> {
    const [files] = await gcsClient.bucket(BACKGROUND_BUCKET_NAME).getFiles();
    return files.map((file) => file.name);
}