import express from 'express';
import { reportService } from '../container';
import { actorFrom, requireAuthentication } from '../middlewares/authBoundary';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { validateRequest } from '../validation/validateRequest';
import { reportBodySchema } from '../validation/schemas/social.schemas';

/** Reporting is a write-only operation from the public API. */
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

reportController.use(apiErrorMiddleware);
reportController.use(routeNotFoundLogsMiddleware);

export default reportController;
