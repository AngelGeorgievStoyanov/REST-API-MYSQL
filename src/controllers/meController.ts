import express from 'express';
import { favoriteService, tripService } from '../container';
import { actorFrom, requireAuthentication } from '../middlewares/authBoundary';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { validateRequest } from '../validation/validateRequest';

/**
 * Current-user collections. Both endpoints are authenticated-only and take no
 * parameters at all: the user is resolved exclusively from the authenticated
 * request context, so a client-supplied id can never select another user's data.
 */
const meController = express.Router();

meController.get('/trips', validateRequest({}), requireAuthentication, asyncHandler(async (req, res) => {
    res.status(200).json(await tripService.listOwnTrips(actorFrom(req)));
}));

meController.get('/favorites', validateRequest({}), requireAuthentication, asyncHandler(async (req, res) => {
    res.status(200).json(await favoriteService.listFavorites(actorFrom(req)));
}));

meController.use(apiErrorMiddleware);
meController.use(routeNotFoundLogsMiddleware);

export default meController;