import express from 'express';
import { performance } from 'node:perf_hooks';
import { backgroundImageService, tripService } from '../container';
import { actorFrom, optionalActor, optionalAuthentication, requireAuthentication } from '../middlewares/authBoundary';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { imageUpload, uploadedFileName } from '../storage/imageUpload';
import { asyncHandler } from '../utils/asyncHandler';
import { routeParam } from '../utils/routeParam';
import { validateRequest } from '../validation/validateRequest';
import { tripGroupIdParams, tripDayParams } from '../validation/schemas/common.schemas';
import { dayReorderSchema, tripEditSchema, tripListQuerySchema, tripWriteSchema } from '../validation/schemas/trip.schemas';

function imageErrorLogDetails(error: unknown): Record<string, unknown> {
    if (typeof error !== 'object' || error === null) {
        return { errorName: 'UnknownError', errorMessage: String(error).slice(0, 300) };
    }

    const readString = (key: string): string | undefined => {
        const value = Reflect.get(error, key);
        return typeof value === 'string' || typeof value === 'number'
            ? String(value).slice(0, 300)
            : undefined;
    };

    return {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message.slice(0, 300) : readString('message'),
        errorCode: readString('code'),
        errorStatus: readString('status') ?? readString('statusCode'),
    };
}

const tripController = express.Router();

tripController.get('/', validateRequest({ query: tripListQuerySchema }), optionalAuthentication, asyncHandler(async (req, res) => {
    const response = await tripService.listTrips(req.query, optionalActor(req));
    res.status(200).json(response);
}));

/**
 * Public discovery reads: both are registered before `/:tripGroupId` so `top` and
 * `background` are route literals, never trip ids. Neither accepts a user id,
 * query parameters, route parameters or a body.
 */
tripController.get('/top', validateRequest({}), optionalAuthentication, asyncHandler(async (req, res) => {
    res.status(200).json(await tripService.getTopTrips(optionalActor(req)));
}));

tripController.get('/background', validateRequest({}), optionalAuthentication, asyncHandler((_req, res) => {
    res.status(200).json(backgroundImageService.getBackgroundPair());
    return Promise.resolve();
}));

tripController.get('/:tripGroupId', validateRequest({ params: tripGroupIdParams }), optionalAuthentication, asyncHandler(async (req, res) => {
    const trip = await tripService.getTrip(routeParam(req.params['tripGroupId']), optionalActor(req));
    res.status(200).json(trip);
}));

tripController.post('/', validateRequest({ body: tripWriteSchema }), requireAuthentication, asyncHandler(async (req, res) => {
    const trip = await tripService.createTrip(actorFrom(req), req.body);
    res.status(201).json(trip);
}));

tripController.delete('/:tripGroupId', validateRequest({ params: tripGroupIdParams }), requireAuthentication, asyncHandler(async (req, res) => {
    await tripService.deleteTrip(actorFrom(req), routeParam(req.params['tripGroupId']));
    res.status(204).send();
}));

tripController.post(
    '/:tripGroupId/days',
    validateRequest({ params: tripGroupIdParams, body: tripWriteSchema }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        const day = await tripService.createDay(actorFrom(req), routeParam(req.params['tripGroupId']), req.body);
        res.status(201).json(day);
    }),
);

tripController.put(
    '/:tripGroupId/days/reorder',
    validateRequest({ params: tripGroupIdParams, body: dayReorderSchema }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        const days = await tripService.reorderDays(actorFrom(req), routeParam(req.params['tripGroupId']), req.body);
        res.status(200).json(days);
    }),
);

tripController.put(
    '/:tripGroupId/days/:tripId',
    validateRequest({ params: tripDayParams, body: tripEditSchema }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        const day = await tripService.updateDay(
            actorFrom(req),
            routeParam(req.params['tripGroupId']),
            routeParam(req.params['tripId']),
            req.body,
        );
        res.status(200).json(day);
    }),
);

tripController.delete(
    '/:tripGroupId/days/:tripId',
    validateRequest({ params: tripDayParams }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        await tripService.deleteDay(actorFrom(req), routeParam(req.params['tripGroupId']), routeParam(req.params['tripId']));
        res.status(204).send();
    }),
);

/** Ownership is validated before multer stores the file. */
tripController.post(
    '/:tripGroupId/days/:tripId/images',
    validateRequest({ params: tripDayParams }),
    requireAuthentication,
    asyncHandler(async (req, _res, next) => {
        await tripService.assertDayImageUpload(
            actorFrom(req),
            routeParam(req.params['tripGroupId']),
            routeParam(req.params['tripId']),
        );
        next();
    }),
    (req, res, next) => {
        res.locals.imageUploadRequestStartedAt = performance.now();
        res.locals.imageUploadRequestStartedAtIso = new Date().toISOString();
        console.info(`[images] ${JSON.stringify({
            event: 'image.request.started',
            timestamp: res.locals.imageUploadRequestStartedAtIso,
            tripGroupId: req.params['tripGroupId'],
            tripId: req.params['tripId'],
        })}`);
        next();
    },
    imageUpload,
    asyncHandler(async (req, res) => {
        const requestStartedAt = res.locals.imageUploadRequestStartedAt as number | undefined;
        const requestStartedAtIso = res.locals.imageUploadRequestStartedAtIso as string | undefined;
        const startedAt = performance.now();
        try {
            const image = await tripService.addDayImage(
                actorFrom(req),
                routeParam(req.params['tripGroupId']),
                routeParam(req.params['tripId']),
                uploadedFileName(req),
            );
            console.info(`[images] ${JSON.stringify({
                event: 'image.database.attach.completed',
                durationMs: Math.round(performance.now() - startedAt),
                tripGroupId: req.params['tripGroupId'],
                tripId: req.params['tripId'],
            })}`);
            console.info(`[images] ${JSON.stringify({
                event: 'image.request.completed',
                timestamp: new Date().toISOString(),
                startedAt: requestStartedAtIso,
                durationMs: typeof requestStartedAt === 'number'
                    ? Math.round(performance.now() - requestStartedAt)
                    : undefined,
                tripGroupId: req.params['tripGroupId'],
                tripId: req.params['tripId'],
                outcome: 'success',
            })}`);
            res.status(201).json(image);
        } catch (error: unknown) {
            console.error(`[images] ${JSON.stringify({
                event: 'image.database.attach.failed',
                durationMs: Math.round(performance.now() - startedAt),
                tripGroupId: req.params['tripGroupId'],
                tripId: req.params['tripId'],
                ...imageErrorLogDetails(error),
            })}`);
            console.error(`[images] ${JSON.stringify({
                event: 'image.request.completed',
                timestamp: new Date().toISOString(),
                startedAt: requestStartedAtIso,
                durationMs: typeof requestStartedAt === 'number'
                    ? Math.round(performance.now() - requestStartedAt)
                    : undefined,
                tripGroupId: req.params['tripGroupId'],
                tripId: req.params['tripId'],
                outcome: 'failure',
            })}`);
            throw error;
        }
    }),
);

tripController.use(apiErrorMiddleware);
tripController.use(routeNotFoundLogsMiddleware);

export default tripController;
