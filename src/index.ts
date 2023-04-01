import * as dotenv from 'dotenv'
dotenv.config()
import * as  express from 'express'
import * as cors from 'cors';
import * as mysql from 'mysql';
import * as bodyParser from 'body-parser'
import authController from './controllers/authController';
import tripController from './controllers/tripController'
import pointController from './controllers/pointController';
import commentController from './controllers/commentController';
import { UserRepository } from './services/userService';
import { TripRepository } from './services/tripService';
import { PointTripRepository } from './services/pointService';
import { CommentTripRepository } from './services/commentService';
import { comments, createuser, database, flush, grantuser, points, trips, usedb, users, verify } from './db/createMySQL';
import { VerifyTokenRepository } from './services/verifyTokenService';


const HOSTNAME = process.env.MYSQL_HOST || 'localhost';
const PORT = Number(process.env.PORT) || 8000;


const app = express();



const allowedOrigins = ['http://localhost:3000'];
// const allowedOrigins = ['https://hack-trip.com', 'https://www.hack-trip.com'];


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




(async () => {
    const pool = mysql.createPool({
        connectionLimit: 10,
        host: process.env.MYSQOL_HOST,
        port: Number(process.env.MYSQL_PORT),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
    });

    pool.getConnection(function (err, connection) {
        if (err) throw err;
        console.log("Connected!");

        pool.query(createuser, function (err, result) {
            if (err) throw err;
            console.log("USER hack_trip created");
        });
        connection.release()

        pool.query(grantuser, function (err, result) {
            if (err) throw err;
            console.log("GRANT USER hack_trip");
        });

        connection.release()

        pool.query(flush, function (err, result) {
            if (err) throw err;
            console.log("FLUSH PRIVILEGES hack_trip");
        });

        connection.release()
        pool.query(database, function (err, result) {
            if (err) throw err;
            console.log("DATA BASE hack_trip created");
        });

        connection.release()
        pool.query(usedb, function (err, result) {
            if (err) throw err;
            console.log("USE DATA BASE hack_trip");
        });

        connection.release()
        pool.query(users, function (err, result) {
            if (err) {
                console.log(err)
            } else {
                console.log(`Table USERS created!`)
            }

        })
        connection.release()

        pool.query(trips, function (err, result) {
            if (err) {
                console.log(err)
            } else {
                console.log(`Table TRIPS created!`)
            }

        })
        connection.release()



        pool.query(points, function (err, result) {
            if (err) {
                console.log(err)
            } else {
                console.log(`Table POINTS created!`)
            }

        })
        connection.release()


        pool.query(comments, function (err, result) {
            if (err) {
                console.log(err)
            } else {
                console.log(`Table COMMENTS created!`)
            }

        })

        connection.release()


        pool.query(verify, function (err, result) {
            if (err) {
                console.log(err)
            } else {
                console.log(`Table VERIFY created!`)
            }

        })


        connection.destroy()


    });




    app.set("usersRepo", new UserRepository(pool));
    app.set("tripsRepo", new TripRepository(pool));
    app.set("pointsRepo", new PointTripRepository(pool));
    app.set("commentsRepo", new CommentTripRepository(pool));
    app.set("verifyTokenRepo", new VerifyTokenRepository(pool));

    app.listen(PORT, HOSTNAME, () => {
        console.log(`HTTP Server listening on: http://${HOSTNAME}:${PORT}`);
    })
})()



app.on('error', err => {
    console.log('Server error:', err);
});