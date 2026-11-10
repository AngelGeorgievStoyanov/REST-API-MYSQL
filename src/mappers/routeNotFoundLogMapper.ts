import { type RouteNotFoundLogDto, type RouteNotFoundLogSummary } from '../model/admin';

function toRouteNotFoundLogDto(row: RouteNotFoundLogSummary): RouteNotFoundLogDto {
  return {
    ...row,
    reqUrl: row.reqUrl,
    reqHeaders: row.reqHeaders,
    reqQuery: row.reqQuery,
    reqBody: row.reqBody,
    reqParams: row.reqParams,
  };
}

export function toRouteNotFoundLogDtoList(rows: RouteNotFoundLogSummary[]): RouteNotFoundLogDto[] {
  return rows.map(toRouteNotFoundLogDto);
}
