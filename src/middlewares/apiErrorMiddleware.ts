import { NextFunction, Request, Response } from 'express';
import { ApiError, toApiErrorBody } from '../utils/apiError';
import { getErrorMessage } from '../utils/error';

/**
 * Turns an {@link ApiError} into the API error contract and hides unexpected
 * errors behind a `500 INTERNAL_SERVER_ERROR` (details stay in the server log).
 *
 * It is registered on every router and once more at application level, so an
 * error raised before a router (a body parser, for example) cannot reach the
 * Express default handler and leak a stack trace.
 */
export function apiErrorMiddleware(
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    if (err instanceof ApiError) {
        res.status(err.status).json(toApiErrorBody(err));
        return;
    }

    const bodyFailure = bodyParserFailure(err);
    if (bodyFailure !== null) {
        console.log(`[api] ${req.method} ${req.originalUrl} rejected: ${bodyFailure.message}`);
        res.status(bodyFailure.status).json(toApiErrorBody(bodyFailure));
        return;
    }

    console.log(`[api] ${req.method} ${req.originalUrl} failed: ${getErrorMessage(err)}`);
    res.status(500).json(toApiErrorBody(ApiError.internal()));
}

/**
 * A malformed or oversized body is a client error, never a server fault; the
 * parser reports it with a `type` tag instead of an {@link ApiError}.
 */
function bodyParserFailure(error: unknown): ApiError | null {
    if (typeof error !== 'object' || error === null) return null;

    const type = Reflect.get(error, 'type');
    if (type === 'entity.too.large') return ApiError.validation('The request body is too large.');
    if (type === 'entity.parse.failed') return ApiError.validation('The request body is not valid JSON.');
    if (type === 'encoding.unsupported') return ApiError.validation('The request body encoding is not supported.');

    return null;
}
