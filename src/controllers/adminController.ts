import express from 'express';
import { ADMIN_OR_MODERATOR_ROLES, ADMIN_ROLES } from '../constants/admin';
import {
    adminUserService,
    failedLogService,
    imageInventoryService,
    routeNotFoundLogsService,
} from '../container';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { requireRole } from '../middlewares/authBoundary';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { routeParam } from '../utils/routeParam';

/**
 * Administrative surface. Every operation is guarded by the account role of the
 * database row; the role restrictions mirror the legacy handlers they replace.
 */
const adminController = express.Router();

const adminOrModerator = requireRole([...ADMIN_OR_MODERATOR_ROLES]);
const adminOnly = requireRole([...ADMIN_ROLES]);

adminController.get('/users', adminOrModerator, asyncHandler(async (_req, res) => {
    res.status(200).json(await adminUserService.listUsers());
}));

adminController.put('/users/:userId', adminOnly, asyncHandler(async (req, res) => {
    res.status(200).json(await adminUserService.updateUser(routeParam(req.params.userId), req.body));
}));

adminController.delete('/users/:userId', adminOrModerator, asyncHandler(async (req, res) => {
    await adminUserService.deleteUser(routeParam(req.params.userId));
    res.status(204).send();
}));

adminController.get('/failed-login-logs', adminOrModerator, asyncHandler(async (_req, res) => {
    res.status(200).json(await failedLogService.listAll());
}));

adminController.delete('/failed-login-logs', adminOrModerator, asyncHandler(async (req, res) => {
    res.status(200).json({ deleted: await failedLogService.deleteByIds(req.body) });
}));

adminController.get('/route-not-found-logs', adminOrModerator, asyncHandler(async (_req, res) => {
    res.status(200).json(await routeNotFoundLogsService.listEvents());
}));

adminController.get('/images/cloud', adminOrModerator, asyncHandler(async (_req, res) => {
    res.status(200).json(await imageInventoryService.cloudImages());
}));

adminController.get('/images/database', adminOrModerator, asyncHandler(async (_req, res) => {
    res.status(200).json(await imageInventoryService.databaseImages());
}));

/** Objects that exist in GCS but have no `images` row are orphaned uploads. */
adminController.get('/images/orphans', adminOrModerator, asyncHandler(async (_req, res) => {
    res.status(200).json(await imageInventoryService.compare());
}));

adminController.use(apiErrorMiddleware);
adminController.use(routeNotFoundLogsMiddleware);

export default adminController;
