import { Prisma, PrismaClient } from '@prisma/client';
import { DEFAULT_COUNT_PEOPLES, TRIP_DAY_TARGET_TYPE, TRIP_GROUP_TARGET_TYPE } from '../constants/trip';

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

export interface TripWritePoint {
    name: string;
    description: string | null;
    /** `points.lat` / `points.lng` are VARCHAR(45) in the live schema. */
    latitude: string | null;
    longitude: string | null;
    images: string[];
}

export interface TripWriteDay {
    dayNumber: number;
    title: string | null;
    description: string | null;
    points: TripWritePoint[];
}

export interface TripWriteInput {
    ownerId: string;
    title: string;
    description: string | null;
    /** Stored value of `trips.typeOfPeople` (dynamic config select key). */
    group: string;
    /** Stored value of `trips.transport` (dynamic config select key). */
    transport: string;
    days: TripWriteDay[];
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

/** Group reference used for like/comment aggregation. */
export interface TripGroupTargetRef {
    id: number;
    tripIds: number[];
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
    _count: { select: { favorites: true } },
} satisfies Prisma.TripGroupInclude;

const detailsInclude = {
    owner: { select: { id: true, firstName: true, lastName: true } },
    trips: {
        orderBy: [{ dayNumber: 'asc' }, { id: 'asc' }],
        include: {
            images: { orderBy: { id: 'asc' }, select: { filePath: true } },
            points: {
                orderBy: { id: 'asc' },
                include: { images: { orderBy: { id: 'asc' }, select: { filePath: true } } },
            },
        },
    },
    _count: { select: { favorites: true } },
} satisfies Prisma.TripGroupInclude;

export type TripGroupListRow = Prisma.TripGroupGetPayload<{ include: typeof listInclude }>;
export type TripGroupDetailsRow = Prisma.TripGroupGetPayload<{ include: typeof detailsInclude }>;

interface TargetCountRow {
    targetTypeId: number;
    targetId: number;
    _count: { _all: number };
}

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

