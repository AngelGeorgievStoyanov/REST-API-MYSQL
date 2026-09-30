import { Request, RequestHandler, Response } from 'express';
import os from 'os';
import { routeNotFoundLogsService } from '../container';
import { optionalActor } from './authBoundary';
import { getErrorMessage } from '../utils/error';

/**
 * Route-not-found logger of a single mounted router. It is registered at the end
 * of a router (never at application level), so it only records requests that
 * reached a valid router but matched no endpoint of it. The response is always an
 * empty 404: a logging failure must not change the answer or leak its cause.
 */
export const routeNotFoundLogsMiddleware: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        await routeNotFoundLogsService.recordEvent({
            url: req.originalUrl,
            method: req.method,
            headers: req.headers,
            query: req.query,
            body: req.body,
            params: req.params,
            clientIp: clientIpDetails(req),
            actorId: optionalActor(req)?.id,
        });
    } catch (error) {
        // The query string is left out of the log line: it can carry one-time tokens.
        console.log(`[404] route-not-found log failed for ${req.method} ${req.originalUrl.split('?')[0]}: ${getErrorMessage(error)}`);
    }

    res.status(404).end();
};

/** Diagnostic client address: proxy headers, socket address, Express ip and the server address. */
function clientIpDetails(req: Request): string {
    const details: string[] = [];

    const realIp = req.header('x-real-ip');
    if (realIp) details.push(`x-real-ip: ${realIp}`);

    const forwardedFor = req.header('x-forwarded-for');
    if (forwardedFor) details.push(`x-forwarded-for: ${forwardedFor}`);

    const remoteAddress = req.socket.remoteAddress;
    if (remoteAddress) details.push(`remoteAddress: ${remoteAddress}`);

    if (req.ip) details.push(`req.ip: ${req.ip}`);

    details.push(`server-ip: ${serverIpv4()}`);

    return details.join(', ');
}

function serverIpv4(): string {
    for (const addresses of Object.values(os.networkInterfaces())) {
        for (const address of addresses ?? []) {
            if (address.family === 'IPv4' && !address.internal) return address.address;
        }
    }

    return '127.0.0.1';
}

