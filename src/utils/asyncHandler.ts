import { type NextFunction, type Request, type RequestHandler, type Response } from 'express';

/**
 * Wraps an async route handler so a rejected promise reaches the Express error
 * middleware instead of becoming an unhandled rejection.
 */
export function asyncHandler(
    handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
    return (req, res, next) => {
        // eslint-disable-next-line promise/prefer-await-to-then, promise/no-callback-in-promise -- Express error-forwarding pattern
        handler(req, res, next).catch(next);
    };
}
