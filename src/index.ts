import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import pinoHttp from 'pino-http';
import { SERVER_PORT, SHUTDOWN_SIGNALS, TRUST_PROXY_HOPS } from './constants/application';
import {
    CORS_ALLOWED_HEADERS,
    CORS_METHODS,
    HSTS_HEADER_NAME,
    HSTS_HEADER_VALUE,
    JSON_BODY_LIMIT,
    URLENCODED_BODY_LIMIT,
    URLENCODED_PARAMETER_LIMIT,
} from './constants/http';
import { EnvironmentConfig, loadEnvironmentConfig } from './config/environment';
import { clientHeaderMiddleware } from './middlewares/clientHeaderMiddleware';
import { publicApiRateLimit } from './middlewares/publicApiRateLimit';
import { apiErrorMiddleware } from './middlewares/apiErrorMiddleware';
import { requestIdMiddleware } from './middlewares/requestIdMiddleware';
import apiRouter from './routes/apiRouter';
import { initializeApplication, releaseApplicationResources } from './startup/application';
import { getErrorMessage } from './utils/error';
import { logger } from './utils/logger';

/** The environment is read once and handed to every part of the startup. */
const environment = loadEnvironmentConfig();

const app = express();

configureApplication(app, environment);

bootstrap(environment);

/**
 * Wires the HTTP stack in the order one request travels through it: the client
 * marker first, then the transport concerns, then the routes.
 */
function configureApplication(application: express.Express, config: EnvironmentConfig): void {
    application.disable('x-powered-by');
    application.set('trust proxy', TRUST_PROXY_HOPS);
    application.use(setHstsHeader);

    application.use(requestIdMiddleware);

    application.use(pinoHttp({
        logger,
        customLogLevel: (_req, res, _err) => {
            if (res.statusCode >= 400 && res.statusCode < 500) return 'warn';
            if (res.statusCode >= 500) return 'error';
            return 'info';
        },
        customSuccessMessage: (req, res) => {
            return `${req.method} ${res.statusCode} - ${req.url}`;
        },
        customErrorMessage: (req, res, err) => {
            return `Request failed: ${err.message}`;
        },
        autoLogging: {
            ignore: (req) => {
                return req.method === 'OPTIONS' || req.url === '/';
            },
        },
        genReqId: (req) => {
            return (req as unknown as { id: string }).id;
        },
    }));

    application.use(clientHeaderMiddleware);

    application.use(cors({
        origin: config.corsOrigins,
        methods: CORS_METHODS,
        allowedHeaders: CORS_ALLOWED_HEADERS,
        credentials: true,
    }));

    application.use('/api', publicApiRateLimit);

    // Binary uploads never pass through a body parser: the image storage engine
    // reads them with its own per-file cap, so neither parser needs a large limit.
    application.use(bodyParser.json({ limit: JSON_BODY_LIMIT }));
    application.use(bodyParser.urlencoded({
        extended: true,
        limit: URLENCODED_BODY_LIMIT,
        parameterLimit: URLENCODED_PARAMETER_LIMIT,
    }));

    // Registered before the routes, so the policy also reaches their responses.
    application.use('/api', apiRouter);

    // Last resort: an error raised before a router (a body parser, for example)
    // must answer with the API contract instead of the Express default page.
    application.use(apiErrorMiddleware);

    application.get('/', (_req: express.Request, res: express.Response) => {
        res.send('Hello  HACK TRIP ');
    });
}

/** The proxy terminates TLS, so the application itself answers with the HSTS policy. */
function setHstsHeader(_req: express.Request, res: express.Response, next: express.NextFunction): void {
    res.setHeader(HSTS_HEADER_NAME, HSTS_HEADER_VALUE);
    next();
}

async function bootstrap(config: EnvironmentConfig): Promise<void> {
    try {
        await initializeApplication(config);
    } catch (error: unknown) {
        logger.error(`[startup] configuration failed: ${getErrorMessage(error)}`);
        await releaseApplicationResources();
        process.exit(1);
    }

    startServer();
}

function startServer(): void {
    const server = app.listen(SERVER_PORT, () => {
        logger.info(`Connected succesfully on port ${SERVER_PORT}`);
    });

    server.on('error', (error: Error) => {
        logger.error({ err: error }, 'Server error');
    });

    server.on('close', () => {
        void releaseApplicationResources();
    });

    for (const signal of SHUTDOWN_SIGNALS) {
        process.on(signal, () => {
            logger.info(`[shutdown] ${signal} received, closing the server`);
            server.close();
        });
    }
}

