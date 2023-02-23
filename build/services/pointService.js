"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.PointTripRepository = void 0;
var uuid_1 = require("uuid");
var createSql = "INSERT INTO hack_trip.points (\n    _id,\n    name,\n    description,\n    _ownerTripId,\n    lat,\n    lng,\n    pointNumber,\n    imageFile,\n    _ownerId\n  )\n  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);";
var selectOne = "SELECT * FROM hack_trip.points WHERE _id =?";
var deleteOne = "DELETE from hack_trip.points WHERE _id =?";
var deleteByOTripId = "DELETE from hack_trip.points WHERE _ownerTripId =?";
var selectByOwnerId = "SELECT * FROM hack_trip.points WHERE _ownerTripId =?";
var updateSql = "UPDATE hack_trip.points SET name =?, description=?, lat=?, lng=?, pointNumber=?, imageFile =? WHERE _id =?";
var updatePositionSql = "UPDATE hack_trip.points SET pointNumber=? WHERE _id =?";
var updateSqlImages = "UPDATE hack_trip.points SET imageFile =? WHERE _id =?";
var findBytripIdOrderByPointPositionSql = "SELECT * FROM hack_trip.points  WHERE _ownerTripId=? ORDER BY pointNumber ASC";
var PointTripRepository = /** @class */ (function () {
    function PointTripRepository(pool) {
        this.pool = pool;
    }
    PointTripRepository.prototype.create = function (point) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                point._id = (0, uuid_1.v4)();
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        var imagesNew = point.imageFile.join();
                        _this.pool.query(createSql, [point._id, point.name, point.description, point._ownerTripId, point.lat, point.lng, point.pointNumber, imagesNew, point._ownerId], function (err, rows, fields) {
                            if (err) {
                                console.log(err.message);
                                reject(err);
                                return;
                            }
                            resolve(point);
                        });
                    })];
            });
        });
    };
    PointTripRepository.prototype.findByTripId = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query('SELECT * FROM hack_trip.points WHERE _ownerTripId =?', [id], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (rows) {
                                var points = rows;
                                resolve(points.map(function (point) { return (__assign(__assign({}, point), { imageFile: point.imageFile ? point.imageFile.split(/[,\s]+/) : [] })); }));
                            }
                            else {
                                reject(new Error("Error finding new document in database"));
                            }
                        });
                    })];
            });
        });
    };
    PointTripRepository.prototype.deletePointById = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var pointDel;
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(selectOne, [id], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (rows.length === 1) {
                                deleteOne;
                                pointDel = rows[0];
                                _this.pool.query(deleteOne, [id], function (err, rows, fields) {
                                    if (err) {
                                        console.log(err);
                                        reject(err);
                                        return;
                                    }
                                    if (!err) {
                                        resolve(pointDel);
                                    }
                                });
                            }
                            else {
                                reject(new Error("Error finding new document in database"));
                            }
                        });
                    })];
            });
        });
    };
    PointTripRepository.prototype.deletePointByTripId = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var pointsDel;
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(selectByOwnerId, [id], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (rows.length > 0) {
                                deleteOne;
                                pointsDel = rows;
                                _this.pool.query(deleteByOTripId, [id], function (err, rows, fields) {
                                    if (err) {
                                        console.log(err);
                                        reject(err);
                                        return;
                                    }
                                    if (!err) {
                                        resolve(pointsDel);
                                    }
                                });
                            }
                            else {
                                return;
                            }
                        });
                    })];
            });
        });
    };
    PointTripRepository.prototype.getPointById = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query('SELECT * FROM hack_trip.points WHERE _id =?', [id], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (rows.length == 1) {
                                var point = rows[0];
                                resolve(__assign(__assign({}, point), { imageFile: point.imageFile ? point.imageFile.split(/[,\s]+/) : point.imageFile !== null && point.imageFile.length > 0 ? point.imageFile.split('') : [] }));
                            }
                            else {
                                reject(new Error("Error finding new document in database"));
                            }
                        });
                    })];
            });
        });
    };
    PointTripRepository.prototype.updatePointById = function (id, point) {
        return __awaiter(this, void 0, void 0, function () {
            var editedImg;
            var _this = this;
            return __generator(this, function (_a) {
                editedImg = point.imageFile.join();
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(updateSql, [point.name, point.description, point.lat, point.lng, point.pointNumber, editedImg, id], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (!err) {
                                _this.pool.query(selectOne, [id], function (err, rows, fields) {
                                    if (err) {
                                        console.log(err);
                                        reject(err);
                                        return;
                                    }
                                    if (rows) {
                                        var point_1 = rows[0];
                                        resolve(point_1);
                                    }
                                });
                            }
                            else {
                                reject(new Error("Error finding new document in database"));
                            }
                        });
                    })];
            });
        });
    };
    PointTripRepository.prototype.updatePointPositionById = function (id, pointPosition) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(updatePositionSql, [pointPosition, id], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (!err) {
                                _this.pool.query(selectOne, [id], function (err, rows, fields) {
                                    if (err) {
                                        console.log(err);
                                        reject(err);
                                        return;
                                    }
                                    if (rows) {
                                        var point = rows[0];
                                        resolve(point);
                                    }
                                });
                            }
                            else {
                                reject(new Error("Error finding new document in database"));
                            }
                        });
                    })];
            });
        });
    };
    PointTripRepository.prototype.editImagesByPointId = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var editedImages;
            var _this = this;
            return __generator(this, function (_a) {
                editedImages = data.imageFile.join();
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(updateSqlImages, [editedImages, id], function (err, rows, fields) {
                            if (err) {
                                reject(err);
                                return;
                            }
                            if (!err) {
                                _this.pool.query(selectOne, [id], function (err, rows, fields) {
                                    if (err) {
                                        console.log(err);
                                        reject(err);
                                        return;
                                    }
                                    if (rows) {
                                        var point = rows.map(function (row) { return (__assign(__assign({}, row), { imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [] })); });
                                        resolve(point[0]);
                                    }
                                });
                            }
                            else {
                                reject(new Error("Error finding new document in database"));
                            }
                        });
                    })];
            });
        });
    };
    PointTripRepository.prototype.findBytripIdOrderByPointPosition = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(findBytripIdOrderByPointPositionSql, [id], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (rows) {
                                resolve(rows.map(function (row) { return (__assign(__assign({}, row), { imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [] })); }));
                            }
                            else {
                                reject(new Error("Error finding new document in database"));
                            }
                        });
                    })];
            });
        });
    };
    return PointTripRepository;
}());
exports.PointTripRepository = PointTripRepository;
//# sourceMappingURL=pointService.js.map