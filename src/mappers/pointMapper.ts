import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { SocialStates } from '../model/social';
import { PointCreateRequest, PointRecord, PointUpdateRequest, PointWriteInput, ResourcePermissions, TripPoint } from '../model/trip';
import { toSocialImageDto } from './imageMapper';
import { toIsoString } from '../utils/utils';

export function toPointDto(
    row: PointRecord,
    states: SocialStates,
    imageBaseUrl: string | null,
    permissions: ResourcePermissions,
): TripPoint {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        lat: row.lat,
        lng: row.lng,
        pointNumber: row.pointNumber,
        tripId: row.tripId,
        createdAt: toIsoString(row.createdAt),
        updatedAt: toIsoString(row.updatedAt),
        images: row.images.map((image) => toSocialImageDto(image, states, imageBaseUrl)),
        permissions,
        social: states.get(SOCIAL_TARGET_TYPE.POINT, row.id),
    };
}

export function toPointDtoList(
    rows: PointRecord[],
    states: SocialStates,
    imageBaseUrl: string | null,
    permissions: ResourcePermissions,
): TripPoint[] {
    return rows.map((row) => toPointDto(row, states, imageBaseUrl, permissions));
}

export function toPointWriteInput(request: PointCreateRequest): PointWriteInput {
    return {
        name: request.name,
        description: request.description,
        lat: request.lat,
        lng: request.lng,
    };
}

export function toPointUpdateInput(request: PointUpdateRequest): Partial<PointWriteInput> {
    const patch: Partial<PointWriteInput> = {};

    if (request.name !== undefined) patch.name = request.name;
    if (request.description !== undefined) patch.description = request.description;
    if (request.lat !== undefined) {
        patch.lat = request.lat;
    }
    if (request.lng !== undefined) {
        patch.lng = request.lng;
    }
    return patch;
}

