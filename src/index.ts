import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import authController from './controllers/authController';
import tripController from './controllers/tripController';
import pointController from './controllers/pointController';
import commentController from './controllers/commentController';
import mysql from 'mysql';
import { UserRepository } from './services/userService';
import { TripRepository } from './services/tripService';
import { PointTripRepository } from './services/pointService';
import { CommentTripRepository } from './services/commentService';
import { VerifyTokenRepository } from './services/verifyTokenService';
import dotenv from 'dotenv';
import cloudController from './controllers/cloudController';
import { CloudRepository } from './services/cloudService';
import { RouteNotFoudLogsRepository } from './services/routeNotFoundLogsService';

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
app.use('/data/trips', tripController);
app.use('/data/points', pointController);
app.use('/data/comments', commentController);
app.use('/data/cloud', cloudController);


app.get('/', (req: express.Request, res: express.Response) => {
    res.send('Hello  HACK TRIP ')
});



(() => {
    const pool = mysql.createPool({
        connectionLimit: 10,
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQOL_PORT),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
    });
    app.use((req, res, next) => {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        next();
    });
    app.set("trust proxy", true);
    app.set("usersRepo", new UserRepository(pool));
    app.set("tripsRepo", new TripRepository(pool));
    app.set("pointsRepo", new PointTripRepository(pool));
    app.set("commentsRepo", new CommentTripRepository(pool));
    app.set("verifyTokenRepo", new VerifyTokenRepository(pool));
    app.set("imagesRepo", new CloudRepository(pool));
    app.set("routeNotFoundLogsRepo", new RouteNotFoudLogsRepository(pool));

    const server = app.listen(port, () => {
        console.log(`Connected succesfully on port ${port}`)
    });

    server.on('error', err => {
        console.log('Server error:', err);
    });
})();
