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

/** Key/name pair resolved through the dynamic config selects (`group_type` / `transport` / `currency`). */
export interface TripSelectValue {
    key: string;
    name: string;
}

export interface TripGroupInfo extends TripSelectValue {
    id: number;
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
    title: string;
    description: string | null;
    latitude: number | null;
    longitude: number | null;
    images: ImageRecord[];
}

export interface TripListDayRecord {
    id: number;
    title: string;
    description: string | null;
    transport: string | null;
    typeOfPeople: string | null;
    dayNumber: number | null;
    createdAt: Date | null;
}

export interface TripDayRecord extends TripListDayRecord {
    updatedAt: Date | null;
    price: number | null;
    currency: string | null;
    destination: string | null;
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
    title: string;
    description: string | null;
    latitude: number | null;
    longitude: number | null;
}

export interface TripMetadataInput {
    ownerId: string;
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
    title: string;
    description: string | null;
    latitude: number | null;
    longitude: number | null;
    images: SocialImageDto[];
    social: SocialState;
}

export interface TripDay {
    id: number;
    day: number;
    title: string | null;
    images: SocialImageDto[];
    points: TripPoint[];
    social: SocialState;
}

export interface TripListItem {
    id: number;
    title: string;
    description: string | null;
    group: TripSelectValue;
    transport: TripSelectValue;
    author: TripAuthor;
    coverImage: string | null;
    createdAt: string | null;
}

export interface TripDetails {
    id: number;
    title: string;
    description: string | null;
    group: TripGroupInfo;
    transport: TripSelectValue;
    author: TripAuthor;
    coverImage: string | null;
    days: TripDay[];
    social: SocialState;
    createdAt: string | null;
    updatedAt: string | null;
}

/** TripGroupDay represents a single day within a trip group for the new unified response. */
export interface TripGroupDay {
    id: number;
    dayNumber: number;
    title: string | null;
    description: string | null;
    price: number | null;
    currency: CurrencyDto | null;
    transport: TripSelectValue;
    group: TripSelectValue;
    images: SocialImageDto[];
    social: SocialState;
    points: TripPoint[];
    createdAt: string | null;
    updatedAt: string | null;
}

/** TripGroupResponse is the unified response for GET /trips, GET /trips/top, GET /trips/:id */
export interface TripGroupResponse {
    tripGroupId: number;
    social: SocialState;
    days: TripGroupDay[];
}

export interface TripPagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface TripListResponse {
    items: TripListItem[];
    pagination: TripPagination;
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
    title: string;
    description: string | null;
    group: string;
    transport: string;
}

export interface PointCreateRequest {
    /**
     * The API's name for the day the point is created in. Its value is the
     * `Trip.id` of that day row — a day row has no separate identifier.
     */
    dayId: number;
    title: string;
    description: string | null;
    latitude: number;
    longitude: number;
}

export interface PointUpdateRequest {
    title?: string;
    description?: string | null;
    latitude?: number | null;
    longitude?: number | null;
}

export interface DayCreateRequest {
    dayNumber: number | null;
    title: string | null;
    description: string | null;
}

export interface DayUpdateRequest {
    title?: string;
    description?: string | null;
}
