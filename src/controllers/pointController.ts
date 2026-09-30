import express from 'express';
import { pointService } from '../container';
import { actorFrom, optionalActor, optionalAuthentication, requireAuthentication } from '../middlewares/authBoundary';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { imageUpload, uploadedFileName } from '../storage/imageUpload';
import { asyncHandler } from '../utils/asyncHandler';
import { routeParam } from '../utils/routeParam';

const pointController = express.Router();

pointController.post('/', requireAuthentication, asyncHandler(async (req, res) => {
    const point = await pointService.createPoint(actorFrom(req), req.body);
    res.status(201).json(point);
}));

pointController.get('/:pointId', optionalAuthentication, asyncHandler(async (req, res) => {
    const point = await pointService.getPoint(routeParam(req.params.pointId), optionalActor(req));
    res.status(200).json(point);
}));

pointController.put('/:pointId', requireAuthentication, asyncHandler(async (req, res) => {
    const point = await pointService.updatePoint(actorFrom(req), routeParam(req.params.pointId), req.body);
    res.status(200).json(point);
}));

pointController.delete('/:pointId', requireAuthentication, asyncHandler(async (req, res) => {
    await pointService.deletePoint(actorFrom(req), routeParam(req.params.pointId));
    res.status(204).send();
}));

pointController.delete('/:pointId/images/:imageId', requireAuthentication, asyncHandler(async (req, res) => {
    await pointService.deletePointImage(
        actorFrom(req),
        routeParam(req.params.pointId),
        routeParam(req.params.imageId),
    );
    res.status(204).send();
}));

/** Ownership is validated before multer stores the file. */
pointController.post(
    '/:pointId/images',
    requireAuthentication,
    asyncHandler(async (req, _res, next) => {
        await pointService.assertPointImageUpload(actorFrom(req), routeParam(req.params.pointId));
        next();
    }),
    imageUpload,
    asyncHandler(async (req, res) => {
        const image = await pointService.addPointImage(
            actorFrom(req),
            routeParam(req.params.pointId),
            uploadedFileName(req),
        );
        res.status(201).json(image);
    }),
);

pointController.use(apiErrorMiddleware);
pointController.use(routeNotFoundLogsMiddleware);

/** The reorder of a day's points is addressed through the day. */
const dayPointController = express.Router();

dayPointController.put('/:dayId/points/reorder', requireAuthentication, asyncHandler(async (req, res) => {
    const points = await pointService.reorderPoints(actorFrom(req), routeParam(req.params.dayId), req.body);
    res.status(200).json(points);
}));

dayPointController.use(apiErrorMiddleware);
dayPointController.use(routeNotFoundLogsMiddleware);

export { dayPointController };
export default pointController;
