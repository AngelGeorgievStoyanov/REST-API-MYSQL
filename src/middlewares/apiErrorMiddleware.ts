import { NextFunction, Request, Response } from 'express';
import { ApiError, toApiErrorBody } from '../utils/apiError';
import { getErrorMessage } from '../utils/error';

/**
 * Turns an {@link ApiError} into the API error contract and hides unexpected
 * errors behind a `500 INTERNAL_SERVER_ERROR` (details stay in the server log).
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

    console.log(`[api] ${req.method} ${req.originalUrl} failed: ${getErrorMessage(err)}`);
    res.status(500).json(toApiErrorBody(ApiError.internal()));
}
