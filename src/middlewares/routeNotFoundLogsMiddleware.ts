import { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import os from 'os';
import { routeNotFoundLogsService } from '../container';
import { optionalActor } from './authBoundary';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/apiError';
import { redactSensitiveRequestData } from '../utils/sensitiveRequestData';
import { MAX_CLIENT_IP_LENGTH } from '../constants/routeNotFoundLogs';

const IP_EVIDENCE_HEADERS = [
    'x-real-ip',
    'x-forwarded-for',
    'x-originating-ip',
    'x-client-ip',
    'true-client-ip',
    'x-azure-clientip',
    'x-azure-socketip',
    'forwarded',
] as const;

/**
 * Route-not-found logger of a single mounted router. It is registered at the end
 * of a router (never at application level), so it only records requests that
 * reached a valid router but matched no endpoint of it. It forwards the shared
 * API 404 after best-effort logging; a logging failure never changes the answer.
 */
export const routeNotFoundLogsMiddleware: RequestHandler = (
    req: Request,
    _res: Response,
    next: NextFunction,
): void => {
    void runRouteNotFoundLogging(req, next);
};

async function runRouteNotFoundLogging(
    req: Request,
    next: NextFunction,
): Promise<void> {
    try {
        await logRouteNotFound(req, next);
    } catch (error: unknown) {
        next(error);
    }
}

async function logRouteNotFound(
    req: Request,
    next: NextFunction,
): Promise<void> {
    try {
        await routeNotFoundLogsService.recordEvent({
            url: req.baseUrl,
            method: req.method,
            headers: redactSensitiveRequestData({
                'content-type': req.headers['content-type'],
                'x-hacktrip-client': req.headers['x-hacktrip-client'],
            }),
            query: undefined,
            body: undefined,
            params: undefined,
            clientIp: clientIpDetails(req),
            actorId: optionalActor(req)?.id,
        });
    } catch (error: unknown) {
        logger.error(
            {
                err: error,
                method: req.method,
                url: req.baseUrl,
            },
            'Route-not-found log failed',
        );
    }

    next(ApiError.notFound());
}

/** Diagnostic IP evidence only; raw proxy headers are never used for security decisions. */
function clientIpDetails(req: Request): string {
    const details: string[] = [];

    for (const headerName of IP_EVIDENCE_HEADERS) {
        const values = rawHeaderValues(req.rawHeaders, headerName);
        if (values.length > 0) details.push(`${headerName}: ${values.join(', ')}`);
    }

    if (req.ips.length > 0) details.push(`req.ips: [${req.ips.join(', ')}]`);

    const remoteAddress = req.socket.remoteAddress;
    if (remoteAddress) details.push(`remoteAddress: ${remoteAddress}`);

    if (req.ip) details.push(`req.ip: ${req.ip}`);

    details.push(`server-ip: ${serverIpv4()}`);

    return boundIpDiagnostic(details.join(', '));
}

function rawHeaderValues(rawHeaders: string[], headerName: string): string[] {
    const values: string[] = [];

    for (let index = 0; index + 1 < rawHeaders.length; index += 2) {
        const name = rawHeaders[index];
        const rawValue = rawHeaders[index + 1];
        if (name === undefined || rawValue === undefined) continue;
        if (name.toLowerCase() !== headerName) continue;

        const value = normalizeHeaderValue(rawValue);
        if (value !== '') values.push(value);
    }

    return values;
}

function normalizeHeaderValue(value: string): string {
    return Array.from(value, (character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) ? ' ' : character;
    }).join('').trim();
}

function boundIpDiagnostic(value: string): string {
    if (value.length <= MAX_CLIENT_IP_LENGTH) return value;

    const marker = ' [truncated]';
    let prefix = '';
    for (const character of value) {
        if (prefix.length + character.length > MAX_CLIENT_IP_LENGTH - marker.length) break;
        prefix += character;
    }

    return `${prefix.trimEnd()}${marker}`;
}

function serverIpv4(): string {
    for (const addresses of Object.values(os.networkInterfaces())) {
        for (const address of addresses ?? []) {
            if (address.family === 'IPv4' && !address.internal) return address.address;
        }
    }

    return '127.0.0.1';
}

