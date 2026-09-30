import express from 'express';
import { tripService } from '../container';
import { actorFrom, requireAuthentication } from '../middlewares/authBoundary';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { routeParam } from '../utils/routeParam';

const imagesController = express.Router();

imagesController.delete('/:imageId', requireAuthentication, asyncHandler(async (req, res) => {
    await tripService.deleteImage(actorFrom(req), routeParam(req.params.imageId));
    res.status(204).send();
}));

imagesController.use(apiErrorMiddleware);

export default imagesController;
