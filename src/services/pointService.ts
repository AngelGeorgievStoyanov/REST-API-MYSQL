import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { ImageDto } from '../model/image';
import { SocialStates, SocialTargetRef } from '../model/social';
import { PointCreateRequest, PointUpdateRequest, TripActor, TripPoint } from '../model/trip';
import { ImageFileStorage } from '../storage/imageFileStorage';
import { ApiError } from '../utils/apiError';
import { canModifyTrip } from '../utils/authorization';
import { toImageDto, toSocialImageDto } from '../utils/image';
import { parsePointCreateBody, parsePointUpdateBody } from '../utils/point';
import { parseIdList, parsePositiveId } from '../utils/validation';
import { toNumberOrNull } from '../utils/utils';
import { PointContext, PointDayContext, PointRepository, PointRow, PointWriteFields } from '../repositories/pointRepository';
import { SocialStateService } from './socialStateService';

export function toPointDto(row: PointRow, states: SocialStates): TripPoint {
    return {
        id: row.id,
        title: row.name,
        description: row.description,
        latitude: toNumberOrNull(row.lat),
        longitude: toNumberOrNull(row.lng),
        images: row.images.map((image) => toSocialImageDto(image, states)),
        social: states.get(SOCIAL_TARGET_TYPE.POINT, row.id),
    };
}

/** Targets of a batch of point rows: the points themselves and their images. */
function toPointTargets(rows: PointRow[]): SocialTargetRef[] {
    const targets: SocialTargetRef[] = [];

    for (const row of rows) {
        targets.push({ targetType: SOCIAL_TARGET_TYPE.POINT, targetId: row.id });
        for (const image of row.images) {
            targets.push({ targetType: SOCIAL_TARGET_TYPE.IMAGE, targetId: image.id });
        }
    }
    return targets;
}

function toPointFields(request: PointCreateRequest): PointWriteFields {
    return {
        name: request.title,
        description: request.description,
        latitude: String(request.latitude),
        longitude: String(request.longitude),
    };
}

function toPointPatch(request: PointUpdateRequest): Partial<PointWriteFields> {
    const patch: Partial<PointWriteFields> = {};

    if (request.title !== undefined) patch.name = request.title;
    if (request.description !== undefined) patch.description = request.description;
    if (request.latitude !== undefined) {
        patch.latitude = request.latitude === null ? null : String(request.latitude);
    }
    if (request.longitude !== undefined) {
        patch.longitude = request.longitude === null ? null : String(request.longitude);
    }
    return patch;
}

export class PointService {
    constructor(
        private readonly repository: PointRepository,
        private readonly imageStorage: ImageFileStorage,
        private readonly socialStates: SocialStateService,
    ) { }

    async getPoint(rawPointId: string, actor: TripActor | null): Promise<TripPoint> {
        const row = await this.repository.findRow(parsePositiveId(rawPointId, 'Point id'));
        if (!row) throw ApiError.notFound('Point not found.');

        return (await this.mapRows([row], actor))[0];
    }

    async createPoint(actor: TripActor, body: unknown): Promise<TripPoint> {
        const request = parsePointCreateBody(body);
        // The request field is the API's `dayId`; its value is the day row's `Trip.id`.
        const day = await this.assertDayAccess(actor, request.dayId);

        const pointNumber = (await this.repository.findMaxNumber(day.tripId)) + 1;
        const pointId = await this.repository.create(day.tripId, actor.id, toPointFields(request), pointNumber);

        return this.getPoint(String(pointId), actor);
    }

    async updatePoint(actor: TripActor, rawPointId: string, body: unknown): Promise<TripPoint> {
        const pointId = parsePositiveId(rawPointId, 'Point id');
        await this.assertPointAccess(actor, pointId);

        const request = parsePointUpdateBody(body);
        await this.repository.update(pointId, toPointPatch(request));

        return this.getPoint(String(pointId), actor);
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
        await this.assertDayAccess(actor, tripId);

        const pointIds = parseIdList(body, 'pointIds', 0);
        const existing = await this.repository.listIds(tripId);
        if (existing.length !== pointIds.length || pointIds.some((pointId) => !existing.includes(pointId))) {
            throw ApiError.validation('"pointIds" must contain exactly all points of this day.');
        }

        await this.repository.reorder(tripId, pointIds);

        return this.mapRows(await this.repository.listRows(tripId), actor);
    }

    async assertPointImageUpload(actor: TripActor, rawPointId: string): Promise<void> {
        await this.assertPointAccess(actor, parsePositiveId(rawPointId, 'Point id'));
    }

    async addPointImage(actor: TripActor, rawPointId: string, filePath: string): Promise<ImageDto> {
        const pointId = parsePositiveId(rawPointId, 'Point id');
        await this.assertPointAccess(actor, pointId);

        const imageId = await this.repository.createImage(pointId, actor.id, filePath);
        return toImageDto({ id: imageId, filePath });
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

    /** One social batch for all given points and their images. */
    private async mapRows(rows: PointRow[], actor: TripActor | null): Promise<TripPoint[]> {
        const states = await this.socialStates.statesFor(actor?.id ?? null, toPointTargets(rows));

        return rows.map((row) => toPointDto(row, states));
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
