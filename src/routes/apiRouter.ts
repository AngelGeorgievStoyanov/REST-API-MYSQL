import express from 'express';
import apiRouterV1 from './apiRouterV1';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { ApiError } from '../utils/apiError';

/** Version layer of the API; the `/api` prefix belongs to the application bootstrap. */
const apiRouter = express.Router();

apiRouter.use('/v1', apiRouterV1);

// Anything else under `/api` is answered with the shared error contract, so an
// unknown version or path never reaches the Express default HTML 404 page.
apiRouter.use((_req, _res, next) => next(ApiError.notFound()));
apiRouter.use(apiErrorMiddleware);

export default apiRouter;
