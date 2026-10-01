import express from 'express';
import { tripService } from '../container';
import { actorFrom, requireAuthentication } from '../middlewares/authBoundary';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { routeParam } from '../utils/routeParam';
import { validateRequest } from '../validation/validateRequest';
import { imageIdParams } from '../validation/schemas/common.schemas';

const imagesController = express.Router();

imagesController.delete(
    '/:imageId',
    validateRequest({ params: imageIdParams }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        await tripService.deleteImage(actorFrom(req), routeParam(req.params.imageId));
        res.status(204).send();
    }),
);

imagesController.use(apiErrorMiddleware);
imagesController.use(routeNotFoundLogsMiddleware);

export default imagesController;
