import { type Prisma, type PrismaClient } from '@prisma/client';
import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { type PointRecord, type PointWriteInput } from '../model/trip';
import { toPointRecord } from '../mappers/pointPersistenceMapper';
import { sortPointsByNumber } from '../utils/point';
import { deleteSocialRecordsForTargets, socialCleanupTargets } from './polymorphicTargets';
import { attachImageWithinLimit } from './imageAttachment';
import { runSerializableWithRetry } from './serializableTransaction';


export interface PointContext {
    id: number;
    /** The day row this point belongs to: `Point.tripId`, i.e. a `Trip.id`. */
    tripId: number;
    pointNumber: number;
    tripGroupId: number | null;
    groupOwnerId: string | null;
}

/**
 * The day (a `trips` row) a point belongs to, together with the owner of its trip
 * group. `tripId` is the `Trip.id` of that row — a day has no other identifier.
 */
export interface PointDayContext {
    tripId: number;
    tripGroupId: number | null;
    groupOwnerId: string | null;
}

export interface PointImageRef {
    id: number;
    filePath: string;
}

export const pointInclude = {
    images: { orderBy: { id: 'asc' }, select: { id: true, filePath: true } },
} satisfies Prisma.PointInclude;

export class PointRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async findDayContext(tripId: number): Promise<PointDayContext | null> {
        const day = await this.prisma.trip.findUnique({
            where: { id: tripId },
            select: { id: true, tripGroupId: true, tripGroup: { select: { ownerId: true } } },
        });
        if (!day) return null;

