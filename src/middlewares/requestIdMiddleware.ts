import { randomUUID } from 'crypto';
import { type RequestHandler } from 'express';
import { REQUEST_ID_HEADER } from '../constants/http';

export interface RequestWithId {
    id: string;
}

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
    const existingId = req.header(REQUEST_ID_HEADER);
    const requestId = existingId && existingId.trim().length > 0 ? existingId.trim() : randomUUID();

    (req as unknown as RequestWithId).id = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    next();
};