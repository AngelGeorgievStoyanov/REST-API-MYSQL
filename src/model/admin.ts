/** One `failedlogs` row; the columns the admin surface exposes. */
export interface FailedLogEntry {
    id: number;
    date: string | null;
    email: string;
    ip: string;
    userAgent: string;
    countryCode: string | null;
    countryName: string | null;
    city: string | null;
    postal: string | null;
    latitude: number | null;
    longitude: number | null;
    state: string | null;
}

export type FailedLogDto = FailedLogEntry;

/** One `routenotfoundlogs` row; the columns the admin surface exposes. */
export interface RouteNotFoundLogDto {
    id: number;
    date: string | null;
    reqUrl: string | null;
    reqMethod: string | null;
    reqHeaders: string | null;
    reqQuery: string | null;
    reqBody: string | null;
    reqParams: string | null;
    reqIp: string | null;
    reqUserId: string | null;
    reqUserEmail: string | null;
}

export interface RouteNotFoundLogSummary {
    id: number;
    date: string | null;
    reqMethod: string | null;
    reqIp: string | null;
    reqUserId: string | null;
    reqUserEmail: string | null;
}

export interface DeleteCountResponse {
    deleted: number;
}

export interface AdminPage<T> {
    items: T[];
    pagination: {
        page: number;
        pageSize: number;
        total?: number;
        totalPages?: number;
        hasNext?: boolean;
    };
}
