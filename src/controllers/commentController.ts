import express from 'express';
import { SOCIAL_TARGET_TYPE } from '../constants/social';
import { commentService } from '../container';
import { actorFrom, optionalActor, optionalAuthentication, requireAuthentication } from '../middlewares/authBoundary';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { routeParam } from '../utils/routeParam';
import { validateRequest } from '../validation/validateRequest';
import { commentIdParams, imageIdParams, pointIdParams, tripDayParams, tripGroupIdParams } from '../validation/schemas/common.schemas';
import { commentBodySchema, commentPageQuerySchema } from '../validation/schemas/social.schemas';

/**
 * Comment routes of API v1. Reading is public (a trip is public), writing needs
 * the authenticated author. The collection endpoints mirror the resource tree â€”
 * trip group, day, point and image â€” and are mounted at the v1 root because they
 * span several prefixes.
 */
const commentController = express.Router();

commentController.get(
    '/trip-groups/:tripGroupId/comments',
    validateRequest({ params: tripGroupIdParams, query: commentPageQuerySchema }),
    optionalAuthentication,
    asyncHandler(async (req, res) => {
        const comments = await commentService.listForTarget(
            SOCIAL_TARGET_TYPE.TRIP_GROUP,
            routeParam(req.params['tripGroupId']),
            req.query,
            optionalActor(req),
        );
        res.status(200).json(comments);
    }),
);

commentController.post(
    '/trip-groups/:tripGroupId/comments',
    validateRequest({ params: tripGroupIdParams, body: commentBodySchema }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        const comment = await commentService.create(
            actorFrom(req),
            SOCIAL_TARGET_TYPE.TRIP_GROUP,
            routeParam(req.params['tripGroupId']),
            req.body,
        );
        res.status(201).json(comment);
    }),
);

commentController.get(
    '/trips/:tripGroupId/days/:tripId/comments',
    validateRequest({ params: tripDayParams, query: commentPageQuerySchema }),
    optionalAuthentication,
    asyncHandler(async (req, res) => {
        const comments = await commentService.listForDay(
            routeParam(req.params['tripGroupId']),
            routeParam(req.params['tripId']),
            req.query,
            optionalActor(req),
        );
        res.status(200).json(comments);
    }),
);

commentController.post(
    '/trips/:tripGroupId/days/:tripId/comments',
    validateRequest({ params: tripDayParams, body: commentBodySchema }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        const comment = await commentService.createForDay(
            actorFrom(req),
            routeParam(req.params['tripGroupId']),
            routeParam(req.params['tripId']),
            req.body,
        );
        res.status(201).json(comment);
    }),
);

commentController.get(
    '/points/:pointId/comments',
    validateRequest({ params: pointIdParams, query: commentPageQuerySchema }),
    optionalAuthentication,
    asyncHandler(async (req, res) => {
        const comments = await commentService.listForTarget(
            SOCIAL_TARGET_TYPE.POINT,
            routeParam(req.params['pointId']),
            req.query,
            optionalActor(req),
        );
        res.status(200).json(comments);
    }),
);

commentController.post(
    '/points/:pointId/comments',
    validateRequest({ params: pointIdParams, body: commentBodySchema }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        const comment = await commentService.create(
            actorFrom(req),
            SOCIAL_TARGET_TYPE.POINT,
            routeParam(req.params['pointId']),
            req.body,
        );
        res.status(201).json(comment);
    }),
);

commentController.get(
    '/images/:imageId/comments',
    validateRequest({ params: imageIdParams, query: commentPageQuerySchema }),
    optionalAuthentication,
    asyncHandler(async (req, res) => {
        const comments = await commentService.listForTarget(
            SOCIAL_TARGET_TYPE.IMAGE,
            routeParam(req.params['imageId']),
            req.query,
            optionalActor(req),
        );
        res.status(200).json(comments);
    }),
);

commentController.post(
    '/images/:imageId/comments',
    validateRequest({ params: imageIdParams, body: commentBodySchema }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        const comment = await commentService.create(
            actorFrom(req),
            SOCIAL_TARGET_TYPE.IMAGE,
            routeParam(req.params['imageId']),
            req.body,
        );
        res.status(201).json(comment);
    }),
);

commentController.put(
    '/comments/:commentId',
    validateRequest({ params: commentIdParams, body: commentBodySchema }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        const comment = await commentService.update(actorFrom(req), routeParam(req.params['commentId']), req.body);
        res.status(200).json(comment);
    }),
);

commentController.delete(
    '/comments/:commentId',
    validateRequest({ params: commentIdParams }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        await commentService.delete(actorFrom(req), routeParam(req.params['commentId']));
        res.status(204).send();
    }),
);

commentController.use(apiErrorMiddleware);

export default commentController;
