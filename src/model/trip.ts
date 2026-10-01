import { ImageRecord, SocialImageDto } from './image';
import { SocialState } from './social';

/**
 * Persistence notes for these DTOs (prisma/schema.prisma is the source of truth):
 *  - one Trip = one `trip_groups` row; one Day = one `trips` row of that group;
 *  - a Day's points = `points` rows of that `trips` row, images = `images`;
 *  - `trips.typeOfPeople` / `trips.transport` store the dynamic-config select key;
 *  - Prisma ids are INT autoincrement, so API ids are numbers.
 */

/** Authenticated caller. Always derived from the JWT, never from the request body. */
export interface TripActor {
    id: string;
    role: string;
}

/** Key/name pair resolved through the dynamic config selects (`group_type` / `transport`). */
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
