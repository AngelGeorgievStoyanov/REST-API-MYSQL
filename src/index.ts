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

export const HOSTNAME = 'localhost';
export const PORT = 8001;


const app = express();
app.options('*', cors());
app.use(cors({
    origin: 'http://localhost:3000',
    methods: 'GET,POST,PUT,DELETE'
}));

app.use(logger('dev'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json())
app.use('/users', authController);
app.use('/data/trips', tripController);
app.use('/data/points', pointController);
app.use('/data/comments', commentController);







    (async () => {
        const pool = mysql.createPool({
            connectionLimit: 10,
            host: 'localhost',
            port: 3306,
            user: 'trayan',
            password: 'trayan',
            database: 'fullstack_react_2022'
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