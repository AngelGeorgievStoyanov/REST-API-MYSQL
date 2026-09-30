import { NextFunction, Request, Response } from 'express';
import { authConfig } from '../config/auth';
import { authService } from '../container';
import type { AuthActor } from '../model/auth';
import { TripActor } from '../model/trip';
import { ApiError } from '../utils/apiError';
import { verifyAccessToken } from '../utils/auth';

type AuthenticatedRequest = Request & { user?: AuthActor };

export function actorFrom(req: Request): TripActor {
    const user = (req as AuthenticatedRequest).user;
    if (!user) throw ApiError.unauthorized();

    return { id: user.id, role: user.role };
}

/** Public reads answer without an actor, but report viewer state when a token is sent. */
export function optionalActor(req: Request): TripActor | null {
    const user = (req as AuthenticatedRequest).user;
    if (!user) return null;

    return { id: user.id, role: user.role };
}

/** Protected v1 operation: identity, account state and verification are enforced. */
export function requireAuthentication(req: Request, res: Response, next: NextFunction): void {
    void authenticate(req, next, true);
}

/** Public v1 read with optional viewer state: an unusable account stays anonymous. */
export function optionalAuthentication(req: Request, res: Response, next: NextFunction): void {
    void authenticate(req, next, false);
}

/**
 * Shared v1 boundary. The access JWT is an identity artifact only (`sub`); the
 * account row is loaded on every authenticated request, so suspension,
 * deactivation and pending verification reject the request even while an old
 * access token is still cryptographically valid.
 */
async function authenticate(req: Request, next: NextFunction, required: boolean): Promise<void> {
    const header = req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) {
        if (required) next(ApiError.unauthorized());
        else next();
        return;
    }

    try {
        const { userId } = verifyAccessToken(header.slice('Bearer '.length).trim(), authConfig.accessTokenSecret);
        const actor = await authService.resolveActor(userId);
        (req as AuthenticatedRequest).user = actor;
        next();
    } catch (error) {
        // A viewer token that only fails the account-state rules must not break a
        // public read: the request continues as anonymous.
        if (!required && error instanceof ApiError && error.status === 403) {
            next();
            return;
        }
        next(error);
    }
}
