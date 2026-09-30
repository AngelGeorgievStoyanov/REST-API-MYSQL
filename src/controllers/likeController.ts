import express from 'express';
import { likeService } from '../container';
import { actorFrom, requireAuthentication } from '../middlewares/authBoundary';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * Likes are polymorphic: the target is sent in the body (`POST`) or in the query
 * string (`DELETE`). Both operations are idempotent.
 */
const likeController = express.Router();

likeController.post('/', requireAuthentication, asyncHandler(async (req, res) => {
    const state = await likeService.add(actorFrom(req), req.body);
    res.status(200).json(state);
}));

likeController.delete('/', requireAuthentication, asyncHandler(async (req, res) => {
    await likeService.remove(actorFrom(req), req.query);
    res.status(204).send();
}));

likeController.use(apiErrorMiddleware);

export default likeController;
