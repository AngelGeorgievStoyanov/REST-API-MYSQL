import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import configController from './controllers/configController';
import { ConfigRepository } from './repositories/configRepository';
import apiRouter from './routes/apiRouter';
import { prisma } from './clients/prisma';
import { dynamicConfig } from './services/dynamicConfig';
import { loadEnvironmentConfig } from './config/environment';
import { getErrorMessage } from './utils/error';

dotenv.config()

const app = express()
const port = 8080;


// const allowedOrigins = ['http://localhost:3000'];

const allowedOrigins = ['https://hack-trip.com', 'https://www.hack-trip.com'];


const options: cors.CorsOptions = {
    origin: allowedOrigins,
    methods: 'GET,POST,PUT,DELETE',
    // The refresh token travels in an HttpOnly cookie, which a browser only
    // sends with a credentialed cross-origin request.
    credentials: true
};
app.use(cors(options));



app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 100000 }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.raw({ limit: '50mb', inflate: true }))

app.use('/api', apiRouter);
app.use('/config', configController);


app.get('/', (req: express.Request, res: express.Response) => {
    res.send('Hello  HACK TRIP ')
});



(async () => {
    app.use((req, res, next) => {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        next();
    });
    app.set("trust proxy", true);

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

