import { type RouteNotFoundLogDto, type RouteNotFoundLogSummary } from '../model/admin';

function toRouteNotFoundLogDto(row: RouteNotFoundLogSummary): RouteNotFoundLogDto {
  return {
    ...row,
    reqUrl: row.reqUrl,
    reqHeaders: row.reqHeaders,
    reqQuery: null,
    reqBody: null,
    reqParams: null,
  };
}

export function toRouteNotFoundLogDtoList(rows: RouteNotFoundLogSummary[]): RouteNotFoundLogDto[] {
  return rows.map(toRouteNotFoundLogDto);
}
