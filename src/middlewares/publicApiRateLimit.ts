import { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { ApiError } from '../utils/apiError';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;
const MAX_BUCKETS_BEFORE_PRUNE = 10_000;

interface Bucket {
    startedAt: number;
    requests: number;
}

const buckets = new Map<string, Bucket>();

/** Process-local noise limit; multi-worker deployments still need edge-level limits. */
export const publicApiRateLimit: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
    const now = Date.now();
    if (buckets.size >= MAX_BUCKETS_BEFORE_PRUNE) pruneExpiredBuckets(now);

    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const current = buckets.get(key);
    if (!current || now - current.startedAt >= WINDOW_MS) {
        buckets.set(key, { startedAt: now, requests: 1 });
        next();
        return;
    }

    if (current.requests >= MAX_REQUESTS_PER_WINDOW) {
        next(ApiError.rateLimited());
        return;
    }

    current.requests += 1;
    next();
};

function pruneExpiredBuckets(now: number): void {
    for (const [key, bucket] of buckets) {
        if (now - bucket.startedAt >= WINDOW_MS) buckets.delete(key);
    }
}