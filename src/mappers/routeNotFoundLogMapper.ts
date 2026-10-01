import { RouteNotFoundLogDto, RouteNotFoundLogSummary } from '../model/admin';

export function toRouteNotFoundLogDto(row: RouteNotFoundLogSummary): RouteNotFoundLogDto {
    return {
        ...row,
        reqUrl: null,
        reqHeaders: null,
        reqQuery: null,
        reqBody: null,
        reqParams: null,
    };
}

export function toRouteNotFoundLogDtoList(rows: RouteNotFoundLogSummary[]): RouteNotFoundLogDto[] {
    return rows.map(toRouteNotFoundLogDto);
}