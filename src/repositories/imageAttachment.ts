import { Prisma, type PrismaClient } from '@prisma/client';
import { MAX_IMAGES_PER_ENTITY } from '../constants/imageStorage';

/** Maximum total attempts for a transient SERIALIZABLE transaction conflict. */
const MAX_SERIALIZATION_ATTEMPTS = 5;

/**
 * Attaches one image row to its owner entity while keeping the per-entity cap
 * authoritative under concurrent uploads. A serialization conflict is retried:
 * it does not mean the entity is full. The image count is checked again on every
 * attempt, and only an actual count at the limit returns null.
 *
 * Returns `null` when the entity already carries the maximum number of images.
 */
export async function attachImageWithinLimit(
    prisma: PrismaClient,
    owner: Prisma.ImageWhereInput,
    insert: (tx: Prisma.TransactionClient) => Promise<{ id: number }>,
): Promise<number | null> {
    for (let attempt = 1; attempt <= MAX_SERIALIZATION_ATTEMPTS; attempt += 1) {
        try {
            return await prisma.$transaction(async (tx) => {
                const attached = await tx.image.count({ where: owner });
                if (attached >= MAX_IMAGES_PER_ENTITY) return null;

                const created = await insert(tx);
                return created.id;
            }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        } catch (error) {
            const isSerializationConflict = error instanceof Prisma.PrismaClientKnownRequestError
                && error.code === 'P2034';

            if (!isSerializationConflict || attempt === MAX_SERIALIZATION_ATTEMPTS) {
                throw error;
            }

            console.warn(`[images] ${JSON.stringify({
                event: 'image.database.attach.retry',
                attempt,
                maxAttempts: MAX_SERIALIZATION_ATTEMPTS,
                errorCode: 'P2034',
            })}`);

            // Brief backoff lets the competing transaction finish before retrying.
            await new Promise((resolve) => setTimeout(resolve, 20 * attempt));
        }
    }

    // The loop always returns or throws; this is a defensive unreachable fallback.
    throw new Error('Image attachment attempts exhausted unexpectedly.');
}
