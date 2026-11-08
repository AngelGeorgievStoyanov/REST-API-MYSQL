import { type RouteNotFoundLogDto, type RouteNotFoundLogSummary } from '../model/admin';

function toRouteNotFoundLogDto(row: RouteNotFoundLogSummary): RouteNotFoundLogDto {
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
