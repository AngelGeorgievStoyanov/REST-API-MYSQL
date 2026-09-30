import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { GROUP_SELECT_TYPE, TRANSPORT_SELECT_TYPE } from '../constants/trip';
import { ImageDto } from '../model/image';
import { SocialStates, SocialTargetRef } from '../model/social';
import {
    TripActor,
    TripAuthor,
    TripDay,
    TripDetails,
    TripGroupInfo,
    TripListItem,
    TripListResponse,
    TripWriteRequest,
} from '../model/trip';
import { ImageFileStorage } from '../storage/imageFileStorage';
import { ApiError } from '../utils/apiError';
import { canModifyTrip } from '../utils/authorization';
import { toImageDto, toImageUrl, toSocialImageDto } from '../utils/image';
import {
    parseDayCreateBody,
    parseDayUpdateBody,
    parseListQuery,
    parseTripBody,
    parseTripId,
    resolveSelectFilterValues,
    resolveSelectValue,
} from '../utils/trip';
import { toIsoString } from '../utils/utils';
import { parseIdList, parsePositiveId } from '../utils/validation';
import { toPointDto } from './pointService';
import { SocialStateService } from './socialStateService';
import {
    DayContext,
    DayRow,
    TripGroupDetailsRow,
    TripGroupListRow,
    TripMetadataInput,
    TripRepository,
} from '../repositories/tripRepository';

/** Social targets of one day row: the day itself, its images, its points and their images. */
function toDayTargets(day: {
    id: number;
    images: { id: number }[];
    points: { id: number; images: { id: number }[] }[];
}): SocialTargetRef[] {
    const targets: SocialTargetRef[] = [{ targetType: SOCIAL_TARGET_TYPE.DAY, targetId: day.id }];

    for (const image of day.images) {
        targets.push({ targetType: SOCIAL_TARGET_TYPE.IMAGE, targetId: image.id });
    }
    for (const point of day.points) {
        targets.push({ targetType: SOCIAL_TARGET_TYPE.POINT, targetId: point.id });
        for (const image of point.images) {
            targets.push({ targetType: SOCIAL_TARGET_TYPE.IMAGE, targetId: image.id });
        }
    }
    return targets;
}

function toDayDto(row: DayRow, states: SocialStates): TripDay {
    return {
        id: row.id,
        day: row.dayNumber ?? 0,
        title: row.title,
        images: row.images.map((image) => toSocialImageDto(image, states)),
        points: row.points.map((point) => toPointDto(point, states)),
        social: states.get(SOCIAL_TARGET_TYPE.DAY, row.id),
    };
}

