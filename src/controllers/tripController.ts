import express, { Request, Response } from 'express';
import { tripService } from '../container';
import { actorFrom, optionalActor, optionalAuthentication, requireAuthentication } from '../middlewares/authBoundary';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { imageUpload, uploadedFileName } from '../storage/imageUpload';
import { asyncHandler } from '../utils/asyncHandler';
import { routeParam } from '../utils/routeParam';

const tripController = express.Router();

tripController.get('/', asyncHandler(async (req, res) => {
    const response = await tripService.listTrips(req.query);
    res.status(200).json(response);
}));

tripController.get('/:id', optionalAuthentication, asyncHandler(async (req, res) => {
    const trip = await tripService.getTrip(routeParam(req.params.id), optionalActor(req));
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

tripController.post('/:tripId/days', requireAuthentication, asyncHandler(async (req, res) => {
    const day = await tripService.createDay(actorFrom(req), routeParam(req.params.tripId), req.body);
    res.status(201).json(day);
}));

tripController.put('/:tripId/days/reorder', requireAuthentication, asyncHandler(async (req, res) => {
    const days = await tripService.reorderDays(actorFrom(req), routeParam(req.params.tripId), req.body);
    res.status(200).json(days);
}));

tripController.put('/:tripId/days/:dayId', requireAuthentication, asyncHandler(async (req, res) => {
    const day = await tripService.updateDay(
        actorFrom(req),
        routeParam(req.params.tripId),
        routeParam(req.params.dayId),
        req.body,
    );
    res.status(200).json(day);
}));

tripController.delete('/:tripId/days/:dayId', requireAuthentication, asyncHandler(async (req, res) => {
    await tripService.deleteDay(actorFrom(req), routeParam(req.params.tripId), routeParam(req.params.dayId));
    res.status(204).send();
}));

/** Ownership is validated before multer stores the file. */
tripController.post(
    '/:tripId/days/:dayId/images',
    requireAuthentication,
    asyncHandler(async (req, _res, next) => {
        await tripService.assertDayImageUpload(
            actorFrom(req),
            routeParam(req.params.tripId),
            routeParam(req.params.dayId),
        );
        next();
    }),
    imageUpload,
    asyncHandler(async (req, res) => {
        const image = await tripService.addDayImage(
            actorFrom(req),
            routeParam(req.params.tripId),
            routeParam(req.params.dayId),
            uploadedFileName(req),
        );
        res.status(201).json(image);
    }),
);

tripController.use(apiErrorMiddleware);
tripController.use(routeNotFoundLogsMiddleware);

export default tripController;
