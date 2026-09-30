import { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthRateLimitConfig } from '../config/auth';
import { ApiError } from '../utils/apiError';

interface Bucket {
    windowStartedAt: number;
    hits: number;
}

const buckets = new Map<string, Bucket>();
const PRUNE_THRESHOLD = 1000;

/**
 * Fixed-window limiter for the auth endpoints only. The key is the client
 * address plus the route bucket: no token, password or email is ever read,
 * stored or logged, and no other API slice is affected.
 */
export function authRateLimit(bucket: string, max: number, config: AuthRateLimitConfig): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction): void => {
        const now = Date.now();
        const windowMs = config.windowSeconds * 1000;
        pruneExpired(now, windowMs);

        const key = `${bucket}:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`;
        const current = buckets.get(key);

        if (current === undefined || now - current.windowStartedAt >= windowMs) {
            buckets.set(key, { windowStartedAt: now, hits: 1 });
            next();
            return;
        }

        if (current.hits >= max) {
            console.log(`[auth] rate limit reached for ${bucket}`);
            next(ApiError.rateLimited());
            return;
        }

        current.hits += 1;
        next();
    };
}

function pruneExpired(now: number, windowMs: number): void {
    if (buckets.size < PRUNE_THRESHOLD) return;

    for (const [key, bucket] of buckets) {
        if (now - bucket.windowStartedAt >= windowMs) buckets.delete(key);
    }
}
