import express from 'express';
import apiRouterV1 from './apiRouterV1';

/** Version layer of the API; the `/api` prefix belongs to the application bootstrap. */
const apiRouter = express.Router();

apiRouter.use('/v1', apiRouterV1);

export default apiRouter;
