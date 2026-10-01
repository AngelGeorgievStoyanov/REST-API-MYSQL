import { NextFunction, Request, RequestHandler, Response } from 'express';
import {
    CLIENT_HEADER_REJECTION_STATUS,
    CORS_PREFLIGHT_METHOD,
    HACKTRIP_CLIENT_HEADER,
    HACKTRIP_CLIENT_VALUE,
} from '../constants/http';

/**
 * First filter of the request pipeline: a request that does not carry the
 * frontend marker is answered with an empty 404 and never reaches CORS, a body
 * parser or any slice.
 *
 * The marker is not a secret and not an authentication factor — it is visible in
 * the bundle and on the network. It only keeps unrelated traffic (bots, scanners,
 * probes) out of the application logic; real authorization happens later.
 *
 * A CORS preflight cannot carry a custom header, so those requests are left to
 * the CORS middleware instead of being rejected here.
 */
export const clientHeaderMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === CORS_PREFLIGHT_METHOD || req.header(HACKTRIP_CLIENT_HEADER) === HACKTRIP_CLIENT_VALUE) {
        next();
        return;
    }

    // Deliberately empty and uninformative: the answer must not reveal the filter.
    res.status(CLIENT_HEADER_REJECTION_STATUS).end();
};
