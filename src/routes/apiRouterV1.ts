import express from 'express';
import tripController from '../controllers/tripController';

/**
 * Resource routers of API v1. Only migrated slices are mounted here — the legacy
 * `/data/*` routers are still mounted at application level.
 */
const apiRouterV1 = express.Router();

apiRouterV1.use('/trips', tripController);

export default apiRouterV1;
