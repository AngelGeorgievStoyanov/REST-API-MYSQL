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
exports.TripRepository = void 0;
var uuid_1 = require("uuid");
var createSql = "INSERT INTO hack_trip.trips (\n    _id,\n    title,\n    description,\n    price,\n    transport,\n    countPeoples,\n    typeOfPeople,\n    destination,\n    coments,\n    likes,\n    _ownerId,\n    lat,\n    lng,\n    timeCreated,\n    timeEdited,\n    reportTrip,\n    imageFile,\n    favorites\n  )\n   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
var selectOne = "SELECT * FROM hack_trip.trips WHERE _id =?";
var deleteOne = "DELETE from hack_trip.trips WHERE _id =?";
var updateSql = "UPDATE hack_trip.trips SET title =?, description=?, price=?, transport=?, countPeoples=?, typeOfPeople=?, destination=?, lat=?,lng=?, timeEdited=?, imageFile =? WHERE _id =?";
var updateSqlLikes = "UPDATE hack_trip.trips SET likes =? WHERE _id =?";
var updateSqlFavorites = "UPDATE hack_trip.trips SET favorites =? WHERE _id =?";
var updateSqlReports = "UPDATE hack_trip.trips SET reportTrip =? WHERE _id =?";
var updateSqlImages = "UPDATE hack_trip.trips SET imageFile =? WHERE _id =?";
var selectCreatedTrip = "SELECT * FROM hack_trip.trips WHERE title=? AND description=? AND price=? AND transport=? AND countPeoples=? AND typeOfPeople=? AND destination=? AND _ownerId=?";
var TripRepository = /** @class */ (function () {
    function TripRepository(pool) {
        this.pool = pool;
    }
    TripRepository.prototype.create = function (trip) {
        return __awaiter(this, void 0, void 0, function () {
            var imagesNew;
            var _this = this;
            return __generator(this, function (_a) {
                trip.timeCreated = new Date();
                trip.timeEdited = new Date();
                trip._id = (0, uuid_1.v4)();
                imagesNew = trip.imageFile.join();
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(createSql, [trip._id, trip.title, trip.description, trip.price, trip.transport, trip.countPeoples, trip.typeOfPeople, trip.destination, trip.coments, trip.likes, trip._ownerId, trip.lat, trip.lng, trip.timeCreated, trip.timeEdited, trip.reportTrip, imagesNew, trip.favorites], function (err, rows, fields) {
                            if (err) {
                                console.log(err.message);
                                reject(err);
                                return;
                            }
                            _this.pool.query(selectCreatedTrip, [trip.title, trip.description, trip.price, trip.transport, trip.countPeoples, trip.typeOfPeople, trip.destination, trip._ownerId], function (err, rows, fields) {
                                if (err) {
                                    console.log(err.message);
                                    reject(err);
                                    return;
                                }
                                resolve(rows[0]);
                            });
                        });
                    })];
            });
        });
    };
    TripRepository.prototype.getAll = function (search, typegroup, typetransport) {
        return __awaiter(this, void 0, void 0, function () {
            var searchInp, typeGroupSelect, typeTransportSelect;
            var _this = this;
            return __generator(this, function (_a) {
                searchInp = '%' + search + '%';
                typeGroupSelect = typegroup.length === 0 ? '%' : typegroup;
                typeTransportSelect = typetransport.length === 0 ? '%' : typetransport;
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query('SELECT * FROM hack_trip.trips WHERE trips.title LIKE ? AND trips.typeOfPeople LIKE ? AND trips.transport LIKE ?;', [searchInp, typeGroupSelect, typeTransportSelect], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            resolve(rows.map(function (row) { return (__assign(__assign({}, row), { likes: row.likes ? row.likes.split(/[,\s]+/) : [], reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [], imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [], favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [] })); }));
                        });
                    })];
            });
        });
    };
    TripRepository.prototype.getPagination = function (page, search, typegroup, typetransport) {
        return __awaiter(this, void 0, void 0, function () {
            var perPage, currentPage, searchInp, typeGroupSelect, typeTransportSelect;
            var _this = this;
            return __generator(this, function (_a) {
                page = page || 1;
                perPage = 9;
                currentPage = (page - 1) * perPage;
                searchInp = '%' + search + '%';
                typeGroupSelect = typegroup.length === 0 ? '%' : typegroup;
                typeTransportSelect = typetransport.length === 0 ? '%' : typetransport;
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query('SELECT * FROM hack_trip.trips WHERE trips.title LIKE ? AND trips.typeOfPeople LIKE ? AND trips.transport LIKE ? LIMIT ? OFFSET ?', [searchInp, typeGroupSelect, typeTransportSelect, perPage, currentPage], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            resolve(rows.map(function (row) { return (__assign(__assign({}, row), { likes: row.likes ? row.likes.split(/[,\s]+/) : [], reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [], imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [], favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [] })); }));
                        });
                    })];
            });
        });
    };
    TripRepository.prototype.getAllReports = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query('SELECT * FROM hack_trip.trips WHERE reportTrip IS NOT NULL', function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            resolve(rows.map(function (row) { return (__assign(__assign({}, row), { likes: row.likes ? row.likes.split(/[,\s]+/) : [], reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [], imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [], favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [] })); }));
                        });
                    })];
            });
        });
    };
    TripRepository.prototype.getTripById = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query('SELECT * FROM hack_trip.trips WHERE _id =?', [id], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (rows.length == 1) {
                                var trip = rows[0];
                                resolve(__assign(__assign({}, trip), { likes: trip.likes ? trip.likes.split(/[,\s]+/) : trip.likes !== null && trip.likes.length > 0 ? trip.likes.split('') : [], reportTrip: trip.reportTrip ? trip.reportTrip.split(/[,\s]+/) : trip.reportTrip !== null && trip.reportTrip.length > 0 ? trip.reportTrip.split('') : [], imageFile: trip.imageFile ? trip.imageFile.split(/[,\s]+/) : trip.imageFile !== null && trip.imageFile.length > 0 ? trip.imageFile.split('') : [], favorites: trip.favorites ? trip.favorites.split(/[,\s]+/) : trip.favorites !== null && trip.favorites.length > 0 ? trip.favorites.split('') : [] }));
                            }
                            else {
                                reject(new Error("Error finding new document in database"));
                            }
                        });
                    })];
            });
        });
    };
    TripRepository.prototype.deleteTrypById = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var tripDel;
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
                                tripDel = rows[0];
                                _this.pool.query(deleteOne, [id], function (err, rows, fields) {
                                    if (err) {
                                        console.log(err);
                                        reject(err);
                                        return;
                                    }
                                    if (!err) {
                                        resolve(tripDel);
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
    TripRepository.prototype.getAllMyTrips = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query('SELECT * FROM hack_trip.trips WHERE _ownerId =?', [id], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            resolve(rows.map(function (row) { return (__assign(__assign({}, row), { likes: row.likes ? row.likes.split(/[,\s]+/) : [], reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [], imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [], favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [] })); }));
                        });
                    })];
            });
        });
    };
    TripRepository.prototype.getAllMyFavorites = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                id = '%' + id + '%';
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query('SELECT * FROM hack_trip.trips WHERE trips.favorites LIKE ?', [id], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            resolve(rows.map(function (row) { return (__assign(__assign({}, row), { likes: row.likes ? row.likes.split(/[,\s]+/) : [], reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [], imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [], favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [] })); }));
                        });
                    })];
            });
        });
    };
    TripRepository.prototype.updateTripById = function (id, trip) {
        return __awaiter(this, void 0, void 0, function () {
            var editedImg;
            var _this = this;
            return __generator(this, function (_a) {
                trip.timeEdited = new Date();
                editedImg = trip.imageFile.join();
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(updateSql, [trip.title, trip.description, trip.price, trip.transport,
                            trip.countPeoples, trip.typeOfPeople, trip.destination, trip.lat, trip.lng, trip.timeEdited, editedImg, id], function (err, rows, fields) {
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
                                        resolve(__assign(__assign({}, rows[0]), { likes: rows[0].likes ? rows[0].likes.split(/[,\s]+/) : [], reportTrip: rows[0].reportTrip ? rows[0].reportTrip.split(/[,\s]+/) : [], imageFile: rows[0].imageFile ? rows[0].imageFile.split(/[,\s]+/) : [], favorites: rows[0].favorites ? rows[0].favorites.split(/[,\s]+/) : [] }));
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
    TripRepository.prototype.updateTripFavoritesByuserId = function (id, trip) {
        return __awaiter(this, void 0, void 0, function () {
            var favoritessNew;
            var _this = this;
            return __generator(this, function (_a) {
                favoritessNew = trip.favorites.join();
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(updateSqlFavorites, [favoritessNew, id], function (err, rows, fields) {
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
                                        resolve(__assign(__assign({}, rows[0]), { likes: rows[0].likes ? rows[0].likes.split(/[,\s]+/) : [], reportTrip: rows[0].reportTrip ? rows[0].reportTrip.split(/[,\s]+/) : [], imageFile: rows[0].imageFile ? rows[0].imageFile.split(/[,\s]+/) : [], favorites: rows[0].favorites ? rows[0].favorites.split(/[,\s]+/) : [] }));
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
    TripRepository.prototype.updateTripLikeByuserId = function (id, trip) {
        return __awaiter(this, void 0, void 0, function () {
            var likesNew;
            var _this = this;
            return __generator(this, function (_a) {
                likesNew = trip.likes.join();
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(updateSqlLikes, [likesNew, id], function (err, rows, fields) {
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
                                        resolve(__assign(__assign({}, rows[0]), { likes: rows[0].likes ? rows[0].likes.split(/[,\s]+/) : [], reportTrip: rows[0].reportTrip ? rows[0].reportTrip.split(/[,\s]+/) : [], imageFile: rows[0].imageFile ? rows[0].imageFile.split(/[,\s]+/) : [], favorites: rows[0].favorites ? rows[0].favorites.split(/[,\s]+/) : [] }));
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
    TripRepository.prototype.deleteReportTripByuserId = function (id, trip) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(updateSqlReports, [trip.reportTrip, id], function (err, rows, fields) {
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
                                        resolve(__assign(__assign({}, rows[0]), { likes: rows[0].likes ? rows[0].likes.split(/[,\s]+/) : [], reportTrip: rows[0].reportTrip ? rows[0].reportTrip.split(/[,\s]+/) : [], imageFile: rows[0].imageFile ? rows[0].imageFile.split(/[,\s]+/) : [], favorites: rows[0].favorites ? rows[0].favorites.split(/[,\s]+/) : [] }));
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
    TripRepository.prototype.reportTripByuserId = function (id, trip) {
        return __awaiter(this, void 0, void 0, function () {
            var reportsNew;
            var _this = this;
            return __generator(this, function (_a) {
                reportsNew = trip.reportTrip.join();
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(updateSqlReports, [reportsNew, id], function (err, rows, fields) {
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
                                        resolve(__assign(__assign({}, rows[0]), { likes: rows[0].likes ? rows[0].likes.split(/[,\s]+/) : [], reportTrip: rows[0].reportTrip ? rows[0].reportTrip.split(/[,\s]+/) : [], imageFile: rows[0].imageFile ? rows[0].imageFile.split(/[,\s]+/) : [], favorites: rows[0].favorites ? rows[0].favorites.split(/[,\s]+/) : [] }));
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
    TripRepository.prototype.editImagesByTripId = function (id, data) {
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
                                        var point = rows.map(function (row) { return (__assign(__assign({}, row), { likes: row.likes ? row.likes.split(/[,\s]+/) : [], reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [], imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [], favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [] })); });
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
    TripRepository.prototype.getTop = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query('SELECT * FROM hack_trip.trips', function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            resolve(rows.map(function (row) { return (__assign(__assign({}, row), { likes: row.likes ? row.likes.split(/[,\s]+/) : [], reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [], imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [], favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [] })); }));
                        });
                    })];
            });
        });
    };
    return TripRepository;
}());
exports.TripRepository = TripRepository;
//# sourceMappingURL=tripService.js.map