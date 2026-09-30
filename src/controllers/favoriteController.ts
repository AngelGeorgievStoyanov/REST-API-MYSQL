import express from 'express';
import { favoriteService } from '../container';
import { actorFrom, requireAuthentication } from '../middlewares/authBoundary';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { asyncHandler } from '../utils/asyncHandler';

/** Favorites exist on trip groups only. */
const favoriteController = express.Router();

favoriteController.post('/', requireAuthentication, asyncHandler(async (req, res) => {
    const state = await favoriteService.add(actorFrom(req), req.body);
    res.status(200).json(state);
}));

favoriteController.delete('/', requireAuthentication, asyncHandler(async (req, res) => {
    await favoriteService.remove(actorFrom(req), req.query);
    res.status(204).send();
}));

favoriteController.use(apiErrorMiddleware);
favoriteController.use(routeNotFoundLogsMiddleware);

export default favoriteController;
