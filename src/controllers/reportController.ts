import express from 'express';
import { reportService } from '../container';
import { actorFrom, requireAuthentication } from '../middlewares/authBoundary';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { routeParam } from '../utils/routeParam';
import { validateRequest } from '../validation/validateRequest';
import { reportIdParams } from '../validation/schemas/common.schemas';
import { reportBodySchema } from '../validation/schemas/social.schemas';

/** Reports are write-only from the public API: users create them and may remove their own. */
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
    '/:reportId',
    validateRequest({ params: reportIdParams }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        await reportService.removeOwned(actorFrom(req), routeParam(req.params.reportId));
        res.status(204).send();
    }),
);

reportController.use(apiErrorMiddleware);
reportController.use(routeNotFoundLogsMiddleware);

export default reportController;
