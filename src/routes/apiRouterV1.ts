import express from 'express';
import adminController from '../controllers/adminController';
import authController from '../controllers/authController';
import commentController from '../controllers/commentController';
import configController from '../controllers/configController';
import favoriteController from '../controllers/favoriteController';
import imagesController from '../controllers/imagesController';
import likeController from '../controllers/likeController';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { ApiError } from '../utils/apiError';
import pointController, { dayPointController, tripPointController } from '../controllers/pointController';
import meController from '../controllers/meController';
import reportController from '../controllers/reportController';
import tripController from '../controllers/tripController';

/**
 * Resource routers of API v1.
 *
 * The comment collections live below the `/trip-groups`, `/trips`, `/points` and
 * `/images` prefixes, so that router is mounted before `tripController`, which
 * ends with a catch-all 404. The point collection read sits below `/trips` for
 * the same reason and is mounted before `tripController` as well.
 */
const apiRouterV1 = express.Router();

apiRouterV1.use('/auth', authController);
apiRouterV1.use('/admin', adminController);
apiRouterV1.use('/config', configController);
apiRouterV1.use('/me', meController);
apiRouterV1.use(commentController);
// The comments router serves several prefixes from the v1 root, so it cannot host
// the terminal logger itself (that would capture every unmatched v1 path). Its own
// collection prefix is scoped here instead.
apiRouterV1.use('/comments', routeNotFoundLogsMiddleware);
apiRouterV1.use('/likes', likeController);
apiRouterV1.use('/favorites', favoriteController);
apiRouterV1.use('/reports', reportController);
apiRouterV1.use('/trips', tripPointController);
apiRouterV1.use('/trips', tripController);
apiRouterV1.use('/points', pointController);
apiRouterV1.use('/days', dayPointController);
apiRouterV1.use('/images', imagesController);
apiRouterV1.use((_req, _res, next) => { next(ApiError.notFound()); });
apiRouterV1.use(apiErrorMiddleware);

export default apiRouterV1;
