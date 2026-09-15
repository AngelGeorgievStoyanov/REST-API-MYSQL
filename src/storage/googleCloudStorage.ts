import { Storage, StorageOptions } from '@google-cloud/storage';
import { Request } from 'express';
import { StorageEngine } from 'multer';

type UploadedFile = Parameters<StorageEngine['_handleFile']>[1];

interface GoogleCloudStorageOptions extends StorageOptions {
    bucketName: string;
    destination: (
        req: Request,
        file: UploadedFile,
        callback: (error: Error | null, destination: string) => void
    ) => void;
}

export class GoogleCloudStorage extends Storage implements StorageEngine {
    private readonly selectedBucket;
    private readonly destination: GoogleCloudStorageOptions['destination'];

    constructor(options: GoogleCloudStorageOptions) {
        const { bucketName, destination, ...storageOptions } = options;
        super(storageOptions);
        this.selectedBucket = this.bucket(bucketName);
        this.destination = destination;
    }

    _handleFile(
        req: Request,
        file: UploadedFile,
        callback: (error?: Error | null, info?: Partial<UploadedFile>) => void
    ): void {
        try {
            this.destination(req, file, (destinationError, destination) => {
                if (destinationError) {
                    callback(destinationError);
                    return;
                }

                const bucketFile = this.selectedBucket.file(destination);
                const writeStream = bucketFile.createWriteStream();
                let callbackCalled = false;
                const complete = (error?: Error | null) => {
                    if (callbackCalled) {
                        return;
                    }
                    callbackCalled = true;
                    callback(error, error ? undefined : { destination });
                };

                file.stream.pipe(writeStream)
                    .once('error', complete)
                    .once('finish', () => complete(null));
            });
        } catch (error) {
            callback(error as Error);
        }
    }

    _removeFile(
        _req: Request,
        file: UploadedFile,
        callback: (error: Error | null) => void
    ): void {
        const destination = file.destination;
        if (!destination) {
            callback(null);
            return;
        }

        const bucketFile = this.selectedBucket.file(destination);
        bucketFile.exists()
            .then(([exists]) => exists ? bucketFile.delete() : undefined)
            .then(() => callback(null))
            .catch((error: Error) => callback(error));
    }
}
