import express from 'express';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { ConfigService } from '../services/configService';

const configController = express.Router();

configController.get('/selects', async (req, res) => {
    const configService: ConfigService = req.app.get('configService');
    try {
        const selectTypes = await configService.getSelectTypes();
        res.status(200).json(selectTypes);
    } catch (err) {
        console.log(`[config] GET /config/selects failed: ${err?.message}`);
        res.status(503).json('Configuration unavailable');
    }
});

configController.get('/services', async (req, res) => {
    const configService: ConfigService = req.app.get('configService');
    try {
        const serviceConfigs = await configService.getServiceConfigs();
        res.status(200).json(serviceConfigs);
    } catch (err) {
        console.log(`[config] GET /config/services failed: ${err?.message}`);
        res.status(503).json('Configuration unavailable');
    }
});

configController.use(routeNotFoundLogsMiddleware);

export default configController;
