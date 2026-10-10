import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { GROUP_SELECT_TYPE, TOP_TRIPS_LIMIT, TRANSPORT_SELECT_TYPE, CURRENCY_SELECT_TYPE } from '../constants/trip';
import { IMAGE_LIMIT_MESSAGE, MAX_IMAGES_PER_ENTITY } from '../constants/imageStorage';
import { type ImageDto } from '../model/image';
import { type SocialTargetRef } from '../model/social';
import { type TripActor, type TripDay, type TripGroupResponse } from '../model/trip';
import { type ImageFileStorage } from '../storage/imageFileStorage';
import { ApiError } from '../utils/apiError';
import { canModifyTrip, toResourcePermissions } from '../utils/authorization';
import { getImageBaseUrl } from '../utils/image';
import { toImageDto } from '../mappers/imageMapper';
import {
    toDayWriteInput,
    toTripDayDtoList,
    toTripGroupResponse,
    toTripMetadataInput,
} from '../mappers/tripMapper';
import {
    parseDayCreateBody,
    parseDayUpdateBody,
    parseListQuery,
    parseTripBody,
    parseTripGroupId,
    resolveSelectFilterValues,
} from '../utils/trip';
import { dynamicConfig } from './dynamicConfig';
import { parseIdList, parsePositiveId } from '../utils/validation';
import { attachUploadedImage } from './imageAttachment';
import { type SocialStateService } from './socialStateService';
import { type DayContext, type TripListCriteria, type TripRepository } from '../repositories/tripRepository';
import { type TripGroupDetailsRecord } from '../model/trip';

