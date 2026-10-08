import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { IMAGE_LIMIT_MESSAGE, MAX_IMAGES_PER_ENTITY } from '../constants/imageStorage';
import { ImageDto } from '../model/image';
import { SocialTargetRef } from '../model/social';
import { PointRecord, TripActor, TripPoint } from '../model/trip';
import { ImageFileStorage } from '../storage/imageFileStorage';
import { ApiError } from '../utils/apiError';
import { canModifyTrip, toResourcePermissions } from '../utils/authorization';
import { getImageBaseUrl } from '../utils/image';
import { toImageDto } from '../mappers/imageMapper';
import { toPointDtoList, toPointUpdateInput, toPointWriteInput } from '../mappers/pointMapper';
import { parsePointCreateBody, parsePointUpdateBody } from '../utils/point';
import { parseIdList, parsePositiveId } from '../utils/validation';
import { toNumberOrNull } from '../utils/utils';
import { attachUploadedImage } from './imageAttachment';
import { PointContext, PointDayContext, PointRepository } from '../repositories/pointRepository';
import { SocialStateService } from './socialStateService';

/** Targets of a batch of point rows: the points themselves and their images. */
function toPointTargets(rows: PointRecord[]): SocialTargetRef[] {
    const targets: SocialTargetRef[] = [];

    for (const row of rows) {
        targets.push({ targetType: SOCIAL_TARGET_TYPE.POINT, targetId: row.id });
        for (const image of row.images) {
            targets.push({ targetType: SOCIAL_TARGET_TYPE.IMAGE, targetId: image.id });
        }
    }
    return targets;
}

export class PointService {
    constructor(
        private readonly repository: PointRepository,
        private readonly imageStorage: ImageFileStorage,
        private readonly socialStates: SocialStateService,
    ) { }

    async getPoint(rawPointId: string, actor: TripActor | null): Promise<TripPoint> {
        const pointId = parsePositiveId(rawPointId, 'Point id');
        const row = await this.repository.findRow(pointId);
        if (!row) throw ApiError.notFound('Point not found.');

        // The day context carries the group owner the response permissions are computed from.
        const context = await this.repository.findContext(pointId);
        return (await this.mapRows([row], actor, context?.groupOwnerId ?? null))[0];
    }

    /**
     * The complete point collection of one day, in the shared `TripPoint` shape.
     * The collection read and the create/update responses all answer with this
     * construction, so every collection response comes from the same mapper and
     * one social batch for the points and their images.
     */
    async getTripPoints(rawTripId: string, actor: TripActor | null): Promise<TripPoint[]> {
        const tripId = parsePositiveId(rawTripId, 'Trip id');
        const day = await this.repository.findDayContext(tripId);
        if (!day) throw ApiError.notFound('Day not found.');

        return this.listCollection(tripId, actor, day.groupOwnerId);
    }

    async createPoint(actor: TripActor, body: unknown): Promise<TripPoint[]> {
        const request = parsePointCreateBody(body);
        // The request field is the API's `dayId`; its value is the day row's `Trip.id`.
        const day = await this.assertDayAccess(actor, request.dayId);

        await this.repository.create(day.tripId, actor.id, toPointWriteInput(request));

        // The response is the current collection of the day the new point belongs to.
        return this.listCollection(day.tripId, actor, day.groupOwnerId);
    }

    async updatePoint(actor: TripActor, rawPointId: string, body: unknown): Promise<TripPoint[]> {
        const pointId = parsePositiveId(rawPointId, 'Point id');
        const point = await this.assertPointAccess(actor, pointId);

        const request = parsePointUpdateBody(body);
        await this.repository.update(pointId, toPointUpdateInput(request));

        // The response is the current collection of the day the point belongs to.
        return this.listCollection(point.tripId, actor, point.groupOwnerId);
    }

    async deletePoint(actor: TripActor, rawPointId: string): Promise<void> {
        const pointId = parsePositiveId(rawPointId, 'Point id');
        const point = await this.assertPointAccess(actor, pointId);

        // Storage is cleared before the row, so a storage failure leaves the
        // database untouched instead of pointing at missing files.
        await this.imageStorage.removeMany(await this.repository.listImagePaths(pointId));
        await this.repository.deleteAndCompact(point.tripId, pointId, toNumberOrNull(point.pointNumber) ?? 0);
    }

