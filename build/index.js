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
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var dotenv = require("dotenv");
dotenv.config();
var express = require("express");
var cors = require("cors");
var mysql = require("mysql");
var bodyParser = require("body-parser");
var authController_1 = require("./controllers/authController");
var tripController_1 = require("./controllers/tripController");
var pointController_1 = require("./controllers/pointController");
var commentController_1 = require("./controllers/commentController");
var userService_1 = require("./services/userService");
var tripService_1 = require("./services/tripService");
var pointService_1 = require("./services/pointService");
var commentService_1 = require("./services/commentService");
var createMySQL_1 = require("./db/createMySQL");
var HOSTNAME = process.env.MYSQL_HOST || 'localhost';
var PORT = Number(process.env.PORT) || 8080;
var app = express();
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
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var pool;
    return __generator(this, function (_a) {
        pool = mysql.createPool({
            connectionLimit: 10,
            host: process.env.MYSQOL_HOST,
            port: Number(process.env.MYSQL_PORT),
            user: process.env.MYSQL_USER,
            password: 'angel.stoyanov',
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
                    console.log("Table USERS created!");
                }
            });
            connection.release();
            pool.query(createMySQL_1.trips, function (err, result) {
                if (err) {
                    console.log(err);
                }
                else {
                    console.log("Table TRIPS created!");
                }
            });
            connection.release();
            pool.query(createMySQL_1.points, function (err, result) {
                if (err) {
                    console.log(err);
                }
                else {
                    console.log("Table POINTS created!");
                }
            });
            connection.release();
            pool.query(createMySQL_1.comments, function (err, result) {
                if (err) {
                    console.log(err);
                }
                else {
                    console.log("Table COMMENTS created!");
                }
            });
            connection.destroy();
        });
        app.set("usersRepo", new userService_1.UserRepository(pool));
        app.set("tripsRepo", new tripService_1.TripRepository(pool));
        app.set("pointsRepo", new pointService_1.PointTripRepository(pool));
        app.set("commentsRepo", new commentService_1.CommentTripRepository(pool));
        app.listen(PORT, HOSTNAME, function () {
            console.log("HTTP Server listening on: http://".concat(HOSTNAME, ":").concat(PORT));
        });
        return [2 /*return*/];
    });
}); })();
app.on('error', function (err) {
    console.log('Server error:', err);
});
//# sourceMappingURL=index.js.map