import { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import {
    CLIENT_HEADER_REJECTION_STATUS,
    CORS_PREFLIGHT_METHOD,
    HACKTRIP_CLIENT_HEADER,
    HACKTRIP_CLIENT_VALUE,
} from '../constants/http';
import { ApiError, toApiErrorBody } from '../utils/apiError';

/**
 * First filter of the request pipeline: a request that does not carry the
 * frontend client marker is rejected before body parsing or a slice.
 *
 * The marker is public and copyable. It only identifies the expected frontend
 * request shape; authentication and authorization happen later. The public
 * frontend bearer token is classified by the authentication boundary, not here.
 *
 * A CORS preflight cannot carry a custom header, so those requests are left to
 * the CORS middleware instead of being rejected here.
 */
export const clientHeaderMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === CORS_PREFLIGHT_METHOD || req.header(HACKTRIP_CLIENT_HEADER) === HACKTRIP_CLIENT_VALUE) {
        next();
        return;
    }

    const isVersionedApi = req.path === '/api/v1' || req.path.startsWith('/api/v1/');
    if (isVersionedApi) {
        res.status(404).json(toApiErrorBody(ApiError.notFound()));
        return;
    }

    res.status(CLIENT_HEADER_REJECTION_STATUS).end();
};
