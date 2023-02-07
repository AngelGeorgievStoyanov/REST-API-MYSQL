import * as express from 'express'
import * as cors from 'cors';
import * as logger from 'morgan';
import * as mysql from 'mysql';
import { NextFunction, Request, Response } from "express";

import * as bodyParser from 'body-parser'
import tripController from './controllers/tripController'
import authController from './controllers/authController';
import { UserRepository } from './services/userService';
import { TripRepository } from './services/tripService';
import pointController from './controllers/pointController';
import { PointTripRepository } from './services/pointService';
import commentController from './controllers/commentController';
import { CommentTripRepository } from './services/commentService';
import { join } from 'path';

export const HOSTNAME = 'localhost';
export const PORT = 8001;


const app = express();
// app.options('*', cors());
app.use(cors({
    origin: 'http://localhost:3000',
    methods: 'GET,POST,PUT,DELETE'
}));


app.use(logger('dev'));

app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use('/uploads', express.static(join(__dirname, 'uploads')));


app.use('/users', authController);
app.use('/data/trips', tripController);
app.use('/data/points', pointController);
app.use('/data/comments', commentController);


let users = `CREATE TABLE IF NOT EXISTS hack_trip.users (
    _id INT NOT NULL AUTO_INCREMENT,
    email VARCHAR(45) NOT NULL,
    firstName VARCHAR(45) NOT NULL,
    lastName VARCHAR(45) NOT NULL,
    hashedPassword VARCHAR(85) NOT NULL,
    timeCreated DATE NULL DEFAULT NULL,
    timeEdited DATE NULL DEFAULT NULL,
    lastTimeLogin DATE NULL DEFAULT NULL,
    countOfLogs BIGINT DEFAULT NULL,
    imageFile VARCHAR(2000) NULL DEFAULT NULL,
    role VARCHAR(8) NOT NULL DEFAULT 'user',
    status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
    PRIMARY KEY (_id),
    UNIQUE INDEX _id_UNIQUE (_id ASC) VISIBLE,
    UNIQUE INDEX email_UNIQUE (email ASC) VISIBLE)
  `;

let trips = `CREATE TABLE IF NOT EXISTS hack_trip.trips (
    _id INT NOT NULL AUTO_INCREMENT,
    title VARCHAR(60) NOT NULL,
    description VARCHAR(2000) NULL,
    price DOUBLE NULL,
    transport VARCHAR(45) NULL DEFAULT NULL,
    countPeoples INT NOT NULL,
    typeOfPeople VARCHAR(45) NULL DEFAULT NULL,
    destination VARCHAR(60) NULL DEFAULT NULL,
    imageUrl VARCHAR(500) NULL DEFAULT NULL,
    coments VARCHAR(45) NULL DEFAULT NULL,
    likes VARCHAR(45) NULL DEFAULT NULL,
    _ownerId VARCHAR(45) NULL DEFAULT NULL,
    lat DOUBLE NULL DEFAULT NULL,
    lng DOUBLE NULL DEFAULT NULL,
    timeCreated DATE NULL DEFAULT NULL,
    timeEdited DATE NULL DEFAULT NULL,
    reportTrip VARCHAR(45) NULL DEFAULT NULL,
    imageFile VARCHAR(2000) NULL DEFAULT NULL,
    favorites VARCHAR(45) NULL DEFAULT NULL,
    PRIMARY KEY (_id),
    UNIQUE INDEX _id_UNIQUE (_id ASC) VISIBLE)
  `;


let points = `CREATE TABLE IF NOT EXISTS hack_trip.points (
    _id INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    description VARCHAR(1050) NULL DEFAULT NULL,
    imageUrl VARCHAR(500) NULL DEFAULT NULL,
    _ownerTripId VARCHAR(45) NULL DEFAULT NULL,
    lat VARCHAR(45) NULL DEFAULT NULL,
    lng VARCHAR(45) NULL DEFAULT NULL,
    pointNumber VARCHAR(45) NOT NULL,
    imageFile VARCHAR(2000) NULL DEFAULT NULL,
    PRIMARY KEY (_id))
  `;

let comments = `CREATE TABLE IF NOT EXISTS hack_trip.comments (
    _id INT NOT NULL AUTO_INCREMENT,
    nameAuthor VARCHAR(45) NOT NULL,
    comment VARCHAR(1000) NOT NULL,
    _tripId VARCHAR(45) NOT NULL,
    _ownerId VARCHAR(45) NOT NULL,
    PRIMARY KEY (_id),
    UNIQUE INDEX _id_UNIQUE (_id ASC) VISIBLE)
  `;

(async () => {
    const pool = mysql.createPool({
        connectionLimit: 10,
        host: 'localhost',
        port: 3306,
        user: 'trayan',
        password: 'trayan',
        // database: 'hack_trip'
    });

    pool.getConnection(function (err, connection) {
        if (err) throw err;
        console.log("Connected!");
        pool.query("CREATE DATABASE IF NOT EXISTS hack_trip", function (err, result) {
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