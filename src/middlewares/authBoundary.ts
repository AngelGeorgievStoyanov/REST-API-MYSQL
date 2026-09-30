import { NextFunction, Request, Response } from 'express';
import { authenticateToken } from '../guard/jwt.middleware';
import { TripActor } from '../model/trip';
import { ApiError } from '../utils/apiError';

/**
 * The JWT payload still uses the legacy `_id`; it is mapped to the domain `id`
 * here, in the single place where a request turns into an actor.
 */
interface LegacyJwtUser {
    _id?: string;
    role?: string;
}

export function actorFrom(req: Request): TripActor {
    const user = (req as Request & { user?: LegacyJwtUser }).user;
    if (!user?._id) throw ApiError.unauthorized();

    return { id: user._id, role: user.role ?? 'user' };
}

/** Public reads answer without an actor, but report viewer state when a token is sent. */
export function optionalActor(req: Request): TripActor | null {
    const user = (req as Request & { user?: LegacyJwtUser }).user;
    if (!user?._id) return null;

    return { id: user._id, role: user.role ?? 'user' };
}

/**
 * A missing header is answered with the API error contract; a present token is
 * still verified by the shared legacy middleware.
 */
export function requireAuthentication(req: Request, res: Response, next: NextFunction): void {
    const header = req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) {
        next(ApiError.unauthorized());
        return;
    }

    authenticateToken(req, res, next);
}

/** Optional variant of {@link requireAuthentication}: no token means anonymous. */
export function optionalAuthentication(req: Request, res: Response, next: NextFunction): void {
    const header = req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) {
        next();
        return;
    }

    authenticateToken(req, res, next);
}
