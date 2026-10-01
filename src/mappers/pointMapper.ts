import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { SocialStates } from '../model/social';
import { PointCreateRequest, PointRecord, PointUpdateRequest, PointWriteInput, TripPoint } from '../model/trip';
import { toSocialImageDto } from './imageMapper';

export function toPointDto(row: PointRecord, states: SocialStates, imageBaseUrl: string | null): TripPoint {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        latitude: row.latitude,
        longitude: row.longitude,
        images: row.images.map((image) => toSocialImageDto(image, states, imageBaseUrl)),
        social: states.get(SOCIAL_TARGET_TYPE.POINT, row.id),
    };
}

export function toPointDtoList(rows: PointRecord[], states: SocialStates, imageBaseUrl: string | null): TripPoint[] {
    return rows.map((row) => toPointDto(row, states, imageBaseUrl));
}

export function toPointWriteInput(request: PointCreateRequest): PointWriteInput {
    return {
        title: request.title,
        description: request.description,
        latitude: request.latitude,
        longitude: request.longitude,
    };
}

export function toPointUpdateInput(request: PointUpdateRequest): Partial<PointWriteInput> {
    const patch: Partial<PointWriteInput> = {};

    if (request.title !== undefined) patch.title = request.title;
    if (request.description !== undefined) patch.description = request.description;
    if (request.latitude !== undefined) {
        patch.latitude = request.latitude;
    }
    if (request.longitude !== undefined) {
        patch.longitude = request.longitude;
    }
    return patch;
}

