import express from 'express';
import { dynamicConfig } from '../services/dynamicConfig';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { optionalAuthentication } from '../middlewares/authBoundary';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { validateRequest } from '../validation/validateRequest';

const configController = express.Router();

configController.get('/selects', validateRequest({}), optionalAuthentication, (_req, res) => {
    res.status(200).json(dynamicConfig.getSelectTypes());
});

configController.get('/services', validateRequest({}), optionalAuthentication, (_req, res) => {
    res.status(200).json(dynamicConfig.getPublicServiceConfigs());
});

configController.get('/social', validateRequest({}), optionalAuthentication, (_req, res) => {
    res.status(200).json({ social: dynamicConfig.getSocialConfig() });
});

configController.use(apiErrorMiddleware);
configController.use(routeNotFoundLogsMiddleware);

export default configController;

