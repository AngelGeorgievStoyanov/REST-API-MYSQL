import express from 'express';
import { reportService } from '../container';
import { actorFrom, requireAuthentication } from '../middlewares/authBoundary';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { validateRequest } from '../validation/validateRequest';
import { reportBodySchema, reportTargetQuerySchema } from '../validation/schemas/social.schemas';

/**
 * Reports are write-only from the public API: users create them and may remove
 * their own. The removal is addressed by the reported target, like the likes
 * and the favorites, so it needs no report id and stays scoped to the caller.
 */
const reportController = express.Router();

reportController.post(
    '/',
    validateRequest({ body: reportBodySchema }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        const report = await reportService.create(actorFrom(req), req.body);
        res.status(201).json(report);
    }),
);

reportController.delete(
    '/',
    validateRequest({ query: reportTargetQuerySchema }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        await reportService.removeOwned(actorFrom(req), reportTargetQuerySchema.parse(req.query));
        res.status(204).send();
    }),
);

reportController.use(apiErrorMiddleware);
reportController.use(routeNotFoundLogsMiddleware);

export default reportController;
