"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const tripController_1 = require("./controllers/tripController");
const authController_1 = require("./controllers/authController");
const userService_1 = require("./services/userService");
const tripService_1 = require("./services/tripService");
const pointController_1 = require("./controllers/pointController");
const pointService_1 = require("./services/pointService");
const commentController_1 = require("./controllers/commentController");
const commentService_1 = require("./services/commentService");
const createMySQL_1 = require("./db/createMySQL");
const HOSTNAME = process.env.MYSQL_HOST || 'localhost';
const PORT = Number(process.env.PORT) || 8080;
const app = express();
app.use(cors({
    origin: '*',
    methods: 'GET,POST,PUT,DELETE'
}));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use('/users', authController_1.default);
app.use('/data/trips', tripController_1.default);
app.use('/data/points', pointController_1.default);
app.use('/data/comments', commentController_1.default);
(() => __awaiter(void 0, void 0, void 0, function* () {
    const pool = mysql.createPool({
        connectionLimit: 10,
        host: process.env.MYSQOL_HOST,
        port: Number(process.env.MYSQL_PORT),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
    });
    pool.getConnection(function (err, connection) {
        if (err)
            throw err;
        console.log("Connected!");
        pool.query(createMySQL_1.createuser, function (err, result) {
            if (err)
                throw err;
            console.log("USER hack_trip created");
        });
        connection.release();
        pool.query(createMySQL_1.grantuser, function (err, result) {
            if (err)
                throw err;
            console.log("GRANT USER hack_trip");
        });
        connection.release();
        pool.query(createMySQL_1.flush, function (err, result) {
            if (err)
                throw err;
            console.log("FLUSH PRIVILEGES hack_trip");
        });
        connection.release();
        pool.query(createMySQL_1.database, function (err, result) {
            if (err)
                throw err;
            console.log("DATA BASE hack_trip created");
        });
        connection.release();
        pool.query(createMySQL_1.usedb, function (err, result) {
            if (err)
                throw err;
            console.log("USE DATA BASE hack_trip");
        });
        connection.release();
        pool.query(createMySQL_1.users, function (err, result) {
            if (err) {
                console.log(err);
            }
            else {
                console.log(`Table USERS created!`);
            }
        });
        connection.release();
        pool.query(createMySQL_1.trips, function (err, result) {
            if (err) {
                console.log(err);
            }
            else {
                console.log(`Table TRIPS created!`);
            }
        });
        connection.release();
        pool.query(createMySQL_1.points, function (err, result) {
            if (err) {
                console.log(err);
            }
            else {
                console.log(`Table POINTS created!`);
            }
        });
        connection.release();
        pool.query(createMySQL_1.comments, function (err, result) {
            if (err) {
                console.log(err);
            }
            else {
                console.log(`Table COMMENTS created!`);
            }
        });
        connection.destroy();
    });
    app.set("usersRepo", new userService_1.UserRepository(pool));
    app.set("tripsRepo", new tripService_1.TripRepository(pool));
    app.set("pointsRepo", new pointService_1.PointTripRepository(pool));
    app.set("commentsRepo", new commentService_1.CommentTripRepository(pool));
    app.listen(PORT, HOSTNAME, () => {
        console.log(`HTTP Server listening on: http://${HOSTNAME}:${PORT}`);
    });
}))();
app.on('error', err => {
    console.log('Server error:', err);
});
//# sourceMappingURL=index.js.map