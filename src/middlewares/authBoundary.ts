import { NextFunction, Request, RequestHandler, Response } from 'express';
import { authConfig } from '../config/auth';
import { loadEnvironmentConfig } from '../config/environment';
import { authService } from '../container';
import type { AuthActor } from '../model/auth';
import { TripActor } from '../model/trip';
import { ApiError } from '../utils/apiError';
import { verifyAccessToken } from '../utils/auth';

type AuthenticatedRequest = Request & { user?: AuthActor };

/**
 * Public, non-secret token that identifies an anonymous public Frontend context.
 * It is never a user credential and is never passed to JWT verification; only
 * the raw bearer string is compared against it.
 */
const publicFrontendToken = loadEnvironmentConfig().publicFrontendToken;

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

/** Public v1 read with optional viewer state: the bearer value is classified into an anonymous viewer or a user actor. */
export function optionalAuthentication(req: Request, res: Response, next: NextFunction): void {
    void authenticate(req, next, false);
}

/**
 * Protected v1 operation restricted to the account roles given. The role comes
 * from the database row, never from a token claim.
 */
export function requireRole(roles: string[]): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction): void => {
        void authenticate(req, next, true, roles);
    };
}

/**
 * Shared v1 boundary. The bearer value is classified before any verification: a
 * request with no bearer value is answered with the production 404, the public
 * frontend token marks an anonymous public context, and every other value is
 * verified as a user access JWT. An invalid JWT or a valid JWT whose account is
 * no longer usable follows the existing auth error contract and is never
 * downgraded to anonymous. The access JWT is an identity artifact only (`sub`);
 * the account row is loaded on every authenticated request, so suspension,
 * deactivation and pending verification reject the request even while an old
 * access token is still cryptographically valid.
 */
async function authenticate(req: Request, next: NextFunction, required: boolean, roles?: string[]): Promise<void> {
    const token = bearerValue(req.header('Authorization'));

    // A request without a bearer value is not a valid Frontend API request: it
    // is answered with the production 404, never with anonymous authentication.
    if (token === null) {
        next(ApiError.notFound());
        return;
    }

    // The public frontend token is never a JWT. It marks an anonymous public
    // Frontend context that grants no user, session or ownership identity and
    // no write capability, so a protected operation remains unauthorized.
    if (token === publicFrontendToken) {
        if (required) next(ApiError.unauthorized());
        else next();
        return;
    }

    try {
        const { userId } = verifyAccessToken(token, authConfig.accessTokenSecret);
        const actor = await authService.resolveActor(userId);
        (req as AuthenticatedRequest).user = actor;

        if (roles && !roles.includes(actor.role)) {
            next(ApiError.forbidden('This operation requires a different account role.'));
            return;
        }
        next();
    } catch (error) {
        // An invalid JWT and an unusable account status both keep the existing
        // auth error contract: the request is never downgraded to anonymous.
        next(error);
    }
}

/** Raw bearer value of the header, or `null` when the request carries no bearer token. */
function bearerValue(header: string | undefined): string | null {
    if (!header || !header.startsWith('Bearer ')) return null;

    return header.slice('Bearer '.length).trim();
}
