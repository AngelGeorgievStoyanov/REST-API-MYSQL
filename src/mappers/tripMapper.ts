import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { SocialStates } from '../model/social';
import {
    CurrencyDto,
    DayCreateRequest,
    DayWriteInput,
    TripAuthor,
    TripDay,
    TripDetails,
    TripGroupDay,
    TripGroupInfo,
    TripGroupResponse,
    TripListItem,
    TripListResponse,
    TripSelectValue,
    TripDayRecord,
    TripGroupDetailsRecord,
    TripGroupListRecord,
    TripMetadataInput,
    TripWriteRequest,
} from '../model/trip';
import { toIsoString } from '../utils/utils';
import { TripPagination } from '../model/trip';
import { toImageUrl, toSocialImageDto } from './imageMapper';
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

function toTripAuthor(owner: { id: string; firstName: string; lastName: string }): TripAuthor {
    return { id: owner.id, firstName: owner.firstName, lastName: owner.lastName };
}

function latestDayUpdate(trips: { updatedAt: Date | null }[]): Date | null {
    return trips.reduce<Date | null>((latest, trip) => {
        if (!trip.updatedAt) return latest;
        return !latest || trip.updatedAt > latest ? trip.updatedAt : latest;
    }, null);
}

export function toTripMetadataInput(ownerId: string, request: TripWriteRequest): TripMetadataInput {
    return {
        ownerId,
        title: request.title,
        description: request.description,
        group: request.group,
        transport: request.transport,
    };
}

export function toDayWriteInput(request: DayCreateRequest): DayWriteInput {
    return { title: request.title, description: request.description };
}

export function toTripDayDto(row: TripDayRecord, states: SocialStates, imageBaseUrl: string | null): TripDay {
    return {
        id: row.id,
        day: row.dayNumber ?? 0,
        title: row.title,
        images: row.images.map((image) => toSocialImageDto(image, states, imageBaseUrl)),
        points: row.points.map((point) => toPointDto(point, states, imageBaseUrl)),
        social: states.get(SOCIAL_TARGET_TYPE.DAY, row.id),
    };
}

export function toTripDayDtoList(rows: TripDayRecord[], states: SocialStates, imageBaseUrl: string | null): TripDay[] {
    return rows.map((row) => toTripDayDto(row, states, imageBaseUrl));
}

export function toTripListItem(
    row: TripGroupListRecord,
    covers: Map<number, string>,
    imageBaseUrl: string | null,
    groupOptions: SelectDisplayOption[],
    transportOptions: SelectDisplayOption[],
): TripListItem {
    const canonicalDay = row.trips[0];
    const coverFilePath = canonicalDay ? covers.get(canonicalDay.id) : undefined;

    return {
        id: row.id,
        title: canonicalDay?.title ?? '',
        description: canonicalDay?.description ?? null,
        group: toTripSelectValue(canonicalDay?.typeOfPeople ?? null, groupOptions),
        transport: toTripSelectValue(canonicalDay?.transport ?? null, transportOptions),
        author: toTripAuthor(row.owner),
        coverImage: coverFilePath ? toImageUrl(coverFilePath, imageBaseUrl) : null,
        createdAt: toIsoString(row.createdAt ?? canonicalDay?.createdAt ?? null),
    };
}

export function toTripListResponse(
    items: TripListItem[],
    page: number,
    limit: number,
    total: number,
): TripListResponse {
    const pagination: TripPagination = {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };

    return { items, pagination };
}

export function toTripListItemList(
    rows: TripGroupListRecord[],
    covers: Map<number, string>,
    imageBaseUrl: string | null,
    groupOptions: SelectDisplayOption[],
    transportOptions: SelectDisplayOption[],
): TripListItem[] {
    return rows.map((row) => toTripListItem(row, covers, imageBaseUrl, groupOptions, transportOptions));
}

export function toTripDetailsDto(
    row: TripGroupDetailsRecord,
    states: SocialStates,
    imageBaseUrl: string | null,
    groupOptions: SelectDisplayOption[],
    transportOptions: SelectDisplayOption[],
): TripDetails {
    const canonicalDay = row.trips[0];
    const groupValue = toTripSelectValue(canonicalDay?.typeOfPeople ?? null, groupOptions);
    const group: TripGroupInfo = { id: row.id, key: groupValue.key, name: groupValue.name };

    const days: TripDay[] = row.trips.map((trip) => ({
        id: trip.id,
        day: trip.dayNumber ?? 0,
        title: trip.title,
        images: trip.images.map((image) => toSocialImageDto(image, states, imageBaseUrl)),
        points: trip.points.map((point) => toPointDto(point, states, imageBaseUrl)),
        social: states.get(SOCIAL_TARGET_TYPE.DAY, trip.id),
    }));

    return {
        id: row.id,
        title: canonicalDay?.title ?? '',
        description: canonicalDay?.description ?? null,
        group,
        transport: toTripSelectValue(canonicalDay?.transport ?? null, transportOptions),
        author: toTripAuthor(row.owner),
        coverImage: canonicalDay?.images[0] ? toImageUrl(canonicalDay.images[0].filePath, imageBaseUrl) : null,
        days,
        social: states.get(SOCIAL_TARGET_TYPE.TRIP_GROUP, row.id),
        createdAt: toIsoString(row.createdAt ?? canonicalDay?.createdAt ?? null),
        updatedAt: toIsoString(row.updatedAt ?? latestDayUpdate(row.trips)),
    };
}

export function toTripGroupDay(
    row: TripDayRecord,
    states: SocialStates,
    imageBaseUrl: string | null,
    groupOptions: SelectDisplayOption[],
    transportOptions: SelectDisplayOption[],
    currencyOptions: SelectDisplayOption[],
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
        images: row.images.map((image) => toSocialImageDto(image, states, imageBaseUrl)),
        social: states.get(SOCIAL_TARGET_TYPE.DAY, row.id),
        points: row.points.map((point) => toPointDto(point, states, imageBaseUrl)),
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
): TripGroupResponse {
    const days: TripGroupDay[] = row.trips.map((trip) =>
        toTripGroupDay(trip, states, imageBaseUrl, groupOptions, transportOptions, currencyOptions)
    );

    return {
        tripGroupId: row.id,
        social: states.get(SOCIAL_TARGET_TYPE.TRIP_GROUP, row.id),
        days,
    };
}