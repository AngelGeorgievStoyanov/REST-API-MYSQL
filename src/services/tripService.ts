import { GROUP_SELECT_TYPE, MODERATOR_ROLES, TRANSPORT_SELECT_TYPE } from '../constants/trip';
import {
    TripActor,
    TripAuthor,
    TripDay,
    TripDayInput,
    TripDetails,
    TripGroupInfo,
    TripListItem,
    TripListResponse,
    TripPointInput,
    TripStats,
    TripWriteRequest,
} from '../model/trip';
import { ApiError } from '../utils/apiError';
import {
    parseListQuery,
    parseTripBody,
    parseTripId,
    resolveSelectFilterValues,
    resolveSelectValue,
    toImageUrl,
} from '../utils/trip';
import { toIsoString, toNumberOrNull } from '../utils/utils';
import {
    TripGroupDetailsRow,
    TripGroupListRow,
    TripGroupTargetRef,
    TripRepository,
    TripWriteInput,
    TripWritePoint,
} from './tripRepository';

function buildWriteInput(ownerId: string, request: TripWriteRequest): TripWriteInput {
    const days: TripDayInput[] = request.days.length > 0
        ? request.days
        : [{ day: 1, title: null, points: [] }];
    const canonicalDay = Math.min(...days.map((day) => day.day));

    return {
        ownerId,
        title: request.title,
        description: request.description,
        group: request.group,
        transport: request.transport,
        days: days.map((day) => ({
            dayNumber: day.day,
            // A `trips` row carries a single title/description, so the earliest day
            // row holds the trip metadata while the following days keep their own title.
            title: day.day === canonicalDay ? request.title : day.title ?? request.title,
            description: request.description,
            points: day.points.map(toWritePoint),
        })),
    };
}

function toWritePoint(point: TripPointInput): TripWritePoint {
    return {
        name: point.title,
        description: point.description,
        latitude: point.latitude === null ? null : String(point.latitude),
        longitude: point.longitude === null ? null : String(point.longitude),
        images: point.images,
    };
}

function toAuthor(owner: { id: string; firstName: string; lastName: string }): TripAuthor {
    return { id: owner.id, firstName: owner.firstName, lastName: owner.lastName };
}

function latestDayUpdate(trips: { updatedAt: Date | null }[]): Date | null {
    return trips.reduce<Date | null>((latest, trip) => {
        if (!trip.updatedAt) return latest;
        return !latest || trip.updatedAt > latest ? trip.updatedAt : latest;
    }, null);
}

function toListItem(row: TripGroupListRow, covers: Map<number, string>, stats: TripStats): TripListItem {
    const canonicalDay = row.trips[0];
    const coverFilePath = canonicalDay ? covers.get(canonicalDay.id) : undefined;

    return {
        id: row.id,
        title: canonicalDay?.title ?? '',
        description: canonicalDay?.description ?? null,
        group: resolveSelectValue(GROUP_SELECT_TYPE, canonicalDay?.typeOfPeople ?? null),
        transport: resolveSelectValue(TRANSPORT_SELECT_TYPE, canonicalDay?.transport ?? null),
        author: toAuthor(row.owner),
        coverImage: coverFilePath ? toImageUrl(coverFilePath) : null,
        stats,
        createdAt: toIsoString(row.createdAt ?? canonicalDay?.createdAt ?? null),
    };
}

function toDetailsDto(row: TripGroupDetailsRow, stats: TripStats): TripDetails {
    const canonicalDay = row.trips[0];
    const groupValue = resolveSelectValue(GROUP_SELECT_TYPE, canonicalDay?.typeOfPeople ?? null);
    const group: TripGroupInfo = { id: row.id, key: groupValue.key, name: groupValue.name };

    const days: TripDay[] = row.trips.map((trip) => ({
        id: trip.id,
        day: trip.dayNumber ?? 0,
        title: trip.title,
        points: trip.points.map((point) => ({
            id: point.id,
            title: point.name,
            description: point.description,
            latitude: toNumberOrNull(point.lat),
            longitude: toNumberOrNull(point.lng),
            images: point.images.map((image) => toImageUrl(image.filePath)),
        })),
    }));

    return {
        id: row.id,
        title: canonicalDay?.title ?? '',
        description: canonicalDay?.description ?? null,
        group,
        transport: resolveSelectValue(TRANSPORT_SELECT_TYPE, canonicalDay?.transport ?? null),
        author: toAuthor(row.owner),
        coverImage: canonicalDay?.images[0] ? toImageUrl(canonicalDay.images[0].filePath) : null,
        days,
        stats,
        createdAt: toIsoString(row.createdAt ?? canonicalDay?.createdAt ?? null),
        updatedAt: toIsoString(row.updatedAt ?? latestDayUpdate(row.trips)),
    };
}

