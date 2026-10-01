import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { GROUP_SELECT_TYPE, TRANSPORT_SELECT_TYPE } from '../constants/trip';
import { IMAGE_LIMIT_MESSAGE, MAX_IMAGES_PER_ENTITY } from '../constants/imageStorage';
import { ImageDto } from '../model/image';
import { SocialTargetRef } from '../model/social';
import {
    TripActor,
    TripDay,
    TripDetails,
    TripListResponse,
} from '../model/trip';
import { ImageFileStorage } from '../storage/imageFileStorage';
import { ApiError } from '../utils/apiError';
import { canModifyTrip } from '../utils/authorization';
import { getImageBaseUrl } from '../utils/image';
import { toImageDto } from '../mappers/imageMapper';
import {
    toDayWriteInput,
    toTripDayDto,
    toTripDayDtoList,
    toTripDetailsDto,
    toTripListItemList,
    toTripListResponse,
    toTripMetadataInput,
} from '../mappers/tripMapper';
import {
    parseDayCreateBody,
    parseDayUpdateBody,
    parseListQuery,
    parseTripBody,
    parseTripId,
    resolveSelectFilterValues,
} from '../utils/trip';
import { dynamicConfig } from './dynamicConfig';
import { parseIdList, parsePositiveId } from '../utils/validation';
import { attachUploadedImage } from './imageAttachment';
import { SocialStateService } from './socialStateService';
import { DayContext, TripRepository } from '../repositories/tripRepository';
import { TripGroupDetailsRecord } from '../model/trip';

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
        const items = toTripListItemList(
            rows,
            covers,
            getImageBaseUrl(),
            dynamicConfig.getSelectType(GROUP_SELECT_TYPE)?.options ?? [],
            dynamicConfig.getSelectType(TRANSPORT_SELECT_TYPE)?.options ?? [],
        );

        return toTripListResponse(items, query.page, query.limit, total);
    }

    /** `actor` is optional: the trip is public, but it carries the viewer's social state. */
    async getTrip(rawId: string, actor: TripActor | null): Promise<TripDetails> {
        const row = await this.repository.findById(parseTripId(rawId));
        if (!row) throw ApiError.tripNotFound();

        return this.toDetails(row, actor);
    }

    async createTrip(actor: TripActor, body: unknown): Promise<TripDetails> {
        const request = parseTripBody(body);
        const createdId = await this.repository.createTrip(toTripMetadataInput(actor.id, request));

        return this.getTrip(String(createdId), actor);
    }

    async updateTrip(actor: TripActor, rawId: string, body: unknown): Promise<TripDetails> {
        const tripGroupId = parseTripId(rawId);
        const ownerId = await this.assertCanModify(actor, tripGroupId);
        const request = parseTripBody(body);

        await this.repository.updateTripMetadata(tripGroupId, toTripMetadataInput(ownerId, request));

        return this.getTrip(rawId, actor);
    }

    async deleteTrip(actor: TripActor, rawId: string): Promise<void> {
        const tripGroupId = parseTripId(rawId);
        await this.assertCanModify(actor, tripGroupId);

        await this.imageStorage.removeMany(await this.repository.listTripImagePaths(tripGroupId));
        await this.repository.delete(tripGroupId);
    }

    private async toDetails(row: TripGroupDetailsRecord, actor: TripActor | null): Promise<TripDetails> {
        const targets: SocialTargetRef[] = [{ targetType: SOCIAL_TARGET_TYPE.TRIP_GROUP, targetId: row.id }];
        for (const day of row.trips) {
            targets.push(...toDayTargets(day));
        }

        const states = await this.socialStates.statesFor(actor?.id ?? null, targets);

        return toTripDetailsDto(
            row,
            states,
            getImageBaseUrl(),
            dynamicConfig.getSelectType(GROUP_SELECT_TYPE)?.options ?? [],
            dynamicConfig.getSelectType(TRANSPORT_SELECT_TYPE)?.options ?? [],
        );
    }

    async createDay(actor: TripActor, rawTripId: string, body: unknown): Promise<TripDay> {
        const tripGroupId = parseTripId(rawTripId);
        await this.assertCanModify(actor, tripGroupId);

        const request = parseDayCreateBody(body);
        const dayNumber = request.dayNumber ?? (await this.repository.findMaxDayNumber(tripGroupId)) + 1;

        const canonicalDay = await this.repository.findCanonicalDay(tripGroupId);
        // A day IS a `trips` row, so the id it is created with is the `tripId`
        // every image of that day is attached through.
        const tripId = await this.repository.createDay(
            tripGroupId,
            dayNumber,
            toDayWriteInput(request),
            actor.id,
            canonicalDay?.typeOfPeople ?? null,
            canonicalDay?.transport ?? null,
        );
        if (tripId === null) throw ApiError.conflict(`Day ${dayNumber} already exists in this trip.`);

        return this.getDayRow(tripId, actor);
    }

    async updateDay(actor: TripActor, rawTripId: string, rawDayId: string, body: unknown): Promise<TripDay> {
        const tripGroupId = parseTripId(rawTripId);
        const tripId = parsePositiveId(rawDayId, 'Day id');
        await this.assertDayAccess(actor, tripGroupId, tripId);

        const request = parseDayUpdateBody(body);
        await this.repository.updateDay(tripId, request);

        return this.getDayRow(tripId, actor);
    }

    async reorderDays(actor: TripActor, rawTripId: string, body: unknown): Promise<TripDay[]> {
        const tripGroupId = parseTripId(rawTripId);
        await this.assertCanModify(actor, tripGroupId);

        // The API calls the ordered ids `dayIds`; each entry is a `trips` row id.
        const tripIds = parseIdList(body, 'dayIds', 1);
        const existing = await this.repository.listDayIds(tripGroupId);
        if (existing.length !== tripIds.length || tripIds.some((tripId) => !existing.includes(tripId))) {
            throw ApiError.validation('"dayIds" must contain exactly all days of this trip.');
        }

        await this.repository.reorderDays(tripGroupId, tripIds);

        const days = await this.repository.listDayRows(tripGroupId);
        const states = await this.socialStates.statesFor(actor.id, days.flatMap((day) => toDayTargets(day)));
        return toTripDayDtoList(days, states, getImageBaseUrl());
    }

    async deleteDay(actor: TripActor, rawTripId: string, rawDayId: string): Promise<void> {
        const tripGroupId = parseTripId(rawTripId);
        const tripId = parsePositiveId(rawDayId, 'Day id');
        await this.assertDayAccess(actor, tripGroupId, tripId);

        if (await this.repository.countDays(tripGroupId) <= 1) {
            throw ApiError.conflict('The last day of a trip cannot be deleted.');
        }

        // Storage is cleared before the rows, so a storage failure leaves the
        // database untouched instead of pointing at missing files. Day images hang
        // off `Image.tripId`, point images off `Image.pointId` on that same day row.
        const filePaths = [
            ...(await this.repository.listDayImagePaths(tripId)),
            ...(await this.repository.listPointImagePathsOfDay(tripId)),
        ];
        await this.imageStorage.removeMany(filePaths);

        await this.repository.deleteDay(tripId);
    }

    /**
     * Runs before multer stores anything: the day must belong to the trip group of
     * the URL, the actor must be allowed to change that group, and the day must
     * still have a free image slot. A refusal therefore never touches storage.
     */
    async assertDayImageUpload(actor: TripActor, rawTripId: string, rawDayId: string): Promise<void> {
        const tripGroupId = parseTripId(rawTripId);
        const tripId = parsePositiveId(rawDayId, 'Day id');
        await this.assertDayAccess(actor, tripGroupId, tripId);
        await this.assertImageSlot(tripId);
    }

    /**
     * Attaches a day image to the day ROW: `Image.tripId` is the `Trip.id` of that
     * day, never the trip group and never `dayNumber`. There is no separate day
     * entity, so no other identifier exists for a day.
     *
     * The object is already in the bucket when this runs, so a row that cannot be
     * written removes it again.
     */
    async addDayImage(actor: TripActor, rawTripId: string, rawDayId: string, filePath: string): Promise<ImageDto> {
        const tripGroupId = parseTripId(rawTripId);
        const tripId = parsePositiveId(rawDayId, 'Day id');
        await this.assertDayAccess(actor, tripGroupId, tripId);

        const imageId = await attachUploadedImage(
            this.imageStorage,
            filePath,
            () => this.repository.createImage({ ownerId: actor.id, filePath, tripId }),
        );

        return toImageDto({ id: imageId, filePath }, getImageBaseUrl());
    }

    /** The cap is per day row; it is re-checked in the repository to stay authoritative. */
    private async assertImageSlot(tripId: number): Promise<void> {
        if ((await this.repository.countImages(tripId)) >= MAX_IMAGES_PER_ENTITY) {
            throw ApiError.conflict(IMAGE_LIMIT_MESSAGE);
        }
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

    private async getDayRow(tripId: number, actor: TripActor): Promise<TripDay> {
        const row = await this.repository.findDayRow(tripId);
        if (!row) throw ApiError.notFound('Day not found.');

        const states = await this.socialStates.statesFor(actor.id, toDayTargets(row));
        return toTripDayDto(row, states, getImageBaseUrl());
    }

    /**
     * The URL's `:dayId` is a `trips` row id (`Image.tripId` for that day), and the
     * URL's `:tripId` is its `trip_groups` row. The day must belong to the group of
     * the URL, and ownership is checked on that group.
     */
    private async assertDayAccess(actor: TripActor, tripGroupId: number, tripId: number): Promise<DayContext> {
        const day = await this.repository.findDayContext(tripId);
        if (!day || day.tripGroupId !== tripGroupId) throw ApiError.notFound('Day not found.');

        await this.assertCanModify(actor, tripGroupId);
        return day;
    }

    private async assertCanModify(actor: TripActor, tripGroupId: number): Promise<string> {
        const ownerId = await this.repository.findOwnerId(tripGroupId);
        if (ownerId === null) throw ApiError.tripNotFound();

        if (!canModifyTrip(actor, ownerId)) {
            throw ApiError.forbidden('Only the trip owner can modify this trip.');
        }
        return ownerId;
    }
}

