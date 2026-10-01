import { Prisma, PrismaClient } from '@prisma/client';
import { MAX_IMAGES_PER_ENTITY } from '../constants/imageStorage';

/**
 * Attaches one image row to its owner entity while keeping the per-entity cap
 * authoritative under concurrent uploads: the count and the insert run inside one
 * SERIALIZABLE transaction, so two racing uploads at the limit cannot both insert
 * — the loser fails with a serialization conflict instead of writing a 10th image.
 *
 * Returns `null` when the entity already carries the maximum number of images.
 */
export async function attachImageWithinLimit(
    prisma: PrismaClient,
    owner: Prisma.ImageWhereInput,
    insert: (tx: Prisma.TransactionClient) => Promise<{ id: number }>,
): Promise<number | null> {
    try {
        return await prisma.$transaction(async (tx) => {
            const attached = await tx.image.count({ where: owner });
            if (attached >= MAX_IMAGES_PER_ENTITY) return null;

            const created = await insert(tx);
            return created.id;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
        // A competing upload won the race; the cap still holds, so the caller
        // reports the entity as full rather than exposing the conflict detail.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return null;
        throw error;
    }
}
