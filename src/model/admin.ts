/** One `failedlogs` row; the columns the admin surface exposes. */
export interface FailedLogDto {
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
