import * as dotenv from 'dotenv'
dotenv.config()
import * as express from 'express'
import * as cors from 'cors';
import * as logger from 'morgan';
import * as mysql from 'mysql';
import * as bodyParser from 'body-parser'
import tripController from './controllers/tripController'
import authController from './controllers/authController';
import { UserRepository } from './services/userService';
import { TripRepository } from './services/tripService';
import pointController from './controllers/pointController';
import { PointTripRepository } from './services/pointService';
import commentController from './controllers/commentController';
import { CommentTripRepository } from './services/commentService';
import { comments, database, points, trips, users } from './db/createMySQL';


const HOSTNAME = process.env.MYSQL_HOST;
const PORT = Number(process.env.PORT);


const app = express();
app.use(cors({
    origin: process.env.REMOTE_CLIENT_APP,
    methods: 'GET,POST,PUT,DELETE'
}));


app.use(logger('dev'));

app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json({ limit: '50mb' }));
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
        pool.query(database, function (err, result) {
            if (err) throw err;
            console.log("Database hack_trip created");
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

        connection.destroy()


    });




    app.set("usersRepo", new UserRepository(pool));
    app.set("tripsRepo", new TripRepository(pool));
    app.set("pointsRepo", new PointTripRepository(pool));
    app.set("commentsRepo", new CommentTripRepository(pool));

    app.listen(PORT, HOSTNAME, () => {
        console.log(`HTTP Server listening on: http://${HOSTNAME}:${PORT}`);
    })
})()



app.on('error', err => {
    console.log('Server error:', err);
});