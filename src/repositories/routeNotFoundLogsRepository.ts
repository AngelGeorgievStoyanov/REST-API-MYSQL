import { PrismaClient } from '@prisma/client';
import {
    MAX_ACTOR_ID_LENGTH,
    MAX_BODY_LENGTH,
    MAX_CLIENT_IP_LENGTH,
    MAX_HEADERS_LENGTH,
    MAX_METHOD_LENGTH,
    MAX_PARAMS_LENGTH,
    MAX_QUERY_LENGTH,
    MAX_URL_LENGTH,
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
    actorId?: string;
}

export class RouteNotFoundLogsRepository {
    constructor(private readonly prisma: PrismaClient) { }

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
                // `reqUserEmail` stays empty on purpose: the modern flow records the
                // actor id from the auth boundary and never the actor email.
                reqUserId: truncate(record.actorId ?? '', MAX_ACTOR_ID_LENGTH),
                reqUserEmail: '',
                createdAt: new Date(),
            },
        });
    }
}

function truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? value.substring(0, maxLength) : value;
}

function serialize(value: unknown, maxLength: number): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return truncate(value, maxLength);

    return truncate(JSON.stringify(value, null, 2), maxLength);
}
