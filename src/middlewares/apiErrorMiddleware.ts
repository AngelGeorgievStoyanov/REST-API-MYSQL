import { NextFunction, Request, Response } from 'express';
import { ApiError, toApiErrorBody } from '../utils/apiError';
import { getErrorMessage } from '../utils/error';
import { logger } from '../utils/logger';
import { RequestWithId } from './requestIdMiddleware';

export function apiErrorMiddleware(
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const requestId = (req as unknown as RequestWithId).id;
    const method = req.method;
    const url = req.url;

    if (err instanceof ApiError) {
        if (err.status >= 500) {
            logger.error({ err, requestId, method, url, statusCode: err.status }, 'API error');
        }
        res.status(err.status).json(toApiErrorBody(err));
        return;
    }

    const bodyFailure = bodyParserFailure(err);
    if (bodyFailure !== null) {
        logger.warn({ err: bodyFailure, requestId, method, url, statusCode: bodyFailure.status }, 'Request rejected');
        res.status(bodyFailure.status).json(toApiErrorBody(bodyFailure));
        return;
    }

    logger.error({ err, requestId, method, url, statusCode: 500 }, `Unhandled error: ${getErrorMessage(err)}`);
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