    async findById(id: number): Promise<TripGroupDetailsRow | null> {
        return this.prisma.tripGroup.findUnique({ where: { id }, include: detailsInclude });
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

    countLikes(groups: TripGroupTargetRef[]): Promise<Map<number, number>> {
        return this.countTargets(groups, async (targetIds: number[]): Promise<TargetCountRow[]> => {
            const rows = await this.prisma.like.groupBy({
                by: ['targetTypeId', 'targetId'],
                where: { targetId: { in: targetIds } },
                _count: { _all: true },
            });

            return rows.map((row) => ({
                targetTypeId: row.targetTypeId,
                targetId: row.targetId,
                _count: { _all: row._count._all },
            }));
        });
    }

    countComments(groups: TripGroupTargetRef[]): Promise<Map<number, number>> {
        return this.countTargets(groups, async (targetIds: number[]): Promise<TargetCountRow[]> => {
            const rows = await this.prisma.comment.groupBy({
                by: ['targetTypeId', 'targetId'],
                where: { targetId: { in: targetIds } },
                _count: { _all: true },
            });

            return rows.map((row) => ({
                targetTypeId: row.targetTypeId,
                targetId: row.targetId,
                _count: { _all: row._count._all },
            }));
        });
    }

    async create(input: TripWriteInput): Promise<number> {
        const group = await this.prisma.tripGroup.create({
            data: {
                ownerId: input.ownerId,
                createdAt: new Date(),
                trips: {
                    create: input.days.map((day) => this.toDayCreate(input, day)),
                },
            },
            select: { id: true },
        });

        return group.id;
    }

    /**
     * Replaces the trip content in a single transaction: days present in the input
     * are updated (their points/images are rewritten), days missing from the input
     * are removed and new days are created.
     */
    async update(id: number, input: TripWriteInput): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            const existingDays = await tx.trip.findMany({
                where: { tripGroupId: id },
                orderBy: [{ dayNumber: 'asc' }, { id: 'asc' }],
                select: { id: true, dayNumber: true },
            });

            const requestedDays = new Map(input.days.map((day) => [day.dayNumber, day]));
            const dayNumberOf = (dayNumber: number | null): number => dayNumber ?? -1;

            const obsoleteDayIds = existingDays
                .filter((day) => !requestedDays.has(dayNumberOf(day.dayNumber)))
                .map((day) => day.id);

            if (obsoleteDayIds.length > 0) {
                await tx.trip.deleteMany({ where: { id: { in: obsoleteDayIds } } });
            }

            for (const existingDay of existingDays) {
                const requestedDay = requestedDays.get(dayNumberOf(existingDay.dayNumber));
                if (!requestedDay) continue;

                await tx.trip.update({
                    where: { id: existingDay.id },
                    data: {
                        ...this.toDayFields(input, requestedDay),
                        points: {
                            deleteMany: {},
                            create: requestedDay.points.map((point, index) =>
                                this.toPointCreate(input.ownerId, point, index)),
                        },
                    },
                });
            }

            const newDays = input.days.filter(
                (day) => !existingDays.some((existing) => existing.dayNumber === day.dayNumber),
            );

            for (const newDay of newDays) {
                await tx.trip.create({ data: { ...this.toDayCreate(input, newDay), tripGroupId: id } });
            }
        });
    }

    /**
     * Deletes the whole trip (group + days + points + images through the DB
     * cascades). Favorites are removed explicitly because their FK would block the
     * delete; polymorphic likes/comments belong to their own slices.
     */
    async delete(id: number): Promise<void> {
        await this.prisma.$transaction([
            this.prisma.favorite.deleteMany({ where: { tripGroupId: id } }),
            this.prisma.tripGroup.delete({ where: { id } }),
        ]);
    }

    private toDayCreate(input: TripWriteInput, day: TripWriteDay): Prisma.TripUncheckedCreateWithoutTripGroupInput {
        return {
            ...this.toDayFields(input, day),
            countPeoples: DEFAULT_COUNT_PEOPLES,
            ownerId: input.ownerId,
            createdAt: new Date(),
            points: {
                create: day.points.map((point, index) => this.toPointCreate(input.ownerId, point, index)),
            },
        };
    }

    private toDayFields(
        input: TripWriteInput,
        day: TripWriteDay,
    ): Pick<
        Prisma.TripUncheckedCreateWithoutTripGroupInput,
        'title' | 'description' | 'transport' | 'typeOfPeople' | 'dayNumber'
    > {
        return {
            title: day.title ?? input.title,
            description: day.description ?? input.description,
            transport: input.transport,
            typeOfPeople: input.group,
            dayNumber: day.dayNumber,
        };
    }

    private toPointCreate(
        ownerId: string,
        point: TripWritePoint,
        index: number,
    ): Prisma.PointUncheckedCreateWithoutTripInput {
        return {
            name: point.name,
            description: point.description,
            lat: point.latitude,
            lng: point.longitude,
            pointNumber: String(index + 1),
            ownerId,
            images: {
                create: point.images.map((filePath) => ({ filePath, ownerId })),
            },
        };
    }

    /**
     * Aggregates polymorphic likes/comments per trip group. A row counts for the
     * group when it targets the group itself or one of the group's day rows.
     */
    private async countTargets(
        groups: TripGroupTargetRef[],
        loadCounts: (targetIds: number[]) => Promise<TargetCountRow[]>,
    ): Promise<Map<number, number>> {
        const counts = new Map<number, number>();
        if (groups.length === 0) return counts;

        const targetTypes = await this.prisma.targetType.findMany({
            where: { name: { in: [TRIP_GROUP_TARGET_TYPE, TRIP_DAY_TARGET_TYPE] } },
            select: { id: true, name: true },
        });
        const groupTypeId = targetTypes.find((type) => type.name === TRIP_GROUP_TARGET_TYPE)?.id ?? null;
        const dayTypeId = targetTypes.find((type) => type.name === TRIP_DAY_TARGET_TYPE)?.id ?? null;

        const tripIdToGroupId = new Map<number, number>();
        const targetIds = new Set<number>();

        for (const group of groups) {
            targetIds.add(group.id);
            for (const tripId of group.tripIds) {
                tripIdToGroupId.set(tripId, group.id);
                targetIds.add(tripId);
            }
        }

        const rows = await loadCounts([...targetIds]);

        for (const row of rows) {
            const count = row._count._all;
            if (groupTypeId !== null && row.targetTypeId === groupTypeId) {
                counts.set(row.targetId, (counts.get(row.targetId) ?? 0) + count);
                continue;
            }
            if (dayTypeId !== null && row.targetTypeId === dayTypeId) {
                const groupId = tripIdToGroupId.get(row.targetId);
                if (groupId !== undefined) {
                    counts.set(groupId, (counts.get(groupId) ?? 0) + count);
                }
            }
        }

        return counts;
    }
}
