import express, { NextFunction, Request, Response } from 'express';
import { tripService } from '../container';
import { authenticateToken } from '../guard/jwt.middleware';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { TripActor } from '../model/trip';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { routeParam } from '../utils/routeParam';

/**
 * The JWT payload still uses the legacy `_id`; it is mapped to the domain `id`
 * here so legacy naming does not reach the service.
 */
interface LegacyJwtUser {
    _id?: string;
    role?: string;
}

const tripController = express.Router();

function actorFrom(req: Request): TripActor {
    const user = (req as Request & { user?: LegacyJwtUser }).user;
    if (!user?._id) throw ApiError.unauthorized();

    return { id: user._id, role: user.role ?? 'user' };
}

/**
 * A missing header is answered with the API error contract; a present token is
 * still verified by the shared legacy middleware, which verifies and rejects on
 * its own.
 */
function requireAuthentication(req: Request, res: Response, next: NextFunction): void {
    const header = req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) {
        next(ApiError.unauthorized());
        return;
    }

    authenticateToken(req, res, next);
}

tripController.get('/', asyncHandler(async (req, res) => {
    const response = await tripService.listTrips(req.query);
    res.status(200).json(response);
}));

tripController.get('/:id', asyncHandler(async (req, res) => {
    const trip = await tripService.getTrip(routeParam(req.params.id));
    res.status(200).json(trip);
}));

tripController.post('/', requireAuthentication, asyncHandler(async (req, res) => {
    const trip = await tripService.createTrip(actorFrom(req), req.body);
    res.status(201).json(trip);
}));

tripController.put('/:id', requireAuthentication, asyncHandler(async (req, res) => {
    const trip = await tripService.updateTrip(actorFrom(req), routeParam(req.params.id), req.body);
    res.status(200).json(trip);
}));

tripController.delete('/:id', requireAuthentication, asyncHandler(async (req, res) => {
    await tripService.deleteTrip(actorFrom(req), routeParam(req.params.id));
    res.status(204).send();
}));

tripController.use(apiErrorMiddleware);
tripController.use(routeNotFoundLogsMiddleware);

export default tripController;
