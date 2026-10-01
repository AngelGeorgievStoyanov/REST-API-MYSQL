import express from 'express';
import { likeService } from '../container';
import { actorFrom, requireAuthentication } from '../middlewares/authBoundary';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { validateRequest } from '../validation/validateRequest';
import { socialTargetBodySchema, socialTargetQuerySchema } from '../validation/schemas/social.schemas';

/**
 * Likes are polymorphic: the target is sent in the body (`POST`) or in the query
 * string (`DELETE`). Both operations are idempotent.
 */
const likeController = express.Router();

likeController.post(
    '/',
    validateRequest({ body: socialTargetBodySchema }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        const state = await likeService.add(actorFrom(req), req.body);
        res.status(200).json(state);
    }),
);

likeController.delete(
    '/',
    validateRequest({ query: socialTargetQuerySchema }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        await likeService.remove(actorFrom(req), req.query);
        res.status(204).send();
    }),
);

likeController.use(apiErrorMiddleware);
likeController.use(routeNotFoundLogsMiddleware);

export default likeController;
