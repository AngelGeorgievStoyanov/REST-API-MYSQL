import { Prisma, type PrismaClient } from '@prisma/client';

/** Attempts of one serializable unit of work before the conflict is reported. */
const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Runs one unit of work inside a SERIALIZABLE transaction, retrying a bounded
 * number of times when the database reports a serialization conflict (Prisma
 * `P2034`).
 *
 * `P2034` means the transaction lost a deadlock or write-conflict race and was
 * rolled back without side effects, so a retry re-reads the committed state
 * instead of reusing a stale snapshot. That is what makes a read-then-write
 * allocation — such as the next `pointNumber` of a day — safe under concurrent
 * requests without adding a schema or locking change.
 */
export async function runSerializableWithRetry<T>(
    prisma: PrismaClient,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
        try {
            // eslint-disable-next-line no-await-in-loop -- retry loop for serialization conflicts
            return await prisma.$transaction(work, {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            });
        } catch (error) {
            // The last attempt reports the conflict unchanged instead of hiding it.
            if (attempt >= maxAttempts || !isSerializationConflict(error)) throw error;
        }
    }
}

/** Prisma tag of a transaction rolled back by a serialization conflict. */
function isSerializationConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}