    /** `pointIds` is the complete, ordered list of the points of one day. */
    async reorderPoints(actor: TripActor, rawDayId: string, body: unknown): Promise<TripPoint[]> {
        const tripId = parsePositiveId(rawDayId, 'Day id');
        const day = await this.assertDayAccess(actor, tripId);

        const pointIds = parseIdList(body, 'pointIds', 0);
        const existing = await this.repository.listIds(tripId);
        if (existing.length !== pointIds.length || pointIds.some((pointId) => !existing.includes(pointId))) {
            throw ApiError.validation('"pointIds" must contain exactly all points of this day.');
        }

        await this.repository.reorder(tripId, pointIds);

        return this.listCollection(tripId, actor, day.groupOwnerId);
    }

    /**
     * Runs before multer stores anything: the point must exist, the actor must be
     * allowed to change its trip group, and the point must still have a free image
     * slot. A refusal therefore never touches storage.
     */
    async assertPointImageUpload(actor: TripActor, rawPointId: string): Promise<void> {
        const pointId = parsePositiveId(rawPointId, 'Point id');
        await this.assertPointAccess(actor, pointId);
        await this.assertImageSlot(pointId);
    }

    /**
     * Attaches an image to the POINT: `Image.pointId` carries the `Point.id` and
     * `tripId` stays unset. The object is already in the bucket when this runs, so
     * a row that cannot be written removes it again.
     */
    async addPointImage(actor: TripActor, rawPointId: string, filePath: string): Promise<ImageDto> {
        const pointId = parsePositiveId(rawPointId, 'Point id');
        await this.assertPointAccess(actor, pointId);

        const imageId = await attachUploadedImage(
            this.imageStorage,
            filePath,
            () => this.repository.createImage(pointId, actor.id, filePath),
        );

        return toImageDto({ id: imageId, filePath }, getImageBaseUrl());
    }

    /** The cap is per point; it is re-checked in the repository to stay authoritative. */
    private async assertImageSlot(pointId: number): Promise<void> {
        if ((await this.repository.countImages(pointId)) >= MAX_IMAGES_PER_ENTITY) {
            throw ApiError.conflict(IMAGE_LIMIT_MESSAGE);
        }
    }

    async deletePointImage(actor: TripActor, rawPointId: string, rawImageId: string): Promise<void> {
        const pointId = parsePositiveId(rawPointId, 'Point id');
        await this.assertPointAccess(actor, pointId);

        const image = await this.repository.findImage(pointId, parsePositiveId(rawImageId, 'Image id'));
        if (!image) throw ApiError.notFound('Image not found.');

        // Original and thumbnail go first: the row is only dropped once storage succeeded.
        await this.imageStorage.remove(image.filePath);
        await this.repository.deleteImage(image.id);
    }

    /** Batch load of one day's points through the shared collection mapper. */
    private async listCollection(tripId: number, actor: TripActor | null, ownerId: string | null): Promise<TripPoint[]> {
        return this.mapRows(await this.repository.listRows(tripId), actor, ownerId);
    }

    /** One social batch for all given points and their images. */
    private async mapRows(rows: PointRecord[], actor: TripActor | null, ownerId: string | null): Promise<TripPoint[]> {
        const states = await this.socialStates.statesFor(actor?.id ?? null, toPointTargets(rows));

        return toPointDtoList(rows, states, getImageBaseUrl(), toResourcePermissions(actor, ownerId));
    }

    /** The day row the points live in: `tripId` is that row's `Trip.id`. */
    private async assertDayAccess(actor: TripActor, tripId: number): Promise<PointDayContext> {
        const day = await this.repository.findDayContext(tripId);
        if (!day) throw ApiError.notFound('Day not found.');

        this.assertCanModify(actor, day);
        return day;
    }

    private async assertPointAccess(actor: TripActor, pointId: number): Promise<PointContext> {
        const point = await this.repository.findContext(pointId);
        if (!point) throw ApiError.notFound('Point not found.');

        this.assertCanModify(actor, point);
        return point;
    }

    private assertCanModify(actor: TripActor, context: { groupOwnerId: string | null }): void {
        if (context.groupOwnerId === null) throw ApiError.tripNotFound();

        if (!canModifyTrip(actor, context.groupOwnerId)) {
            throw ApiError.forbidden('Only the trip owner can modify this trip.');
        }
    }
}
