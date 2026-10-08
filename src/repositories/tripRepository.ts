import { Prisma, PrismaClient } from '@prisma/client';
import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { DEFAULT_COUNT_PEOPLES, FIRST_DAY_NUMBER } from '../constants/trip';
import {
    DayUpdateInput,
    DayWriteInput,
    TripDayRecord,
    TripGroupDetailsRecord,
    TripGroupListRecord,
    TripListDayRecord,
    TripMetadataInput,
} from '../model/trip';
import { sortPointsByNumber } from '../utils/point';
import { toPointRecord } from '../mappers/pointPersistenceMapper';
import { deleteSocialRecordsForTargets, socialCleanupTargets } from './polymorphicTargets';
import { attachImageWithinLimit } from './imageAttachment';
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
 *
 * There is no separate day entity: a day IS a `trips` row, so its only
 * identifier is that row's `Trip.id`. That id is what an image of the day is
 * attached through (`Image.tripId`), and `dayNumber` is never an identifier.
 * Day-row parameters are therefore named `tripId` here.
 */

// Cleaned up stale comments and imports.

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

type TripGroupListRow = Prisma.TripGroupGetPayload<{ include: typeof listInclude }>;
type TripGroupDetailsRow = Prisma.TripGroupGetPayload<{ include: typeof detailsInclude }>;

const detailsWithPriceInclude = {
    owner: { select: { id: true, firstName: true, lastName: true } },
    trips: {
        orderBy: [{ dayNumber: 'asc' }, { id: 'asc' }],
        include: {
            images: { orderBy: { id: 'asc' }, select: { id: true, filePath: true } },
            points: {
                orderBy: [{ pointNumber: 'asc' }, { id: 'asc' },], include: pointInclude,
            },
        },
    },
} satisfies Prisma.TripGroupInclude;

type TripGroupDetailsWithPriceRow = Prisma.TripGroupGetPayload<{ include: typeof detailsWithPriceInclude }>;

const dayInclude = {
    images: { orderBy: { id: 'asc' }, select: { id: true, filePath: true } },
    points: { include: pointInclude },
} satisfies Prisma.TripInclude;

type DayRow = Prisma.TripGetPayload<{ include: typeof dayInclude }>;

function toTripListRecord(row: TripGroupListRow): TripGroupListRecord {
    return {
        id: row.id,
        createdAt: row.createdAt,
        owner: row.owner,
        trips: row.trips.map((trip): TripListDayRecord => ({
            id: trip.id,
            title: trip.title,
            description: trip.description,
            transport: trip.transport,
            typeOfPeople: trip.typeOfPeople,
            dayNumber: trip.dayNumber,
            createdAt: trip.createdAt,
        })),
    };
}

function toTripDayRecord(row: DayRow | TripGroupDetailsRow['trips'][number]): TripDayRecord {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        transport: row.transport,
        typeOfPeople: row.typeOfPeople,
        dayNumber: row.dayNumber,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        price: row.price ?? null,
        currency: row.currency ?? null,
        destination: row.destination ?? null,
        countPeoples: row.countPeoples,
        lat: row.lat ?? null,
        lng: row.lng ?? null,
        images: row.images.map((image) => ({ id: image.id, filePath: image.filePath })),
        points: sortPointsByNumber(row.points).map(toPointRecord),
    };
}

function toTripDetailsRecord(row: TripGroupDetailsRow): TripGroupDetailsRecord {
    return {
        id: row.id,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        owner: row.owner,
        trips: row.trips.map((trip) => toTripDayRecord(trip)),
    };
}

function toTripDetailsWithPriceRecord(row: TripGroupDetailsWithPriceRow): TripGroupDetailsRecord {
    return {
        id: row.id,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        owner: row.owner,
        trips: row.trips.map((trip) => toTripDayRecord(trip)),
    };
}

export class TripRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async findPage(criteria: TripListCriteria): Promise<{ rows: TripGroupListRecord[]; total: number }> {
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

