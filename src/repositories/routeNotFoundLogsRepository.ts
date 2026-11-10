import { type PrismaClient } from '@prisma/client';
import { type RouteNotFoundLogSummary } from '../model/admin';
import {
  MAX_ACTOR_ID_LENGTH,
  MAX_BODY_LENGTH,
  MAX_CLIENT_IP_LENGTH,
  MAX_HEADERS_LENGTH,
  MAX_METHOD_LENGTH,
  MAX_PARAMS_LENGTH,
  MAX_REQUEST_EMAIL_LENGTH,
  MAX_QUERY_LENGTH,
  MAX_URL_LENGTH,
  REQUEST_LOG_TRUNCATION_MARKER,
} from '../constants/routeNotFoundLogs';

/** One route-not-found event as accepted by the repository. */
export interface RouteNotFoundLogRecord {
  url: string;
  method: string;
  headers: unknown;
  query: unknown;
  body: unknown;
  params: unknown;
  clientIp: string;
  actorId?: string | undefined;
  requestEmail?: string | null;
}

const listSelect = {
  id: true,
  reqUrl: true,
  reqMethod: true,
  reqHeaders: true,
  reqQuery: true,
  reqBody: true,
  reqParams: true,
  date: true,
  reqIp: true,
  reqUserId: true,
  reqUserEmail: true,
};

export class RouteNotFoundLogsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Appends one route-not-found row. */
  async create(record: RouteNotFoundLogRecord): Promise<void> {
    await this.prisma.routeNotFoundLog.create({
      data: {
        date: new Date().toISOString(),
        reqUrl: truncate(record.url, MAX_URL_LENGTH),
        reqMethod: truncate(record.method, MAX_METHOD_LENGTH),
        reqHeaders: serialize(record.headers, MAX_HEADERS_LENGTH),
        reqQuery: serialize(record.query, MAX_QUERY_LENGTH),
        reqBody: serialize(record.body, MAX_BODY_LENGTH),
        reqParams: serialize(record.params, MAX_PARAMS_LENGTH),
        reqIp: truncate(record.clientIp, MAX_CLIENT_IP_LENGTH),
        reqUserId: truncate(record.actorId ?? '', MAX_ACTOR_ID_LENGTH),
        reqUserEmail: truncate(record.requestEmail ?? '', MAX_REQUEST_EMAIL_LENGTH),
        createdAt: new Date(),
      },
    });
  }

  /** Newest first; `id` breaks ties because `date` is a stored string. */
  async listPage(skip: number, take: number): Promise<RouteNotFoundLogSummary[]> {
    const rows = await this.prisma.routeNotFoundLog.findMany({
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      skip,
      take,
      select: listSelect,
    });

    return rows;
  }

  async countAll(): Promise<number> {
    return this.prisma.routeNotFoundLog.count();
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;

  const suffix = REQUEST_LOG_TRUNCATION_MARKER;
  return `${value.substring(0, maxLength - suffix.length)}${suffix}`;
}

function serialize(value: unknown, maxLength: number): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return truncate(value, maxLength);

  return truncate(JSON.stringify(value, null, 2), maxLength);
}