        return { tripId: day.id, tripGroupId: day.tripGroupId, groupOwnerId: day.tripGroup?.ownerId ?? null };
    }

    /** A point without a day cannot be addressed, so it is reported as missing. */
    async findContext(pointId: number): Promise<PointContext | null> {
        const point = await this.prisma.point.findUnique({
            where: { id: pointId },
            select: {
                id: true,
                tripId: true,
                pointNumber: true,
                trip: { select: { tripGroupId: true, tripGroup: { select: { ownerId: true } } } },
            },
        });
        if (!point || point.tripId === null) return null;

        return {
            id: point.id,
            tripId: point.tripId,
            pointNumber: point.pointNumber,
            tripGroupId: point.trip?.tripGroupId ?? null,
            groupOwnerId: point.trip?.tripGroup?.ownerId ?? null,
        };
    }

    async findRow(pointId: number): Promise<PointRecord | null> {
        const row = await this.prisma.point.findUnique({ where: { id: pointId }, include: pointInclude });
        return row ? toPointRecord(row) : null;
    }

    async listRows(tripId: number): Promise<PointRecord[]> {
        const points = await this.prisma.point.findMany({ where: { tripId }, include: pointInclude });
        return sortPointsByNumber(points).map(toPointRecord);
    }

    async listIds(tripId: number): Promise<number[]> {
        const points = await this.prisma.point.findMany({ where: { tripId }, select: { id: true } });
        return points.map((point) => point.id);
    }

    async findMaxNumber(tripId: number): Promise<number> {
        return maxPointNumber(this.prisma, tripId);
    }

    /**
     * Inserts the point as the last child of its day, so it carries the next
     * `pointNumber`. The maximum and the insert share one SERIALIZABLE
     * transaction: two concurrent creations of the same day cannot compute the
     * same number, and a transaction that loses the race is retried against the
     * committed state. The response contract is unchanged — the caller still only
     * receives the new id.
     */
    async create(tripId: number, ownerId: string, fields: PointWriteInput): Promise<number> {
        return runSerializableWithRetry(this.prisma, async (tx) => {
            const pointNumber = (await maxPointNumber(tx, tripId)) + 1;
            const point = await tx.point.create({
                data: {
                    name: fields.name,
                    description: fields.description,
                    lat: fields.lat === null ? null : String(fields.lat),
                    lng: fields.lng === null ? null : String(fields.lng),
                    pointNumber,
                    ownerId,
                    tripId,
                    createdAt: new Date(),
                },
                select: { id: true },
            });

            return point.id;
        });
    }

    async update(pointId: number, fields: Partial<PointWriteInput>): Promise<void> {
        await this.prisma.point.update({
            where: { id: pointId },
            data: {
                ...(fields.name !== undefined ? { name: fields.name } : {}),
                ...(fields.description !== undefined ? { description: fields.description } : {}),
                ...(fields.lat !== undefined ? { lat: fields.lat === null ? null : String(fields.lat) } : {}),
                ...(fields.lng !== undefined ? { lng: fields.lng === null ? null : String(fields.lng) } : {}),
            },
        });
    }

    /**
     * Deletes the point in one transaction and closes the gap it leaves behind, so
     * `pointNumber` stays a dense 1..n sequence. The point's images cascade
     * through their FK, so the social records of the point AND of those images
     * are removed by the central social cleanup in this same transaction. The
     * decrement runs over the remaining rows of the day fetched inside the same
     * transaction.
     */
    async deleteAndCompact(tripId: number, pointId: number, deletedNumber: number): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            const images = await tx.image.findMany({ where: { pointId }, select: { id: true } });
            await deleteSocialRecordsForTargets(tx, [
                ...socialCleanupTargets(SOCIAL_TARGET_TYPE.POINT, [pointId]),
                ...socialCleanupTargets(SOCIAL_TARGET_TYPE.IMAGE, images.map((image) => image.id)),
            ]);

            await tx.point.delete({ where: { id: pointId } });

            const remaining = await tx.point.findMany({
                where: { tripId },
                select: { id: true, pointNumber: true },
            });
            for (const row of remaining) {
                if (row.pointNumber <= deletedNumber) continue;
                await tx.point.update({ where: { id: row.id }, data: { pointNumber: row.pointNumber - 1 } });
            }
        });
    }

    /** Renumbers every point of the day to its position in `pointIds`, in one transaction. */
    async reorder(tripId: number, pointIds: number[]): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            // Negative markers first: a point pushed to a later position must not
            // collide with a not-yet-moved point that still holds that number.
            // The column is a signed INT, so the markers are ordinary values.
            for (const [index, pointId] of pointIds.entries()) {
                await tx.point.updateMany({
                    where: { id: pointId, tripId },
                    data: { pointNumber: -(index + 1) },
                });
            }
            for (const [index, pointId] of pointIds.entries()) {
                await tx.point.updateMany({
                    where: { id: pointId, tripId },
                    data: { pointNumber: index + 1 },
                });
            }
        });
    }

    async listImagePaths(pointId: number): Promise<string[]> {
        const images = await this.prisma.image.findMany({ where: { pointId }, select: { filePath: true } });
        return images.map((image) => image.filePath);
    }

    /** Scoped by `pointId`, so an image of another point can never be deleted here. */
    async findImage(pointId: number, imageId: number): Promise<PointImageRef | null> {
        return this.prisma.image.findFirst({
            where: { id: imageId, pointId },
            select: { id: true, filePath: true },
        });
    }

    async deleteImage(imageId: number): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            // The image row is removed together with every social record that
            // targets it (likes/comments/reports and any future relationship).
            await deleteSocialRecordsForTargets(tx, socialCleanupTargets(SOCIAL_TARGET_TYPE.IMAGE, [imageId]));

            await tx.image.delete({ where: { id: imageId } });
        });
    }

    /**
     * Images currently attached to a point (`Image.pointId`), used to refuse an
     * upload before the file is stored.
     */
    async countImages(pointId: number): Promise<number> {
        return this.prisma.image.count({ where: { pointId } });
    }

    /**
     * Appends one image row attached to a point: `Image.pointId` carries the
     * `Point.id`. `tripId` stays unset, so the row belongs to the point only and
     * cannot be mistaken for a day image. `null` means the point is already full.
     */
    async createImage(pointId: number, ownerId: string, filePath: string): Promise<number | null> {
        return attachImageWithinLimit(
            this.prisma,
            { pointId },
            (tx) => tx.image.create({
                data: { ownerId, filePath, pointId, createdAt: new Date() },
                select: { id: true },
            }),
        );
    }
}

/**
 * Highest `pointNumber` of one day, computed on the shared client or on the
 * transaction of a concurrent create. Kept as a free function so the read and
 * the insert can share the same SERIALIZABLE transaction without duplicating
 * the reduction.
 */
export async function maxPointNumber(client: Prisma.TransactionClient, tripId: number): Promise<number> {
    const points = await client.point.findMany({ where: { tripId }, select: { pointNumber: true } });
    return points.reduce((max, point) => (point.pointNumber > max ? point.pointNumber : max), 0);
}

