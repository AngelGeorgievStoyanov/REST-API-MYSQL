import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import authController from './controllers/authController';
import tripController from './controllers/tripController';
import pointController from './controllers/pointController';
import commentController from './controllers/commentController';
import { initMySqlPool } from './db/mysqlPool';
import { UserRepository } from './services/userService';
import { PointTripRepository } from './services/pointService';
import { CommentTripRepository } from './services/commentService';
import { VerifyTokenRepository } from './services/verifyTokenService';
import dotenv from 'dotenv';
import cloudController from './controllers/cloudController';
import { CloudRepository } from './services/cloudService';
import { RouteNotFoudLogsRepository } from './services/routeNotFoundLogsService';
import configController from './controllers/configController';
import { ConfigRepository } from './services/configRepository';
import { prisma } from './clients/prisma';
import { dynamicConfig } from './config/dynamicConfig';
import { loadEnvironmentConfig } from './config/environment';
import { getErrorMessage } from './utils/error';

dotenv.config()

const app = express()
const port = 8080;


// const allowedOrigins = ['http://localhost:3000'];

const allowedOrigins = ['https://hack-trip.com', 'https://www.hack-trip.com'];


const options: cors.CorsOptions = {
    origin: allowedOrigins,
    methods: 'GET,POST,PUT,DELETE'
};
app.use(cors(options));



app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 100000 }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.raw({ limit: '50mb', inflate: true }))

app.use('/users', authController);
app.use('/api/trips', tripController);
app.use('/data/points', pointController);
app.use('/data/comments', commentController);
app.use('/data/cloud', cloudController);
app.use('/config', configController);


app.get('/', (req: express.Request, res: express.Response) => {
    res.send('Hello  HACK TRIP ')
});



(async () => {
    const pool = initMySqlPool();
    app.use((req, res, next) => {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        next();
    });
    app.set("trust proxy", true);
    app.set("usersRepo", new UserRepository(pool));
    app.set("pointsRepo", new PointTripRepository(pool));
    app.set("commentsRepo", new CommentTripRepository(pool));
    app.set("verifyTokenRepo", new VerifyTokenRepository(pool));
    app.set("imagesRepo", new CloudRepository(pool));
    app.set("routeNotFoundLogsRepo", new RouteNotFoudLogsRepository(pool));

    try {
        const environment = loadEnvironmentConfig();
        await dynamicConfig.init(new ConfigRepository(prisma), environment);
    } catch (err: unknown) {
        const reason = getErrorMessage(err);
        console.log(`[startup] configuration failed: ${reason}`);
        await prisma.$disconnect().catch(() => undefined);
        process.exit(1);
    }

    const server = app.listen(port, () => {
        console.log(`Connected succesfully on port ${port}`)
    });

    server.on('close', () => {
        dynamicConfig.stopRefreshTimer();
        prisma.$disconnect().catch(() => undefined);
    });

    server.on('error', err => {
        console.log('Server error:', err);
    });
})();

