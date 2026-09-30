import { Prisma, PrismaClient } from '@prisma/client';
import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { DEFAULT_COUNT_PEOPLES, FIRST_DAY_NUMBER } from '../constants/trip';
import { sortPointsByNumber } from '../utils/point';
import { clearPolymorphicTargets } from './polymorphicTargets';
import { pointInclude } from './pointRepository';

/**
 * Storage model of trips in the live schema (prisma/schema.prisma mirrors it):
 *  - a trip is one `trip_groups` row (owner + timestamps);
 *  - its days are `trips` rows (`dayNumber`) carrying the trip metadata;
 *  - a day's points are `points` rows, images are `images` rows attached to a
 *    trip row (day/cover images) or to a point row;
 *  - likes / comments are polymorphic (`target_types` + `targetId`) and may
 *    point either at the trip group or at a single day row, which is why the
 *    day rows have to be handed over for aggregation.
 */

/** Trip/group level write input; day and point rows have their own endpoints. */
export interface TripMetadataInput {
    ownerId: string;
    title: string;
    description: string | null;
    /** Stored value of `trips.typeOfPeople` (dynamic config select key). */
    group: string;
    /** Stored value of `trips.transport` (dynamic config select key). */
    transport: string;
}

export interface DayWriteFields {
    title: string | null;
    description: string | null;
}

export interface DayUpdateFields {
    title?: string;
    description?: string | null;
}

export interface DayContext {
    id: number;
    dayNumber: number | null;
    tripGroupId: number | null;
    ownerId: string | null;
}

export interface ImageContext {
    id: number;
    filePath: string;
    tripId: number | null;
    pointId: number | null;
    ownerId: string | null;
    tripGroupId: number | null;
    groupOwnerId: string | null;
}

export interface TripListCriteria {
    skip: number;
    take: number;
    search?: string;
    /** Accepted stored values (select key + display value) for `typeOfPeople`. */
    groupValues?: string[];
    /** Accepted stored values (select key + display value) for `transport`. */
    transportValues?: string[];
    sort: 'newest' | 'oldest';
}

const listInclude = {
    owner: { select: { id: true, firstName: true, lastName: true } },
    trips: {
        orderBy: [{ dayNumber: 'asc' }, { id: 'asc' }],
        select: {
            id: true,
            title: true,
            description: true,
            transport: true,
            typeOfPeople: true,
            dayNumber: true,
            createdAt: true,
        },
    },
} satisfies Prisma.TripGroupInclude;

const detailsInclude = {
    owner: { select: { id: true, firstName: true, lastName: true } },
    trips: {
        orderBy: [{ dayNumber: 'asc' }, { id: 'asc' }],
        include: {
            images: { orderBy: { id: 'asc' }, select: { id: true, filePath: true } },
            points: { orderBy: { id: 'asc' }, include: pointInclude },
        },
    },
} satisfies Prisma.TripGroupInclude;

export type TripGroupListRow = Prisma.TripGroupGetPayload<{ include: typeof listInclude }>;
export type TripGroupDetailsRow = Prisma.TripGroupGetPayload<{ include: typeof detailsInclude }>;

const dayInclude = {
    images: { orderBy: { id: 'asc' }, select: { id: true, filePath: true } },
    points: { include: pointInclude },
} satisfies Prisma.TripInclude;

export type DayRow = Prisma.TripGetPayload<{ include: typeof dayInclude }>;

export class TripRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async findPage(criteria: TripListCriteria): Promise<{ rows: TripGroupListRow[]; total: number }> {
        const dayFilters: Prisma.TripWhereInput[] = [];

        if (criteria.search) {
            dayFilters.push({
                OR: [
                    { title: { contains: criteria.search } },
                    { description: { contains: criteria.search } },
                ],
            });
        }
        if (criteria.groupValues && criteria.groupValues.length > 0) {
            dayFilters.push({ typeOfPeople: { in: criteria.groupValues } });
        }
        if (criteria.transportValues && criteria.transportValues.length > 0) {
            dayFilters.push({ transport: { in: criteria.transportValues } });
        }

        const where: Prisma.TripGroupWhereInput = dayFilters.length > 0
            ? { trips: { some: dayFilters.length === 1 ? dayFilters[0] : { AND: dayFilters } } }
            : {};