        return { rows: rows.map(toTripListRecord), total };
    }

    /**
     * `points` are handed over in `pointNumber` order. The column is a VARCHAR, so
     * the numeric sort happens in code instead of in the query.
     */
    async findById(id: number): Promise<TripGroupDetailsRecord | null> {
        const row = await this.prisma.tripGroup.findUnique({ where: { id }, include: detailsInclude });
        if (!row) return null;

        return toTripDetailsRecord(row);
    }

    async findOwnerId(id: number): Promise<string | null> {
        const group = await this.prisma.tripGroup.findUnique({ where: { id }, select: { ownerId: true } });
        return group?.ownerId ?? null;
    }

    async findOwnedGroupIds(ownerId: string): Promise<number[]> {
        const rows = await this.prisma.tripGroup.findMany({
            where: { ownerId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { id: true },
        });

        return rows.map((row) => row.id);
    }

    /**
     * Full detail records for the given trip group ids, including price,
     * currency, destination, images, and points for each day.
     * Ordered by the input id sequence.
     */
    async findGroupsByIdsWithDetails(groupIds: number[]): Promise<TripGroupDetailsRecord[]> {
        if (groupIds.length === 0) return [];

        const rows = await this.prisma.tripGroup.findMany({
            where: { id: { in: groupIds } },
            include: detailsWithPriceInclude,
        });

        const byId = new Map(rows.map((row) => [row.id, row]));
        return groupIds.flatMap((id) => {
            const row = byId.get(id);
            return row ? [toTripDetailsWithPriceRecord(row)] : [];
        });
    }

    /**
     * Trip-group ids ranked by the number of likes on the group itself
     * (`likes.targetTypeId` = tripGroup, `targetId` = group id): grouped, ordered
     * by count descending and limited. Ties keep the database's order and a group
     * appears at most once; groups without likes are not part of the ranking.
     */
    async findTopGroupIds(limit: number): Promise<number[]> {
        const rows = await this.prisma.like.groupBy({
            by: ['targetId'],
            where: { targetType: { name: SOCIAL_TARGET_TYPE.TRIP_GROUP } },
            orderBy: { _count: { targetId: 'desc' } },
            take: limit,
            _count: { _all: true },
        });

        return rows.map((row) => row.targetId);
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
     * Deletes the whole trip. Day rows cascade to points/images through the FKs;
     * the social records of the group, its days, their points and all images are
     * removed by the central social cleanup in the same transaction, including
     * the favorites whose FK would otherwise block the group delete.
     */
    async delete(id: number): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            const days = await tx.trip.findMany({ where: { tripGroupId: id }, select: { id: true } });
            const dayIds = days.map((day) => day.id);

            const points = await tx.point.findMany({ where: { tripId: { in: dayIds } }, select: { id: true } });
            const pointIds = points.map((point) => point.id);

            const images = await tx.image.findMany({
                where: { OR: [{ tripId: { in: dayIds } }, { pointId: { in: pointIds } }] },
                select: { id: true },
            });

            await deleteSocialRecordsForTargets(tx, [
                ...socialCleanupTargets(SOCIAL_TARGET_TYPE.TRIP_GROUP, [id]),
                ...socialCleanupTargets(SOCIAL_TARGET_TYPE.DAY, dayIds),
                ...socialCleanupTargets(SOCIAL_TARGET_TYPE.POINT, pointIds),
                ...socialCleanupTargets(SOCIAL_TARGET_TYPE.IMAGE, images.map((image) => image.id)),
            ]);

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

    async findDayContext(tripId: number): Promise<DayContext | null> {
        return this.prisma.trip.findUnique({
            where: { id: tripId },
            select: { id: true, dayNumber: true, tripGroupId: true, ownerId: true },
        });
    }

    /** `null` means the trip already has a day with that number. */
    async createDay(
        groupId: number,
        dayNumber: number,
        fields: DayWriteInput,
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

    async updateDay(tripId: number, fields: DayUpdateInput): Promise<void> {
        await this.prisma.trip.update({
            where: { id: tripId },
            data: {
                ...(fields.title !== undefined ? { title: fields.title } : {}),
                ...(fields.description !== undefined ? { description: fields.description } : {}),
            },
        });
    }

    /**
     * Renumbers every day of the group to its position in `tripIds`. The UNIQUE
     * (tripGroupId, dayNumber) constraint makes a direct write fail mid-swap, so
     * every day is parked on a temporary negative number first.
     */
    async reorderDays(groupId: number, tripIds: number[]): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            for (const [index, tripId] of tripIds.entries()) {
                await tx.trip.update({ where: { id: tripId }, data: { dayNumber: -(index + 1) } });
            }
            for (const [index, tripId] of tripIds.entries()) {
                await tx.trip.update({ where: { id: tripId }, data: { dayNumber: index + 1 } });
            }
        });
    }

    async listDayRows(groupId: number): Promise<TripDayRecord[]> {
        const days = await this.prisma.trip.findMany({
            where: { tripGroupId: groupId },
            orderBy: [{ dayNumber: 'asc' }, { id: 'asc' }],
            include: dayInclude,
        });
        return days.map((day) => toTripDayRecord(day));
    }

    /**
     * Removes the day row in one transaction. Points and images cascade through
     * their FKs; the social records of the day, its points and every image that
     * hangs off the day row or off one of its points are removed by the central
     * social cleanup in the same transaction.
     */
    async deleteDay(tripId: number): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            const points = await tx.point.findMany({ where: { tripId }, select: { id: true } });
            const pointIds = points.map((point) => point.id);

            const images = await tx.image.findMany({
                where: { OR: [{ tripId }, { pointId: { in: pointIds } }] },
                select: { id: true },
            });

            await deleteSocialRecordsForTargets(tx, [
                ...socialCleanupTargets(SOCIAL_TARGET_TYPE.DAY, [tripId]),
                ...socialCleanupTargets(SOCIAL_TARGET_TYPE.POINT, pointIds),
                ...socialCleanupTargets(SOCIAL_TARGET_TYPE.IMAGE, images.map((image) => image.id)),
            ]);

            await tx.trip.delete({ where: { id: tripId } });
        });
    }

    /** Image file paths of the day itself, i.e. rows attached through `Image.tripId`. */
    async listDayImagePaths(tripId: number): Promise<string[]> {
        const images = await this.prisma.image.findMany({ where: { tripId }, select: { filePath: true } });
        return images.map((image) => image.filePath);
    }

    /**
     * Images currently attached to a day row (`Image.tripId`), used to refuse an
     * upload before the file is stored.
     */
    async countImages(tripId: number): Promise<number> {
        return this.prisma.image.count({ where: { tripId } });
    }

    /**
     * Appends one image row attached to a day: `Image.tripId` carries the `Trip.id`
     * of that day row. `pointId` stays unset, so the row belongs to the day only.
     * `null` means the day already carries the maximum number of images.
     */
    async createImage(data: { ownerId: string; filePath: string; tripId: number }): Promise<number | null> {
        const { tripId, ...rest } = data;

        return attachImageWithinLimit(
            this.prisma,
            { tripId },
            (tx) => tx.image.create({ data: { ...rest, tripId, createdAt: new Date() }, select: { id: true } }),
        );
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
        await this.prisma.$transaction(async (tx) => {
            // The image row is removed together with every social record that
            // targets it (likes/comments/reports and any future relationship).
            await deleteSocialRecordsForTargets(tx, socialCleanupTargets(SOCIAL_TARGET_TYPE.IMAGE, [imageId]));

            await tx.image.delete({ where: { id: imageId } });
        });
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

    /** Image file paths of the points of the day, i.e. rows attached through `Image.pointId`. */
    async listPointImagePathsOfDay(tripId: number): Promise<string[]> {
        const images = await this.prisma.image.findMany({
            where: { point: { tripId } },
            select: { filePath: true },
        });
        return images.map((image) => image.filePath);
    }

}
