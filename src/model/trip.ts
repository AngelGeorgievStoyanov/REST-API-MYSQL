import { ImageRecord, SocialImageDto } from './image';
import { SocialState } from './social';

/**
 * Persistence notes for these DTOs (prisma/schema.prisma is the source of truth):
 *  - one Trip = one `trip_groups` row; one Day = one `trips` row of that group;
 *  - a Day's points = `points` rows of that `trips` row, images = `images`;
 *  - `trips.typeOfPeople` / `trips.transport` store the dynamic-config select key;
 *  - `trips.currency` stores the select key (e.g. "EUR"); currency display name comes from select_options;
 *  - Prisma ids are INT autoincrement, so API ids are numbers.
 */

/** Authenticated caller. Always derived from the JWT, never from the request body. */
export interface TripActor {
    id: string;
    role: string;
}

/** Server-side computed edit/delete rights of one resource for the requesting actor. */
export interface ResourcePermissions {
    canEdit: boolean;
    canDelete: boolean;
}

/** Key/name pair resolved through the dynamic config selects (`group_type` / `transport` / `currency`). */
export interface TripSelectValue {
    key: string;
    name: string;
}

export interface TripAuthor {
    id: string;
    firstName: string;
    lastName: string;
}

/** Currency resolved from select_options (currency select type). */
export interface CurrencyDto {
    id: number;
    code: string;
    name: string;
}

/** Application read shape returned by point/trip repositories. */
export interface PointRecord {
    id: number;
    name: string;
    description: string | null;
    lat: number | null;
    lng: number | null;
    pointNumber: number;
    /** Required: the day row (`trips.id`) this point belongs to. */
    tripId: number;
    createdAt: Date | null;
    updatedAt: Date | null;
    images: ImageRecord[];
}

export interface TripListDayRecord {
    id: number;
    title: string;
    description: string | null;
    transport: string | null;
    typeOfPeople: string | null;
    /** Required: the user-selected ordinal stored on the day row. */
    dayNumber: number;
    createdAt: Date | null;
}

export interface TripDayRecord extends TripListDayRecord {
    updatedAt: Date | null;
    price: number | null;
    currency: string | null;
    destination: string | null;
    countPeoples: number;
    lat: number | null;
    lng: number | null;
    images: ImageRecord[];
    points: PointRecord[];
}

export interface TripGroupListRecord {
    id: number;
    createdAt: Date | null;
    owner: TripAuthor;
    trips: TripListDayRecord[];
}

export interface TripGroupDetailsRecord {
    id: number;
    createdAt: Date | null;
    updatedAt: Date | null;
    owner: TripAuthor;
    trips: TripDayRecord[];
}

export interface PointWriteInput {
    name: string;
    description: string | null;
    lat: number | null;
    lng: number | null;
}

export interface TripMetadataInput {
    ownerId: string;
    /** User-selected ordinal of the initial day row; persisted as `trips.dayNumber`. */
    dayNumber: number;
    title: string;
    description: string | null;
    group: string;
    transport: string;
}

export interface DayWriteInput {
    title: string | null;
    description: string | null;
}

export interface DayUpdateInput {
    title?: string;
    description?: string | null;
}

export interface TripPoint {
    id: number;
    name: string;
    description: string | null;
    lat: number | null;
    lng: number | null;
    pointNumber: number;
    /** Required: the parent day row (`points.tripId` = `trips.id`). */
    tripId: number;
    createdAt: string | null;
    updatedAt: string | null;
    images: SocialImageDto[];
    permissions: ResourcePermissions;
    social: SocialState;
}

export interface TripDay {
    id: number;
    dayNumber: number;
    title: string | null;
    images: SocialImageDto[];
    points: TripPoint[];
    permissions: ResourcePermissions;
    social: SocialState;
}

/** TripGroupDay represents a single day within a trip group for the unified response. */
export interface TripGroupDay {
    id: number;
    dayNumber: number;
    title: string | null;
    description: string | null;
    price: number | null;
    currency: CurrencyDto | null;
    transport: TripSelectValue;
    group: TripSelectValue;
    countPeoples: number;
    destination: string | null;
    lat: number | null;
    lng: number | null;
    images: SocialImageDto[];
    permissions: ResourcePermissions;
    social: SocialState;
    points: TripPoint[];
    createdAt: string | null;
    updatedAt: string | null;
}

/** TripGroupResponse is the unified response for GET /trips, GET /trips/top, GET /trips/:tripGroupId */
export interface TripGroupResponse {
    id: number;
    permissions: ResourcePermissions;
    social: SocialState;
    days: TripGroupDay[];
}

export type TripSort = 'newest' | 'oldest';

export interface TripListQuery {
    page: number;
    limit: number;
    search: string | null;
    group: string | null;
    transport: string | null;
    sort: TripSort;
}

export interface TripWriteRequest {
    /** Required user-selected ordinal of the initial day row (`trips.dayNumber`). */
    dayNumber: number;
    title: string;
    description: string | null;
    group: string;
    transport: string;
}

export interface PointCreateRequest {
    /**
     * The day the point is created in: the primary key `Trip.id` of that day
     * row — a day row has no separate identifier. Never the trip-group id and
     * never `trips.dayNumber`.
     */
    tripId: number;
    name: string;
    description: string | null;
    lat: number;
    lng: number;
}

export interface PointUpdateRequest {
    name?: string;
    description?: string | null;
    lat?: number | null;
    lng?: number | null;
}

export interface DayCreateRequest {
    /** Required user-selected ordinal of the new day row; persisted unchanged. */
    dayNumber: number;
    title: string | null;
    description: string | null;
}

export interface DayUpdateRequest {
    title?: string;
    description?: string | null;
}