        const orderBy: Prisma.TripGroupOrderByWithRelationInput[] = criteria.sort === 'oldest'
            ? [{ createdAt: 'asc' }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'desc' }];

        const [rows, total] = await Promise.all([
            this.prisma.tripGroup.findMany({
                where,
                orderBy,
                skip: criteria.skip,
                take: criteria.take,
                include: listInclude,
            }),
            this.prisma.tripGroup.count({ where }),
        ]);

        return { rows, total };
    }

    /**
     * `points` are handed over in `pointNumber` order. The column is a VARCHAR, so
     * the numeric sort happens in code instead of in the query.
     */
    async findById(id: number): Promise<TripGroupDetailsRow | null> {
        const row = await this.prisma.tripGroup.findUnique({ where: { id }, include: detailsInclude });
        if (!row) return null;

        return { ...row, trips: row.trips.map((trip) => ({ ...trip, points: sortPointsByNumber(trip.points) })) };
    }

    async findOwnerId(id: number): Promise<string | null> {
        const group = await this.prisma.tripGroup.findUnique({ where: { id }, select: { ownerId: true } });
        return group?.ownerId ?? null;
    }

    async findCoverImages(tripIds: number[]): Promise<Map<number, string>> {
        const covers = new Map<number, string>();
        if (tripIds.length === 0) return covers;

        const images = await this.prisma.image.findMany({
            where: { tripId: { in: tripIds } },
            orderBy: { id: 'asc' },
            select: { tripId: true, filePath: true },
        });

        for (const image of images) {
            if (image.tripId !== null && !covers.has(image.tripId)) {
                covers.set(image.tripId, image.filePath);
            }
        }
        return covers;
    }

    /** Creates the trip group plus its first day row, which carries the trip metadata. */
    async createTrip(input: TripMetadataInput): Promise<number> {
        const group = await this.prisma.tripGroup.create({
            data: {
                ownerId: input.ownerId,
                createdAt: new Date(),
                trips: { create: [this.dayCreateData(input.ownerId, FIRST_DAY_NUMBER, input.title, input.description, input.group, input.transport)] },
            },
            select: { id: true },
        });

        return group.id;
    }

    /** Trip metadata is stored on the canonical (lowest `dayNumber`) day row. */
    async findCanonicalDay(groupId: number): Promise<{
        id: number;
        title: string;
        description: string | null;
        transport: string | null;
        typeOfPeople: string | null;
    } | null> {
        return this.prisma.trip.findFirst({
            where: { tripGroupId: groupId },
            orderBy: [{ dayNumber: 'asc' }, { id: 'asc' }],
            select: { id: true, title: true, description: true, transport: true, typeOfPeople: true },
        });
    }

    async updateTripMetadata(groupId: number, input: TripMetadataInput): Promise<void> {
        const canonicalDay = await this.findCanonicalDay(groupId);
        if (!canonicalDay) return;

        await this.prisma.trip.update({
            where: { id: canonicalDay.id },
            data: {
                title: input.title,
                description: input.description,
                transport: input.transport,
                typeOfPeople: input.group,
            },
        });
    }

    /**
     * Deletes the whole trip. Day rows cascade to points/images through the FKs,
     * while polymorphic likes/comments/reports have no FK and must be cleared
     * explicitly; favorites are removed explicitly because their FK blocks the
     * group delete.
     */
    async delete(id: number): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            const days = await tx.trip.findMany({ where: { tripGroupId: id }, select: { id: true } });
            for (const day of days) {
                const points = await tx.point.findMany({ where: { tripId: day.id }, select: { id: true } });
                for (const point of points) {
                    await clearPolymorphicTargets(tx, SOCIAL_TARGET_TYPE.POINT, point.id);
                }
                await clearPolymorphicTargets(tx, SOCIAL_TARGET_TYPE.DAY, day.id);
            }

            await tx.favorite.deleteMany({ where: { tripGroupId: id } });
            await tx.tripGroup.delete({ where: { id } });
        });
    }

    async listDayIds(groupId: number): Promise<number[]> {
        const days = await this.prisma.trip.findMany({ where: { tripGroupId: groupId }, select: { id: true } });
        return days.map((day) => day.id);
    }

    async listTripImagePaths(groupId: number): Promise<string[]> {
        const images = await this.prisma.image.findMany({
            where: { OR: [{ trip: { tripGroupId: groupId } }, { point: { trip: { tripGroupId: groupId } } }] },
            select: { filePath: true },
        });
        return images.map((image) => image.filePath);
    }

    async countDays(groupId: number): Promise<number> {
        return this.prisma.trip.count({ where: { tripGroupId: groupId } });
    }

    async findMaxDayNumber(groupId: number): Promise<number> {
        const day = await this.prisma.trip.findFirst({
            where: { tripGroupId: groupId },
            orderBy: [{ dayNumber: 'desc' }, { id: 'desc' }],
            select: { dayNumber: true },
        });
        return day?.dayNumber ?? 0;
    }

    async findDayContext(dayId: number): Promise<DayContext | null> {
        return this.prisma.trip.findUnique({
            where: { id: dayId },
            select: { id: true, dayNumber: true, tripGroupId: true, ownerId: true },
        });
    }

    /** `null` means the trip already has a day with that number. */
    async createDay(
        groupId: number,
        dayNumber: number,
        fields: DayWriteFields,
        ownerId: string,
        group: string | null,
        transport: string | null,
    ): Promise<number | null> {
        try {
            const day = await this.prisma.trip.create({
                data: this.dayCreateData(ownerId, dayNumber, fields.title, fields.description, group, transport, groupId),
                select: { id: true },
            });
            return day.id;
        } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
            throw err;
        }
    }

    async updateDay(dayId: number, fields: DayUpdateFields): Promise<void> {
        await this.prisma.trip.update({
            where: { id: dayId },
            data: {
                ...(fields.title !== undefined ? { title: fields.title } : {}),
                ...(fields.description !== undefined ? { description: fields.description } : {}),
            },
        });
    }

    /**
     * Renumbers every day of the group to its position in `dayIds`. The UNIQUE
     * (tripGroupId, dayNumber) constraint makes a direct write fail mid-swap, so
     * every day is parked on a temporary negative number first.
     */
    async reorderDays(groupId: number, dayIds: number[]): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            for (const [index, dayId] of dayIds.entries()) {
                await tx.trip.update({ where: { id: dayId }, data: { dayNumber: -(index + 1) } });
            }
            for (const [index, dayId] of dayIds.entries()) {
                await tx.trip.update({ where: { id: dayId }, data: { dayNumber: index + 1 } });
            }
        });
    }

    async findDayRow(dayId: number): Promise<DayRow | null> {
        const day = await this.prisma.trip.findUnique({ where: { id: dayId }, include: dayInclude });
        return day ? { ...day, points: sortPointsByNumber(day.points) } : null;
    }

    async listDayRows(groupId: number): Promise<DayRow[]> {
        const days = await this.prisma.trip.findMany({
            where: { tripGroupId: groupId },
            orderBy: [{ dayNumber: 'asc' }, { id: 'asc' }],
            include: dayInclude,
        });
        return days.map((day) => ({ ...day, points: sortPointsByNumber(day.points) }));
    }

    /**
     * Removes the day row in one transaction. Points and images cascade through
     * their FKs; polymorphic targets (the day and its points) have no FK and are
     * cleared explicitly.
     */
    async deleteDay(dayId: number): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            const points = await tx.point.findMany({ where: { tripId: dayId }, select: { id: true } });
            for (const point of points) {
                await clearPolymorphicTargets(tx, SOCIAL_TARGET_TYPE.POINT, point.id);
            }
            await clearPolymorphicTargets(tx, SOCIAL_TARGET_TYPE.DAY, dayId);
            await tx.trip.delete({ where: { id: dayId } });
        });
    }

    async listDayImagePaths(dayId: number): Promise<string[]> {
        const images = await this.prisma.image.findMany({ where: { tripId: dayId }, select: { filePath: true } });
        return images.map((image) => image.filePath);
    }

    /** Day images belong to a trip row; point images are owned by the point slice. */
    async createImage(data: { ownerId: string; filePath: string; tripId: number }): Promise<number> {
        const image = await this.prisma.image.create({
            data: { ...data, createdAt: new Date() },
            select: { id: true },
        });
        return image.id;
    }

    async findImageContext(imageId: number): Promise<ImageContext | null> {
        const image = await this.prisma.image.findUnique({
            where: { id: imageId },
            select: {
                id: true,
                filePath: true,
                tripId: true,
                pointId: true,
                ownerId: true,
                trip: { select: { tripGroupId: true, tripGroup: { select: { ownerId: true } } } },
                point: { select: { trip: { select: { tripGroupId: true, tripGroup: { select: { ownerId: true } } } } } },
            },
        });
        if (!image) return null;

        const day = image.trip ?? image.point?.trip ?? null;
        return {
            id: image.id,
            filePath: image.filePath,
            tripId: image.tripId,
            pointId: image.pointId,
            ownerId: image.ownerId,
            tripGroupId: day?.tripGroupId ?? null,
            groupOwnerId: day?.tripGroup?.ownerId ?? null,
        };
    }

    async deleteImage(imageId: number): Promise<void> {
        await this.prisma.image.delete({ where: { id: imageId } });
    }

    private dayCreateData(
        ownerId: string,
        dayNumber: number,
        title: string | null,
        description: string | null,
        group: string | null,
        transport: string | null,
        tripGroupId?: number,
    ): Prisma.TripUncheckedCreateInput {
        return {
            title: title ?? '',
            description,
            transport,
            typeOfPeople: group,
            dayNumber,
            countPeoples: DEFAULT_COUNT_PEOPLES,
            ownerId,
            tripGroupId,
            createdAt: new Date(),
        };
    }

    async listPointImagePathsOfDay(dayId: number): Promise<string[]> {
        const images = await this.prisma.image.findMany({
            where: { point: { tripId: dayId } },
            select: { filePath: true },
        });
        return images.map((image) => image.filePath);
    }

}
