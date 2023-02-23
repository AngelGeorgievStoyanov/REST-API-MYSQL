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
exports.CommentTripRepository = void 0;
var uuid_1 = require("uuid");
var createSql = "INSERT INTO hack_trip.comments (\n    _id,\n    nameAuthor,\n    comment,\n    _tripId,\n    _ownerId,\n    reportComment\n  )\n  VALUES (?, ?, ?, ?, ?, ?);";
var updateSql = "UPDATE hack_trip.comments SET comment =? WHERE _id =?";
var selectOne = "SELECT * FROM hack_trip.comments WHERE _id =?";
var deleteOne = "DELETE from hack_trip.comments WHERE _id =?";
var deleteByOTripId = "DELETE from hack_trip.comments WHERE _tripId =?";
var selectByOwnerId = "SELECT * FROM hack_trip.comments WHERE _tripId =?";
var updateSqlReports = "UPDATE hack_trip.comments SET reportComment =? WHERE _id =?";
var CommentTripRepository = /** @class */ (function () {
    function CommentTripRepository(pool) {
        this.pool = pool;
    }
    CommentTripRepository.prototype.create = function (comment) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                comment._id = (0, uuid_1.v4)();
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(createSql, [comment._id, comment.nameAuthor, comment.comment, comment._tripId, comment._ownerId, comment.reportComment], function (err, rows, fields) {
                            if (err) {
                                console.log(err.message);
                                reject(err);
                                return;
                            }
                            resolve(comment);
                        });
                    })];
            });
        });
    };
    CommentTripRepository.prototype.getCommentById = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query('SELECT * FROM hack_trip.comments WHERE _id =?', [id], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (rows.length == 1) {
                                var comment = rows[0];
                                resolve(__assign(__assign({}, comment), { reportComment: comment.reportComment ? comment.reportComment.split(/[,\s]+/) : comment.reportComment !== null && comment.reportComment.length > 0 ? comment.reportComment.split('') : [] }));
                            }
                            else {
                                reject(new Error("Error finding new document in database"));
                            }
                        });
                    })];
            });
        });
    };
    CommentTripRepository.prototype.getCommentsByTripId = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query('SELECT * FROM hack_trip.comments WHERE _tripId =?', [id], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (rows) {
                                var comments = rows;
                                resolve(comments.map(function (comment) { return (__assign(__assign({}, comment), { reportComment: comment.reportComment ? comment.reportComment.split(/[,\s]+/) : comment.reportComment !== null && comment.reportComment.length > 0 ? comment.reportComment.split('') : [] })); }));
                            }
                            else {
                                reject(new Error("Error finding new document in database"));
                            }
                        });
                    })];
            });
        });
    };
    CommentTripRepository.prototype.updateCommentById = function (id, comment) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(updateSql, [comment.comment, id, id], function (err, rows, fields) {
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
                                        var comment_1 = rows[0];
                                        resolve(__assign(__assign({}, comment_1), { reportComment: comment_1.reportComment ? comment_1.reportComment.split(/[,\s]+/) : comment_1.reportComment !== null && comment_1.reportComment.length > 0 ? comment_1.reportComment.split('') : [] }));
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
    CommentTripRepository.prototype.deleteCommentById = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var commentDel;
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(selectOne, [id], function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (rows.length > 0) {
                                deleteOne;
                                commentDel = rows;
                                _this.pool.query(deleteOne, [id], function (err, rows, fields) {
                                    if (err) {
                                        console.log(err);
                                        reject(err);
                                        return;
                                    }
                                    if (!err) {
                                        resolve(commentDel);
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
    CommentTripRepository.prototype.deleteCommentByOwnerId = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var commentDel;
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
                                commentDel = rows;
                                _this.pool.query(deleteByOTripId, [id], function (err, rows, fields) {
                                    if (err) {
                                        console.log(err);
                                        reject(err);
                                        return;
                                    }
                                    if (!err) {
                                        resolve(commentDel);
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
    CommentTripRepository.prototype.reportCommentByuserId = function (id, comment) {
        return __awaiter(this, void 0, void 0, function () {
            var reportsNew;
            var _this = this;
            return __generator(this, function (_a) {
                reportsNew = comment.reportComment.join();
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
                                        resolve(__assign(__assign({}, rows[0]), { reportComment: rows[0].reportComment ? rows[0].reportComment.split(/[,\s]+/) : [] }));
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
    CommentTripRepository.prototype.getAllReports = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query('SELECT * FROM hack_trip.comments WHERE (reportComment IS NOT NULL AND reportComment NOT LIKE "")', function (err, rows, fields) {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            var comments = rows;
                            resolve(comments.map(function (comment) { return (__assign(__assign({}, comment), { reportComment: comment.reportComment ? comment.reportComment.split(/[,\s]+/) : comment.reportComment !== null && comment.reportComment.length > 0 ? comment.reportComment.split('') : [] })); }));
                        });
                    })];
            });
        });
    };
    CommentTripRepository.prototype.deleteReportCommentByuserId = function (id, trip) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.pool.query(updateSqlReports, [trip.reportComment, id], function (err, rows, fields) {
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
                                        var comment = rows[0];
                                        resolve(__assign(__assign({}, comment), { reportComment: comment.reportComment ? comment.reportComment.split(/[,\s]+/) : comment.reportComment !== null && comment.reportComment.length > 0 ? comment.reportComment.split('') : [] }));
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
    return CommentTripRepository;
}());
exports.CommentTripRepository = CommentTripRepository;
//# sourceMappingURL=commentService.js.map