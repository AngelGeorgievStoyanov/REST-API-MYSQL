import express from 'express';
import { reportService } from '../container';
import { actorFrom, requireAuthentication } from '../middlewares/authBoundary';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { asyncHandler } from '../utils/asyncHandler';

/** Reporting is a write-only operation from the public API. */
const reportController = express.Router();

reportController.post('/', requireAuthentication, asyncHandler(async (req, res) => {
    const report = await reportService.create(actorFrom(req), req.body);
    res.status(201).json(report);
}));

reportController.use(apiErrorMiddleware);

export default reportController;
