import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { SocialStates } from '../model/social';
import {
    CurrencyDto,
    DayCreateRequest,
    DayWriteInput,
    ResourcePermissions,
    TripDay,
    TripGroupDay,
    TripGroupResponse,
    TripSelectValue,
    TripDayRecord,
    TripGroupDetailsRecord,
    TripMetadataInput,
    TripWriteRequest,
} from '../model/trip';
import { toIsoString } from '../utils/utils';
import { toSocialImageDto } from './imageMapper';
import { toPointDto } from './pointMapper';
type SelectDisplayOption = { id: number; key: string; value: string };

function toTripSelectValue(storedValue: string | null, options: SelectDisplayOption[]): TripSelectValue {
    if (!storedValue) return { key: '', name: '' };

    const requested = storedValue.toLowerCase();
    const option = options.find((candidate) =>
        candidate.key.toLowerCase() === requested || candidate.value.toLowerCase() === requested);

    return option ? { key: option.key, name: option.value } : { key: storedValue, name: storedValue };
}

function toCurrencyDto(currencyKey: string | null, currencyOptions: SelectDisplayOption[]): CurrencyDto | null {
    if (!currencyKey) return null;

    const requested = currencyKey.toLowerCase();
    const option = currencyOptions.find((candidate) =>
        candidate.key.toLowerCase() === requested || candidate.value.toLowerCase() === requested);

    if (!option) return { id: 0, code: currencyKey, name: currencyKey };

    return { id: option.id, code: option.key, name: option.value };
}

export function toTripMetadataInput(ownerId: string, request: TripWriteRequest): TripMetadataInput {
    return {
        ownerId,
        dayNumber: request.dayNumber,
        title: request.title,
        description: request.description,
        group: request.group,
        transport: request.transport,
    };
}

export function toDayWriteInput(request: DayCreateRequest): DayWriteInput {
    return { title: request.title, description: request.description };
}

export function toTripDayDto(
    row: TripDayRecord,
    states: SocialStates,
    imageBaseUrl: string | null,
    permissions: ResourcePermissions,
): TripDay {
    return {
        id: row.id,
        dayNumber: row.dayNumber ?? 0,
        title: row.title,
        images: row.images.map((image) => toSocialImageDto(image, states, imageBaseUrl)),
        points: row.points.map((point) => toPointDto(point, states, imageBaseUrl, permissions)),
        permissions,
        social: states.get(SOCIAL_TARGET_TYPE.DAY, row.id),
    };
}

export function toTripDayDtoList(
    rows: TripDayRecord[],
    states: SocialStates,
    imageBaseUrl: string | null,
    permissions: ResourcePermissions,
): TripDay[] {
    return rows.map((row) => toTripDayDto(row, states, imageBaseUrl, permissions));
}

export function toTripGroupDay(
    row: TripDayRecord,
    states: SocialStates,
    imageBaseUrl: string | null,
    groupOptions: SelectDisplayOption[],
    transportOptions: SelectDisplayOption[],
    currencyOptions: SelectDisplayOption[],
    permissions: ResourcePermissions,
): TripGroupDay {
    return {
        id: row.id,
        dayNumber: row.dayNumber ?? 0,
        title: row.title,
        description: row.description,
        price: row.price ?? null,
        currency: toCurrencyDto(row.currency, currencyOptions),
        transport: toTripSelectValue(row.transport, transportOptions),
        group: toTripSelectValue(row.typeOfPeople, groupOptions),
        countPeoples: row.countPeoples,
        destination: row.destination ?? null,
        lat: row.lat ?? null,
        lng: row.lng ?? null,
        images: row.images.map((image) => toSocialImageDto(image, states, imageBaseUrl)),
        permissions,
        social: states.get(SOCIAL_TARGET_TYPE.DAY, row.id),
        points: row.points.map((point) => toPointDto(point, states, imageBaseUrl, permissions)),
        createdAt: toIsoString(row.createdAt),
        updatedAt: toIsoString(row.updatedAt),
    };
}

export function toTripGroupResponse(
    row: TripGroupDetailsRecord,
    states: SocialStates,
    imageBaseUrl: string | null,
    groupOptions: SelectDisplayOption[],
    transportOptions: SelectDisplayOption[],
    currencyOptions: SelectDisplayOption[],
    permissions: ResourcePermissions,
): TripGroupResponse {
    const days: TripGroupDay[] = row.trips.map((trip) =>
        toTripGroupDay(trip, states, imageBaseUrl, groupOptions, transportOptions, currencyOptions, permissions)
    );

    return {
        id: row.id,
        permissions,
        social: states.get(SOCIAL_TARGET_TYPE.TRIP_GROUP, row.id),
        days,
    };
}