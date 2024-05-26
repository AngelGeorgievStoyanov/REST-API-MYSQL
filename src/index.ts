import * as express from 'express';
import * as cors from 'cors';
import * as bodyParser from 'body-parser';
import authController from './controllers/authController';
import tripController from './controllers/tripController';
import pointController from './controllers/pointController';
import commentController from './controllers/commentController';
import * as mysql from 'mysql';
import { UserRepository } from './services/userService';
import { TripRepository } from './services/tripService';
import { PointTripRepository } from './services/pointService';
import { CommentTripRepository } from './services/commentService';
import { VerifyTokenRepository } from './services/verifyTokenService';
import { comments, createuser, database, flush, grantuser, logFailed, points, routeNotFoundLogs, trips, usedb, users, verify } from './db/createMySQL';
import * as dotenv from 'dotenv';
import cloudController from './controllers/cloudController';
import { CloudRepository } from './services/cloudService';
import { RouteNotFoudLogsRepository } from './services/routeNotFoundLogsService';
import { IRouteNotFoundLogsRepository } from './interface/routeNotFoundLogs-repository';
import { IRouteNotFoundLogs } from './model/routeNotFoudLogs';
var ip = require('ip');

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


app.get('/', (req, res) => {
    res.send('Hello  HACK TRIP ')
});



(async () => {
    const pool = mysql.createPool({
        connectionLimit: 10,
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQOL_PORT),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
    });

    pool.getConnection(async (err, connection) => {
        if (err) {
            console.error('Error getting database connection:', err);
            return;
        }

        console.log("Connected!");

        const queries = [
            { sql: createuser, message: "USER hack_trip created" },
            { sql: grantuser, message: "GRANT USER hack_trip" },
            { sql: flush, message: "FLUSH PRIVILEGES hack_trip" },
            { sql: database, message: "DATA BASE hack_trip created" },
            { sql: usedb, message: "USE DATA BASE hack_trip" },
            { sql: users, message: "Table USERS created!" },
            { sql: trips, message: "Table TRIPS created!" },
            { sql: points, message: "Table POINTS created!" },
            { sql: comments, message: "Table COMMENTS created!" },
            { sql: verify, message: "Table VERIFY created!" },
            { sql: logFailed, message: "Table FAILED LOGS created!" },
            { sql: routeNotFoundLogs, message: "Table ROUTE NOT FOUND LOGS created!" },
        ];

        try {
            for (const query of queries) {
                await new Promise((resolve, reject) => {
                    connection.query(query.sql, (err, result) => {
                        if (err) {
                            console.error(`Error executing query: ${query.sql}`, err);
                            reject(err);
                        } else {
                            console.log(query.message);
                            resolve(result);
                        }
                    });
                });
            }
        } catch (error) {
            console.error('Error executing queries:', error);
        } finally {
            connection.release();
        }
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

    app.listen(port, () => {
        console.log(`Connected succesfully on port ${port}`)
    });
})();


app.on('error', err => {
    console.log('Server error:', err);
});