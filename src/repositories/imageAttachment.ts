import { Prisma, type PrismaClient } from '@prisma/client';
import { performance } from 'node:perf_hooks';
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
    const ownerScope = {
        tripId: typeof owner.tripId === 'number' ? owner.tripId : undefined,
        pointId: typeof owner.pointId === 'number' ? owner.pointId : undefined,
        ownerKeys: Object.keys(owner),
    };

    for (let attempt = 1; attempt <= MAX_SERIALIZATION_ATTEMPTS; attempt += 1) {
        const attemptStartedAt = performance.now();
        console.info(`[images] ${JSON.stringify({
            event: 'image.database.attach.attempt.started',
            ...ownerScope,
            attempt,
            maxAttempts: MAX_SERIALIZATION_ATTEMPTS,
            isolationLevel: 'Serializable',
        })}`);

        try {
            const result = await prisma.$transaction(async (tx) => {
                const countStartedAt = performance.now();
                const attached = await tx.image.count({ where: owner });
                console.info(`[images] ${JSON.stringify({
                    event: 'image.database.attach.count.completed',
                    ...ownerScope,
                    attempt,
                    attached,
                    maxImages: MAX_IMAGES_PER_ENTITY,
                    durationMs: Math.round(performance.now() - countStartedAt),
                })}`);

                if (attached >= MAX_IMAGES_PER_ENTITY) {
                    return { imageId: null, attached, outcome: 'limit_reached' as const };
                }

                const created = await insert(tx);
                return { imageId: created.id, attached, outcome: 'created' as const };
            }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

            console.info(`[images] ${JSON.stringify({
                event: 'image.database.attach.attempt.completed',
                ...ownerScope,
                attempt,
                attachedBeforeInsert: result.attached,
                imageId: result.imageId,
                outcome: result.outcome,
                durationMs: Math.round(performance.now() - attemptStartedAt),
            })}`);
            return result.imageId;
        } catch (error) {
            const isSerializationConflict = error instanceof Prisma.PrismaClientKnownRequestError
                && error.code === 'P2034';
            const errorDetails = getDatabaseErrorDetails(error);

            console.error(`[images] ${JSON.stringify({
                event: 'image.database.attach.attempt.failed',
                ...ownerScope,
                attempt,
                maxAttempts: MAX_SERIALIZATION_ATTEMPTS,
                durationMs: Math.round(performance.now() - attemptStartedAt),
                isSerializationConflict,
                ...errorDetails,
            })}`);

            if (!isSerializationConflict || attempt === MAX_SERIALIZATION_ATTEMPTS) {
                console.error(`[images] ${JSON.stringify({
                    event: 'image.database.attach.exhausted_or_nonretryable',
                    ...ownerScope,
                    attempt,
                    maxAttempts: MAX_SERIALIZATION_ATTEMPTS,
                    outcome: isSerializationConflict ? 'serialization_retries_exhausted' : 'non_retryable_error',
                    ...errorDetails,
                })}`);
                throw error;
            }

            console.warn(`[images] ${JSON.stringify({
                event: 'image.database.attach.retry',
                ...ownerScope,
                attempt,
                nextAttempt: attempt + 1,
                maxAttempts: MAX_SERIALIZATION_ATTEMPTS,
                backoffMs: 20 * attempt,
                ...errorDetails,
            })}`);

            await new Promise((resolve) => setTimeout(resolve, 20 * attempt));
        }
    }

    throw new Error('Image attachment attempts exhausted unexpectedly.');
}

function getDatabaseErrorDetails(error: unknown): Record<string, unknown> {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return {
            errorName: error.name,
            errorCode: error.code,
            errorMessage: error.message.slice(0, 500),
            errorMeta: error.meta,
            clientVersion: error.clientVersion,
        };
    }

    if (error instanceof Error) {
        return {
            errorName: error.name,
            errorMessage: error.message.slice(0, 500),
        };
    }

    return { errorName: 'UnknownError', errorMessage: String(error).slice(0, 500) };
}
