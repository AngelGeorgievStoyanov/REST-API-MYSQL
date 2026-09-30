import { RouteNotFoundLogRecord, RouteNotFoundLogsRepository } from './routeNotFoundLogsRepository';

/** Request context collected by the route-not-found middleware. */
export interface RouteNotFoundLogEvent {
    url: string;
    method: string;
    headers: unknown;
    query: unknown;
    body: unknown;
    params: unknown;
    clientIp: string;
    actorId?: string;
}

export class RouteNotFoundLogsService {
    constructor(private readonly routeNotFoundLogsRepository: RouteNotFoundLogsRepository) { }

    /**
     * Records one request that reached a mounted router but matched no endpoint.
     * Callers treat a failure as best effort: the observability record must never
     * change the HTTP answer.
     */
    async recordEvent(event: RouteNotFoundLogEvent): Promise<void> {
        const record: RouteNotFoundLogRecord = {
            url: event.url,
            method: event.method,
            headers: event.headers,
            query: event.query,
            body: event.body,
            params: event.params,
            clientIp: event.clientIp,
            actorId: event.actorId,
        };

        await this.routeNotFoundLogsRepository.create(record);
    }
}
