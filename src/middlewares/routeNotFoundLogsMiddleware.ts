import { NextFunction, Request, RequestHandler, Response } from 'express';
import os from 'os';
import { routeNotFoundLogsService } from '../container';
import { optionalActor } from './authBoundary';
import { getErrorMessage } from '../utils/error';
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
export const routeNotFoundLogsMiddleware: RequestHandler = async (
    req: Request,
    _res: Response,
    next: NextFunction,
): Promise<void> => {
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
    } catch (error) {
        // The query string is left out of the log line: it can carry one-time tokens.
        console.log(`[404] route-not-found log failed for ${req.method} ${req.baseUrl}: ${getErrorMessage(error)}`);
    }

    next(ApiError.notFound());
};

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

    const connectionAddress = req.connection?.remoteAddress;
    if (connectionAddress && connectionAddress !== remoteAddress) {
        details.push(`req.connection.remoteAddress: ${connectionAddress}`);
    }

    if (req.ip) details.push(`req.ip: ${req.ip}`);

    details.push(`server-ip: ${serverIpv4()}`);

    return boundIpDiagnostic(details.join(', '));
}

function rawHeaderValues(rawHeaders: string[], headerName: string): string[] {
    const values: string[] = [];

    for (let index = 0; index + 1 < rawHeaders.length; index += 2) {
        if (rawHeaders[index].toLowerCase() !== headerName) continue;

        const value = normalizeHeaderValue(rawHeaders[index + 1]);
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

