import express from 'express';
import { dynamicConfig } from '../services/dynamicConfig';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { getErrorMessage } from '../utils/error';

const configController = express.Router();

configController.get('/selects', (req, res) => {
    try {
        res.status(200).json(dynamicConfig.getSelectTypes());
    } catch (err: unknown) {
        const reason = getErrorMessage(err);
        console.log(`[config] GET /api/v1/config/selects failed: ${reason}`);
        res.status(503).json('Configuration unavailable');
    }
});

configController.get('/services', (req, res) => {
    try {
        res.status(200).json(dynamicConfig.getServiceConfigs());
    } catch (err: unknown) {
        const reason = getErrorMessage(err);
        console.log(`[config] GET /api/v1/config/services failed: ${reason}`);
        res.status(503).json('Configuration unavailable');
    }
});

configController.use(routeNotFoundLogsMiddleware);

export default configController;

