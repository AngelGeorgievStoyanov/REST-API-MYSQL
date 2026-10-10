import express from 'express';
import { authConfig } from '../config/auth';
import { ADMIN_OR_MODERATOR_ROLES, ADMIN_RATE_LIMIT_MAX } from '../constants/admin';
import {
    adminUserService,
    failedLogService,
    imageInventoryService,
    reportService,
    routeNotFoundLogsService,
} from '../container';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { actorFrom, requireRole } from '../middlewares/authBoundary';
import { authRateLimit } from '../middlewares/authRateLimit';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { routeParam } from '../utils/routeParam';
import { validateRequest } from '../validation/validateRequest';
import { adminReportIdParams, userIdParams } from '../validation/schemas/common.schemas';
import { adminPaginationQuerySchema, adminUserUpdateSchema, failedLogDeleteSchema } from '../validation/schemas/admin.schemas';

/**
 * Administrative surface. Every operation is guarded by the account role of the
 * database row; the role restrictions mirror the legacy handlers they replace.
 */
const adminController = express.Router();

/** Abuse protection of an expensive, privileged surface. */
const adminLimiter = authRateLimit('admin', ADMIN_RATE_LIMIT_MAX, authConfig.rateLimit);
const adminOrModerator = requireRole([...ADMIN_OR_MODERATOR_ROLES]);

adminController.get('/users', adminLimiter, validateRequest({ query: adminPaginationQuerySchema }), adminOrModerator, asyncHandler(async (req, res) => {
    res.status(200).json(await adminUserService.listUsers(req.query));
}));

adminController.put(
    '/users/:userId',
    adminLimiter,
    validateRequest({ params: userIdParams, body: adminUserUpdateSchema }),
    adminOrModerator,
    asyncHandler(async (req, res) => {
        res.status(200).json(await adminUserService.updateUser(actorFrom(req), routeParam(req.params['userId']), req.body));
    }),
);

adminController.delete(
    '/users/:userId',
    adminLimiter,
    validateRequest({ params: userIdParams }),
    adminOrModerator,
    asyncHandler(async (req, res) => {
        await adminUserService.deleteUser(routeParam(req.params['userId']));
        res.status(204).send();
    }),
);

adminController.get('/failed-login-logs', adminLimiter, validateRequest({ query: adminPaginationQuerySchema }), adminOrModerator, asyncHandler(async (req, res) => {
    res.status(200).json(await failedLogService.listAll(req.query));
}));

adminController.delete(
    '/failed-login-logs',
    adminLimiter,
    validateRequest({ body: failedLogDeleteSchema }),
    adminOrModerator,
    asyncHandler(async (req, res) => {
        res.status(200).json(await failedLogService.deleteByIds(req.body));
    }),
);

adminController.get('/route-not-found-logs', adminLimiter, validateRequest({ query: adminPaginationQuerySchema }), adminOrModerator, asyncHandler(async (req, res) => {
    res.status(200).json(await routeNotFoundLogsService.listEvents(req.query));
}));

adminController.get('/images/cloud', adminLimiter, validateRequest({ query: adminPaginationQuerySchema }), adminOrModerator, asyncHandler(async (req, res) => {
    res.status(200).json(await imageInventoryService.cloudImages(req.query));
}));

adminController.get('/images/database', adminLimiter, validateRequest({ query: adminPaginationQuerySchema }), adminOrModerator, asyncHandler(async (req, res) => {
    res.status(200).json(await imageInventoryService.databaseImages(req.query));
}));

/** Objects that exist in GCS but have no `images` row are orphaned uploads. */
adminController.get('/images/orphans', adminLimiter, validateRequest({ query: adminPaginationQuerySchema }), adminOrModerator, asyncHandler(async (req, res) => {
    res.status(200).json(await imageInventoryService.compare(req.query));
}));

/** The moderation queue: reports persisted by `POST /reports`, newest first. */
adminController.get('/reports', adminLimiter, validateRequest({ query: adminPaginationQuerySchema }), adminOrModerator, asyncHandler(async (req, res) => {
    res.status(200).json(await reportService.list(req.query));
}));

/** Report removal only: the reported trip/comment/point/image stays untouched. */
adminController.delete(
    '/reports/:reportId',
    adminLimiter,
    validateRequest({ params: adminReportIdParams }),
    adminOrModerator,
    asyncHandler(async (req, res) => {
        await reportService.remove(routeParam(req.params['reportId']));
        res.status(204).send();
    }),
);

adminController.use(apiErrorMiddleware);
adminController.use(routeNotFoundLogsMiddleware);

export default adminController;