/** Social targets of one day row: the day itself, its images, its points and their images. */
export function toDayTargets(day: {
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






/**
 * Shared batch preparation of TripGroupResponse for every trip-group read that
 * serves the canonical response (GET /trips, GET /trips/top, GET /trips/:tripGroupId,
 * GET /me/trips, GET /me/favorites). Collects all social targets in one batch
 * and resolves select display values from the dynamic config cache.
 */
export async function toGroupResponses(
    rows: TripGroupDetailsRecord[],
    socialStates: SocialStateService,
    actor: TripActor | null,
): Promise<TripGroupResponse[]> {
    const targets: SocialTargetRef[] = [];
    for (const row of rows) {
        targets.push({ targetType: SOCIAL_TARGET_TYPE.TRIP_GROUP, targetId: row.id });
        for (const day of row.trips) {
            targets.push(...toDayTargets(day));
        }
    }

    const states = await socialStates.statesFor(actor?.id ?? null, targets);

    return rows.map((row) =>
        toTripGroupResponse(
            row,
            states,
            getImageBaseUrl(),
            dynamicConfig.getSelectType(GROUP_SELECT_TYPE)?.options ?? [],
            dynamicConfig.getSelectType(TRANSPORT_SELECT_TYPE)?.options ?? [],
            dynamicConfig.getSelectType(CURRENCY_SELECT_TYPE)?.options ?? [],
            toResourcePermissions(actor, row.owner.id),
        )
    );
}

export class TripService {
    constructor(
        private readonly repository: TripRepository,
        private readonly imageStorage: ImageFileStorage,
        private readonly socialStates: SocialStateService,
    ) { }

    async listTrips(rawQuery: unknown, actor: TripActor | null): Promise<TripGroupResponse[]> {
        const query = parseListQuery(rawQuery);

        const criteria: TripListCriteria = {
            skip: (query.page - 1) * query.limit,
            take: query.limit,
            sort: query.sort,
        };
        if (query.search !== undefined && query.search !== null) {
            criteria.search = query.search;
        }
        if (query.group) {
            criteria.groupValues = resolveSelectFilterValues(GROUP_SELECT_TYPE, query.group, 'group');
        }
        if (query.transport) {
            criteria.transportValues = resolveSelectFilterValues(TRANSPORT_SELECT_TYPE, query.transport, 'transport');
        }

        const { rows } = await this.repository.findPage(criteria);

        const groupIds = rows.map((row) => row.id);
        if (groupIds.length === 0) return [];

        const detailRows = await this.repository.findGroupsByIdsWithDetails(groupIds);
        const byId = new Map(detailRows.map((row) => [row.id, row]));
        const orderedDetails = groupIds.flatMap((id) => {
            const row = byId.get(id);
            return row ? [row] : [];
        });

        return toGroupResponses(orderedDetails, this.socialStates, actor);
    }

    /**
     * `GET /me/trips`: the authenticated actor's own trip groups. Ownership is
     * read from `trip_groups.ownerId` for the actor's id only; the request never
     * carries a user id, so another user's trips cannot be requested.
     */
    async listOwnTrips(actor: TripActor): Promise<TripGroupResponse[]> {
        const groupIds = await this.repository.findOwnedGroupIds(actor.id);
        if (groupIds.length === 0) return [];

        const detailRows = await this.repository.findGroupsByIdsWithDetails(groupIds);
        return toGroupResponses(detailRows, this.socialStates, actor);
    }

    /**
     * `GET /trips/top`: at most `TOP_TRIPS_LIMIT` trip groups ranked by the number
     * of likes on the group itself. The ranking is per trip group and independent
     * of the requesting user; ties keep the database's order.
     */
    async getTopTrips(actor: TripActor | null): Promise<TripGroupResponse[]> {
        const groupIds = await this.repository.findTopGroupIds(TOP_TRIPS_LIMIT);
        if (groupIds.length === 0) return [];

        const detailRows = await this.repository.findGroupsByIdsWithDetails(groupIds);
        const byId = new Map(detailRows.map((row) => [row.id, row]));
        const ranked = groupIds.flatMap((groupId): TripGroupDetailsRecord[] => {
            const row = byId.get(groupId);
            return row ? [row] : [];
        });

        return toGroupResponses(ranked, this.socialStates, actor);
    }

    /** `actor` is optional: the trip is public, but it carries the viewer's social state. */
    async getTrip(rawTripGroupId: string, actor: TripActor | null): Promise<TripGroupResponse> {
        const row = await this.repository.findById(parseTripGroupId(rawTripGroupId));
        if (!row) throw ApiError.tripNotFound();

        return this.toDetails(row, actor);
    }

    async createTrip(actor: TripActor, body: unknown): Promise<TripGroupResponse> {
        const request = parseTripBody(body);
        const createdGroupId = await this.repository.createTrip(toTripMetadataInput(actor.id, request));

        const row = await this.repository.findById(createdGroupId);
        if (!row) throw ApiError.tripNotFound();

        return this.toDetails(row, actor);
    }

    async deleteTrip(actor: TripActor, rawTripGroupId: string): Promise<void> {
        const tripGroupId = parseTripGroupId(rawTripGroupId);
        await this.assertCanModify(actor, tripGroupId);

        await this.imageStorage.removeMany(await this.repository.listTripImagePaths(tripGroupId));
        await this.repository.delete(tripGroupId);
    }

    private async toDetails(row: TripGroupDetailsRecord, actor: TripActor | null): Promise<TripGroupResponse> {
        const [response] = await toGroupResponses([row], this.socialStates, actor);
        if (response === undefined) throw ApiError.tripNotFound();
        return response;
    }

    async createDay(actor: TripActor, rawTripGroupId: string, body: unknown): Promise<TripGroupResponse> {
        const tripGroupId = parseTripGroupId(rawTripGroupId);
        await this.assertCanModify(actor, tripGroupId);

        const request = parseDayCreateBody(body);
        // `dayNumber` is required and user-selected; there is no `max + 1` fallback.
        const dayNumber = request.dayNumber;

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

        const row = await this.repository.findById(tripGroupId);
        if (!row) throw ApiError.tripNotFound();

        return this.toDetails(row, actor);
    }

    async updateDay(actor: TripActor, rawTripGroupId: string, rawTripId: string, body: unknown): Promise<TripGroupResponse> {
        const tripGroupId = parseTripGroupId(rawTripGroupId);
        const tripId = parsePositiveId(rawTripId, 'Trip id');
        await this.assertDayAccess(actor, tripGroupId, tripId);

        const request = parseDayUpdateBody(body);
        await this.repository.updateDay(tripId, request);

        const row = await this.repository.findById(tripGroupId);
        if (!row) throw ApiError.tripNotFound();

        return this.toDetails(row, actor);
    }

    async reorderDays(actor: TripActor, rawTripGroupId: string, body: unknown): Promise<TripDay[]> {
        const tripGroupId = parseTripGroupId(rawTripGroupId);
        const ownerId = await this.assertCanModify(actor, tripGroupId);

        // Each ordered id is the primary key `trips.id` of one day row — never a
        // `dayNumber` and never a `trip_groups.id`.
        const tripIds = parseIdList(body, 'tripIds', 1);
        const existing = await this.repository.listDayIds(tripGroupId);
        if (existing.length !== tripIds.length || tripIds.some((tripId) => !existing.includes(tripId))) {
            throw ApiError.validation('"tripIds" must contain exactly all days of this trip.');
        }

        await this.repository.reorderDays(tripGroupId, tripIds);

        const days = await this.repository.listDayRows(tripGroupId);
        const states = await this.socialStates.statesFor(actor.id, days.flatMap((day) => toDayTargets(day)));
        return toTripDayDtoList(days, states, getImageBaseUrl(), toResourcePermissions(actor, ownerId));
    }

    async deleteDay(actor: TripActor, rawTripGroupId: string, rawTripId: string): Promise<void> {
        const tripGroupId = parseTripGroupId(rawTripGroupId);
        const tripId = parsePositiveId(rawTripId, 'Trip id');
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
    async assertDayImageUpload(actor: TripActor, rawTripGroupId: string, rawTripId: string): Promise<void> {
        const tripGroupId = parseTripGroupId(rawTripGroupId);
        const tripId = parsePositiveId(rawTripId, 'Trip id');
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
    async addDayImage(actor: TripActor, rawTripGroupId: string, rawTripId: string, filePath: string): Promise<ImageDto> {
        const tripGroupId = parseTripGroupId(rawTripGroupId);
        const tripId = parsePositiveId(rawTripId, 'Trip id');
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

    /**
     * The URL's `:tripId` is a `trips` row id (`Image.tripId` for that day), and the
     * URL's `:tripGroupId` is its `trip_groups` row. The day must belong to the group
     * of the URL, and ownership is checked on that group.
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