function toMetadataInput(ownerId: string, request: TripWriteRequest): TripMetadataInput {
    return {
        ownerId,
        title: request.title,
        description: request.description,
        group: request.group,
        transport: request.transport,
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

function toListItem(row: TripGroupListRow, covers: Map<number, string>): TripListItem {
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
        createdAt: toIsoString(row.createdAt ?? canonicalDay?.createdAt ?? null),
    };
}

function toDetailsDto(row: TripGroupDetailsRow, states: SocialStates): TripDetails {
    const canonicalDay = row.trips[0];
    const groupValue = resolveSelectValue(GROUP_SELECT_TYPE, canonicalDay?.typeOfPeople ?? null);
    const group: TripGroupInfo = { id: row.id, key: groupValue.key, name: groupValue.name };

    const days: TripDay[] = row.trips.map((trip) => ({
        id: trip.id,
        day: trip.dayNumber ?? 0,
        title: trip.title,
        images: trip.images.map((image) => toSocialImageDto(image, states)),
        points: trip.points.map((point) => toPointDto(point, states)),
        social: states.get(SOCIAL_TARGET_TYPE.DAY, trip.id),
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
        social: states.get(SOCIAL_TARGET_TYPE.TRIP_GROUP, row.id),
        createdAt: toIsoString(row.createdAt ?? canonicalDay?.createdAt ?? null),
        updatedAt: toIsoString(row.updatedAt ?? latestDayUpdate(row.trips)),
    };
}

export class TripService {
    constructor(
        private readonly repository: TripRepository,
        private readonly imageStorage: ImageFileStorage,
        private readonly socialStates: SocialStateService,
    ) { }

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

        const coverTripIds = rows
            .map((row) => row.trips[0]?.id)
            .filter((tripId): tripId is number => tripId !== undefined);

        const covers = await this.repository.findCoverImages(coverTripIds);
        const items = rows.map((row) => toListItem(row, covers));

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

    /** `actor` is optional: the trip is public, but it carries the viewer's social state. */
    async getTrip(rawId: string, actor: TripActor | null): Promise<TripDetails> {
        const row = await this.repository.findById(parseTripId(rawId));
        if (!row) throw ApiError.tripNotFound();

        return this.toDetails(row, actor);
    }

    async createTrip(actor: TripActor, body: unknown): Promise<TripDetails> {
        const request = parseTripBody(body);
        const createdId = await this.repository.createTrip(toMetadataInput(actor.id, request));

        return this.getTrip(String(createdId), actor);
    }

    async updateTrip(actor: TripActor, rawId: string, body: unknown): Promise<TripDetails> {
        const id = parseTripId(rawId);
        const ownerId = await this.assertCanModify(actor, id);
        const request = parseTripBody(body);

        await this.repository.updateTripMetadata(id, toMetadataInput(ownerId, request));

        return this.getTrip(rawId, actor);
    }

    async deleteTrip(actor: TripActor, rawId: string): Promise<void> {
        const id = parseTripId(rawId);
        await this.assertCanModify(actor, id);

        await this.imageStorage.removeMany(await this.repository.listTripImagePaths(id));
        await this.repository.delete(id);
    }

    private async toDetails(row: TripGroupDetailsRow, actor: TripActor | null): Promise<TripDetails> {
        const targets: SocialTargetRef[] = [{ targetType: SOCIAL_TARGET_TYPE.TRIP_GROUP, targetId: row.id }];
        for (const day of row.trips) {
            targets.push(...toDayTargets(day));
        }

        const states = await this.socialStates.statesFor(actor?.id ?? null, targets);

        return toDetailsDto(row, states);
    }

    async createDay(actor: TripActor, rawTripId: string, body: unknown): Promise<TripDay> {
        const tripId = parseTripId(rawTripId);
        await this.assertCanModify(actor, tripId);

        const request = parseDayCreateBody(body);
        const dayNumber = request.dayNumber ?? (await this.repository.findMaxDayNumber(tripId)) + 1;

        const canonicalDay = await this.repository.findCanonicalDay(tripId);
        const dayId = await this.repository.createDay(
            tripId,
            dayNumber,
            { title: request.title, description: request.description },
            actor.id,
            canonicalDay?.typeOfPeople ?? null,
            canonicalDay?.transport ?? null,
        );
        if (dayId === null) throw ApiError.conflict(`Day ${dayNumber} already exists in this trip.`);

        return this.getDayRow(dayId, actor);
    }

    async updateDay(actor: TripActor, rawTripId: string, rawDayId: string, body: unknown): Promise<TripDay> {
        const tripId = parseTripId(rawTripId);
        const dayId = parsePositiveId(rawDayId, 'Day id');
        await this.assertDayAccess(actor, tripId, dayId);

        const request = parseDayUpdateBody(body);
        await this.repository.updateDay(dayId, request);

        return this.getDayRow(dayId, actor);
    }

    async reorderDays(actor: TripActor, rawTripId: string, body: unknown): Promise<TripDay[]> {
        const tripId = parseTripId(rawTripId);
        await this.assertCanModify(actor, tripId);

        const dayIds = parseIdList(body, 'dayIds', 1);
        const existing = await this.repository.listDayIds(tripId);
        if (existing.length !== dayIds.length || dayIds.some((dayId) => !existing.includes(dayId))) {
            throw ApiError.validation('"dayIds" must contain exactly all days of this trip.');
        }

        await this.repository.reorderDays(tripId, dayIds);

        const days = await this.repository.listDayRows(tripId);
        const states = await this.socialStates.statesFor(actor.id, days.flatMap((day) => toDayTargets(day)));
        return days.map((day) => toDayDto(day, states));
    }

    async deleteDay(actor: TripActor, rawTripId: string, rawDayId: string): Promise<void> {
        const tripId = parseTripId(rawTripId);
        const dayId = parsePositiveId(rawDayId, 'Day id');
        await this.assertDayAccess(actor, tripId, dayId);

        if (await this.repository.countDays(tripId) <= 1) {
            throw ApiError.conflict('The last day of a trip cannot be deleted.');
        }

        // Storage is cleared before the rows, so a storage failure leaves the
        // database untouched instead of pointing at missing files.
        const filePaths = [
            ...(await this.repository.listDayImagePaths(dayId)),
            ...(await this.repository.listPointImagePathsOfDay(dayId)),
        ];
        await this.imageStorage.removeMany(filePaths);

        await this.repository.deleteDay(dayId);
    }

    async assertDayImageUpload(actor: TripActor, rawTripId: string, rawDayId: string): Promise<void> {
        await this.assertDayAccess(actor, parseTripId(rawTripId), parsePositiveId(rawDayId, 'Day id'));
    }

    async addDayImage(actor: TripActor, rawTripId: string, rawDayId: string, filePath: string): Promise<ImageDto> {
        const tripId = parseTripId(rawTripId);
        const dayId = parsePositiveId(rawDayId, 'Day id');
        await this.assertDayAccess(actor, tripId, dayId);

        const imageId = await this.repository.createImage({ ownerId: actor.id, filePath, tripId: dayId });
        return toImageDto({ id: imageId, filePath });
    }

    async deleteImage(actor: TripActor, rawImageId: string): Promise<void> {
        const imageId = parsePositiveId(rawImageId, 'Image id');
        const image = await this.repository.findImageContext(imageId);
        if (!image || image.tripGroupId === null) throw ApiError.notFound('Image not found.');

        await this.assertCanModify(actor, image.tripGroupId);

        // The file goes first: the row is only dropped once storage succeeded.
        await this.imageStorage.remove(image.filePath);
        await this.repository.deleteImage(imageId);
    }

    private async getDayRow(dayId: number, actor: TripActor): Promise<TripDay> {
        const row = await this.repository.findDayRow(dayId);
        if (!row) throw ApiError.notFound('Day not found.');

        const states = await this.socialStates.statesFor(actor.id, toDayTargets(row));
        return toDayDto(row, states);
    }

    /** The day must belong to the trip from the URL; ownership is checked on the trip. */
    private async assertDayAccess(actor: TripActor, tripId: number, dayId: number): Promise<DayContext> {
        const day = await this.repository.findDayContext(dayId);
        if (!day || day.tripGroupId !== tripId) throw ApiError.notFound('Day not found.');

        await this.assertCanModify(actor, tripId);
        return day;
    }

    private async assertCanModify(actor: TripActor, tripId: number): Promise<string> {
        const ownerId = await this.repository.findOwnerId(tripId);
        if (ownerId === null) throw ApiError.tripNotFound();

        if (!canModifyTrip(actor, ownerId)) {
            throw ApiError.forbidden('Only the trip owner can modify this trip.');
        }
        return ownerId;
    }
}

