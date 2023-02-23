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
exports.UserRepository = void 0;
var bcrypt = require("bcrypt");
var uuid_1 = require("uuid");
var tokenBlacklist = new Set();
var createSql = "INSERT INTO hack_trip.users (\n    _id,\n    email,\n    firstName,\n    lastName,\n    hashedPassword,\n    timeCreated,\n    timeEdited,\n    lastTimeLogin,\n    countOfLogs\n  )\n  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);";
var loginSql = "UPDATE hack_trip.users SET lastTimeLogin =?, countOfLogs=? WHERE _id =?";
var selectOne = "SELECT * FROM hack_trip.users WHERE _id =?";
var updateUserSql = "UPDATE hack_trip.users SET firstName =?, lastName=?, timeEdited=?, imageFile=? WHERE _id =?";
var updateUserPassSql = "UPDATE hack_trip.users SET firstName =?, lastName=?, timeEdited=?, imageFile=?, hashedPassword=? WHERE _id =?";
var updateUserAdminSql = "UPDATE hack_trip.users SET firstName =?, lastName=?, timeEdited=?, imageFile=?, role=?, status=? WHERE _id =?";
var UserRepository = /** @class */ (function () {
    function UserRepository(pool) {
        this.pool = pool;
    }
    UserRepository.prototype.findByEmail = function (email) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query('SELECT * FROM hack_trip.users WHERE email =?', [email], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (rows.length == 1) {
                                var user = rows[0];
                                resolve(__assign({}, user));
                            }
                            else {
                                resolve(email);
                            }
                        });
                    })];
            });
        });
    };
    UserRepository.prototype.create = function (user) {
        return __awaiter(this, void 0, void 0, function () {
            var pass, _a;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        pass = user.password;
                        user.timeCreated = new Date();
                        user.timeEdited = new Date();
                        user.lastTimeLogin = new Date();
                        _a = user;
                        return [4 /*yield*/, bcrypt.hash(pass, 10)];
                    case 1:
                        _a.hashedPassword = _b.sent();
                        user._id = (0, uuid_1.v4)();
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                _this.pool.query(createSql, [user._id, user.email, user.firstName, user.lastName, user.hashedPassword,
                                    user.timeCreated, user.timeEdited, user.lastTimeLogin, user.countOfLogs], function (err, rows, fields) {
                                    if (err) {
                                        console.log(err);
                                        reject(err);
                                        return;
                                    }
                                    _this.pool.query('SELECT * FROM hack_trip.users WHERE email =?', [user.email], function (err, rows, fields) {
                                        if (err) {
                                            console.log(err);
                                            reject(err);
                                            return;
                                        }
                                        if (rows.length == 1) {
                                            var user_1 = rows[0];
                                            resolve(__assign({}, user_1));
                                        }
                                    });
                                });
                            })];
                }
            });
        });
    };
    UserRepository.prototype.logout = function (token) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                tokenBlacklist.add(token);
                return [2 /*return*/];
            });
        });
    };
    UserRepository.prototype.login = function (id, count) {
        return __awaiter(this, void 0, void 0, function () {
            var newLastTimeLogs, newCount;
            var _this = this;
            return __generator(this, function (_a) {
                newLastTimeLogs = new Date();
                newCount = Number(count) + 1;
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(loginSql, [newLastTimeLogs, newCount, id], function (err, rows, fields) {
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
    UserRepository.prototype.findById = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query('SELECT * FROM hack_trip.users WHERE _id =?', [id], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (rows.length == 1) {
                                var user = rows[0];
                                resolve(__assign({}, user));
                            }
                            else {
                                resolve(id);
                            }
                        });
                    })];
            });
        });
    };
    UserRepository.prototype.updateUserAdmin = function (id, user) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                user.timeEdited = new Date();
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(updateUserAdminSql, [user.firstName, user.lastName, user.timeEdited, user.imageFile, user.role, user.status, id], function (err, rows, fields) {
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
                                        var user_2 = rows[0];
                                        resolve(user_2);
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
    UserRepository.prototype.updateUser = function (id, user) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                user.timeEdited = new Date();
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(updateUserSql, [user.firstName, user.lastName, user.timeEdited, user.imageFile, id], function (err, rows, fields) {
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
                                        var user_3 = rows[0];
                                        resolve(user_3);
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
    UserRepository.prototype.updateUserPass = function (id, user) {
        return __awaiter(this, void 0, void 0, function () {
            var pass, _a;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        pass = user.password;
                        user.timeEdited = new Date();
                        _a = user;
                        return [4 /*yield*/, bcrypt.hash(pass, 10)];
                    case 1:
                        _a.hashedPassword = _b.sent();
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                _this.pool.query(updateUserPassSql, [user.firstName, user.lastName, user.timeEdited, user.imageFile, user.hashedPassword, id], function (err, rows, fields) {
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
                                                var user_4 = rows[0];
                                                resolve(user_4);
                                            }
                                        });
                                    }
                                    else {
                                        reject(new Error("Error finding new document in database"));
                                    }
                                });
                            })];
                }
            });
        });
    };
    UserRepository.prototype.editProfileImage = function (id, entity) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query('UPDATE hack_trip.users SET imageFile = null WHERE imageFile=? AND _id =?', [entity, id], function (err, rows, fields) {
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
                                        var user = rows[0];
                                        resolve(user);
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
    UserRepository.prototype.getAll = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query('SELECT * FROM hack_trip.users', function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            resolve(rows);
                        });
                    })];
            });
        });
    };
    UserRepository.prototype.confirmRole = function (id, role) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query('SELECT * FROM hack_trip.users WHERE _id =? AND role=?', [id, role], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (rows.length == 1) {
                                resolve(true);
                            }
                            else {
                                resolve(false);
                            }
                        });
                    })];
            });
        });
    };
    return UserRepository;
}());
exports.UserRepository = UserRepository;
//# sourceMappingURL=userService.js.map