export class TripService {
    constructor(private readonly repository: TripRepository) { }

    async listTrips(rawQuery: unknown): Promise<TripListResponse> {
        const query = parseListQuery(rawQuery);

        const { rows, total } = await this.repository.findPage({
            skip: (query.page - 1) * query.limit,
            take: query.limit,
            search: query.search ?? undefined,
            groupValues: query.group
                ? resolveSelectFilterValues(GROUP_SELECT_TYPE, query.group, 'group')
                : undefined,
            transportValues: query.transport
                ? resolveSelectFilterValues(TRANSPORT_SELECT_TYPE, query.transport, 'transport')
                : undefined,
            sort: query.sort,
        });

        const groups: TripGroupTargetRef[] = rows.map((row) => ({
            id: row.id,
            tripIds: row.trips.map((trip) => trip.id),
        }));
        const coverTripIds = rows
            .map((row) => row.trips[0]?.id)
            .filter((tripId): tripId is number => tripId !== undefined);

        const [covers, likes, comments] = await Promise.all([
            this.repository.findCoverImages(coverTripIds),
            this.repository.countLikes(groups),
            this.repository.countComments(groups),
        ]);

        const items = rows.map((row) => toListItem(row, covers, {
            likes: likes.get(row.id) ?? 0,
            favorites: row._count.favorites,
            comments: comments.get(row.id) ?? 0,
        }));

        return {
            items,
            pagination: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
            },
        };
    }

    async getTrip(rawId: string): Promise<TripDetails> {
        const row = await this.repository.findById(parseTripId(rawId));
        if (!row) throw ApiError.tripNotFound();

        return this.toDetails(row);
    }

    async createTrip(actor: TripActor, body: unknown): Promise<TripDetails> {
        const request = parseTripBody(body);
        const createdId = await this.repository.create(buildWriteInput(actor.id, request));

        return this.getTrip(String(createdId));
    }

    async updateTrip(actor: TripActor, rawId: string, body: unknown): Promise<TripDetails> {
        const id = parseTripId(rawId);
        const ownerId = await this.assertCanModify(actor, id);
        const request = parseTripBody(body);

        await this.repository.update(id, buildWriteInput(ownerId, request));

        return this.getTrip(rawId);
    }

    async deleteTrip(actor: TripActor, rawId: string): Promise<void> {
        const id = parseTripId(rawId);
        await this.assertCanModify(actor, id);

        await this.repository.delete(id);
    }

    private async toDetails(row: TripGroupDetailsRow): Promise<TripDetails> {
        const group: TripGroupTargetRef = {
            id: row.id,
            tripIds: row.trips.map((trip) => trip.id),
        };
        const [likes, comments] = await Promise.all([
            this.repository.countLikes([group]),
            this.repository.countComments([group]),
        ]);

        return toDetailsDto(row, {
            likes: likes.get(row.id) ?? 0,
            favorites: row._count.favorites,
            comments: comments.get(row.id) ?? 0,
        });
    }

    private async assertCanModify(actor: TripActor, tripId: number): Promise<string> {
        const ownerId = await this.repository.findOwnerId(tripId);
        if (ownerId === null) throw ApiError.tripNotFound();

        if (ownerId !== actor.id && !MODERATOR_ROLES.includes(actor.role)) {
            throw ApiError.forbidden('Only the trip owner can modify this trip.');
        }
        return ownerId;
    }
}

