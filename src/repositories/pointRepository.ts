import { Prisma, PrismaClient } from '@prisma/client';
import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { sortPointsByNumber } from '../utils/point';
import { toNumberOrNull } from '../utils/utils';
import { clearPolymorphicTargets } from './polymorphicTargets';
import { attachImageWithinLimit } from './imageAttachment';

export interface PointWriteFields {
    name: string;
    description: string | null;
    /** `points.lat` / `points.lng` are VARCHAR(45) in the live schema. */
    latitude: string | null;
    longitude: string | null;
}

export interface PointContext {
    id: number;
    /** The day row this point belongs to: `Point.tripId`, i.e. a `Trip.id`. */
    tripId: number;
    pointNumber: string;
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

export type PointRow = Prisma.PointGetPayload<{ include: typeof pointInclude }>;

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

    async findRow(pointId: number): Promise<PointRow | null> {
        return this.prisma.point.findUnique({ where: { id: pointId }, include: pointInclude });
    }

    async listRows(tripId: number): Promise<PointRow[]> {
        const points = await this.prisma.point.findMany({ where: { tripId }, include: pointInclude });
        return sortPointsByNumber(points);
    }

    async listIds(tripId: number): Promise<number[]> {
        const points = await this.prisma.point.findMany({ where: { tripId }, select: { id: true } });
        return points.map((point) => point.id);
    }

    async findMaxNumber(tripId: number): Promise<number> {
        const points = await this.prisma.point.findMany({ where: { tripId }, select: { pointNumber: true } });
        return points.reduce((max, point) => {
            const value = toNumberOrNull(point.pointNumber);
            return value !== null && value > max ? value : max;
        }, 0);
    }

    async create(tripId: number, ownerId: string, fields: PointWriteFields, pointNumber: number): Promise<number> {
        const point = await this.prisma.point.create({
            data: {
                name: fields.name,
                description: fields.description,
                lat: fields.latitude,
                lng: fields.longitude,
                pointNumber: String(pointNumber),
                ownerId,
                tripId,
                createdAt: new Date(),
            },
            select: { id: true },
        });
        return point.id;
    }

    async update(pointId: number, fields: Partial<PointWriteFields>): Promise<void> {
        await this.prisma.point.update({
            where: { id: pointId },
            data: {
                ...(fields.name !== undefined ? { name: fields.name } : {}),
                ...(fields.description !== undefined ? { description: fields.description } : {}),
                ...(fields.latitude !== undefined ? { lat: fields.latitude } : {}),
                ...(fields.longitude !== undefined ? { lng: fields.longitude } : {}),
            },
        });
    }

    /**
     * Deletes the point in one transaction and closes the gap it leaves behind, so
     * `pointNumber` stays a dense 1..n sequence. The decrement runs over the
     * remaining rows of the day fetched inside the same transaction.
     */
    async deleteAndCompact(tripId: number, pointId: number, deletedNumber: number): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            await clearPolymorphicTargets(tx, SOCIAL_TARGET_TYPE.POINT, pointId);
            await tx.point.delete({ where: { id: pointId } });

            const remaining = await tx.point.findMany({
                where: { tripId },
                select: { id: true, pointNumber: true },
            });
            for (const row of remaining) {
                const value = toNumberOrNull(row.pointNumber);
                if (value === null || value <= deletedNumber) continue;
                await tx.point.update({ where: { id: row.id }, data: { pointNumber: String(value - 1) } });
            }
        });
    }

    /** Renumbers every point of the day to its position in `pointIds`, in one transaction. */
    async reorder(tripId: number, pointIds: number[]): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            for (const [index, pointId] of pointIds.entries()) {
                await tx.point.updateMany({
                    where: { id: pointId, tripId },
                    data: { pointNumber: String(-(index + 1)) },
                });
            }
            for (const [index, pointId] of pointIds.entries()) {
                await tx.point.updateMany({
                    where: { id: pointId, tripId },
                    data: { pointNumber: String(index + 1) },
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
        await this.prisma.image.delete({ where: { id: imageId } });
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
