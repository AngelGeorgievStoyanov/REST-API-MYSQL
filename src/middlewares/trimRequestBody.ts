import { type NextFunction, type Request, type RequestHandler, type Response } from 'express';

const OPAQUE_FIELD = /token|captcha/i;

/** Recursively trims text values while preserving opaque token/CAPTCHA values and non-plain objects. */
export function trimRequestValue(value: unknown, fieldName?: string): unknown {
    if (typeof value === 'string') {
        return fieldName !== undefined && OPAQUE_FIELD.test(fieldName) ? value : value.trim();
    }
    if (Array.isArray(value)) return value.map((item) => trimRequestValue(item, fieldName));
    if (value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
        return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, trimRequestValue(nested, key)]));
    }
    return value;
}

/** Applies request-body normalization after the relevant body parser. */
export const trimRequestBody: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
    req.body = trimRequestValue(req.body);
    next();
};
