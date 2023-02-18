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
exports.CommentTripRepository = void 0;
const uuid_1 = require("uuid");
const createSql = `INSERT INTO hack_trip.comments (
    _id,
    nameAuthor,
    comment,
    _tripId,
    _ownerId,
    reportComment
  )
  VALUES (?, ?, ?, ?, ?, ?);`;
const updateSql = `UPDATE hack_trip.comments SET comment =? WHERE _id =?`;
const selectOne = `SELECT * FROM hack_trip.comments WHERE _id =?`;
const deleteOne = `DELETE from hack_trip.comments WHERE _id =?`;
const deleteByOTripId = `DELETE from hack_trip.comments WHERE _tripId =?`;
const selectByOwnerId = `SELECT * FROM hack_trip.comments WHERE _tripId =?`;
const updateSqlReports = `UPDATE hack_trip.comments SET reportComment =? WHERE _id =?`;
class CommentTripRepository {
    constructor(pool) {
        this.pool = pool;
    }
    create(comment) {
        return __awaiter(this, void 0, void 0, function* () {
            comment._id = (0, uuid_1.v4)();
            return new Promise((resolve, reject) => {
                this.pool.query(createSql, [comment._id, comment.nameAuthor, comment.comment, comment._tripId, comment._ownerId, comment.reportComment], (err, rows, fields) => {
                    if (err) {
                        console.log(err.message);
                        reject(err);
                        return;
                    }
                    resolve(comment);
                });
            });
        });
    }
    getCommentById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.pool.query('SELECT * FROM hack_trip.comments WHERE _id =?', [id], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    if (rows.length == 1) {
                        const comment = rows[0];
                        resolve(Object.assign(Object.assign({}, comment), { reportComment: comment.reportComment ? comment.reportComment.split(/[,\s]+/) : comment.reportComment !== null && comment.reportComment.length > 0 ? comment.reportComment.split('') : [] }));
                    }
                    else {
                        reject(new Error(`Error finding new document in database`));
                    }
                });
            });
        });
    }
    getCommentsByTripId(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.pool.query('SELECT * FROM hack_trip.comments WHERE _tripId =?', [id], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    if (rows) {
                        const comments = rows;
                        resolve(comments.map(comment => (Object.assign(Object.assign({}, comment), { reportComment: comment.reportComment ? comment.reportComment.split(/[,\s]+/) : comment.reportComment !== null && comment.reportComment.length > 0 ? comment.reportComment.split('') : [] }))));
                    }
                    else {
                        reject(new Error(`Error finding new document in database`));
                    }
                });
            });
        });
    }
    updateCommentById(id, comment) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.pool.query(updateSql, [comment.comment, id, id], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    if (!err) {
                        this.pool.query(selectOne, [id], (err, rows, fields) => {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (rows) {
                                const comment = rows[0];
                                resolve(Object.assign(Object.assign({}, comment), { reportComment: comment.reportComment ? comment.reportComment.split(/[,\s]+/) : comment.reportComment !== null && comment.reportComment.length > 0 ? comment.reportComment.split('') : [] }));
                            }
                        });
                    }
                    else {
                        reject(new Error(`Error finding new document in database`));
                    }
                });
            });
        });
    }
    deleteCommentById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            let commentDel;
            return new Promise((resolve, reject) => {
                this.pool.query(selectOne, [id], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    if (rows.length > 0) {
                        deleteOne;
                        commentDel = rows;
                        this.pool.query(deleteOne, [id], (err, rows, fields) => {
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
                        reject(new Error(`Error finding new document in database`));
                    }
                });
            });
        });
    }
    deleteCommentByOwnerId(id) {
        return __awaiter(this, void 0, void 0, function* () {
            let commentDel;
            return new Promise((resolve, reject) => {
                this.pool.query(selectByOwnerId, [id], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    if (rows.length > 0) {
                        commentDel = rows;
                        this.pool.query(deleteByOTripId, [id], (err, rows, fields) => {
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
            });
        });
    }
    reportCommentByuserId(id, comment) {
        return __awaiter(this, void 0, void 0, function* () {
            let reportsNew = comment.reportComment.join();
            return new Promise((resolve, reject) => {
                this.pool.query(updateSqlReports, [reportsNew, id], (err, rows, fields) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    if (!err) {
                        this.pool.query(selectOne, [id], (err, rows, fields) => {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (rows) {
                                resolve(Object.assign(Object.assign({}, rows[0]), { reportComment: rows[0].reportComment ? rows[0].reportComment.split(/[,\s]+/) : [] }));
                            }
                        });
                    }
                    else {
                        reject(new Error(`Error finding new document in database`));
                    }
                });
            });
        });
    }
    getAllReports() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.pool.query('SELECT * FROM hack_trip.comments WHERE (reportComment IS NOT NULL AND reportComment NOT LIKE "")', (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    const comments = rows;
                    resolve(comments.map(comment => (Object.assign(Object.assign({}, comment), { reportComment: comment.reportComment ? comment.reportComment.split(/[,\s]+/) : comment.reportComment !== null && comment.reportComment.length > 0 ? comment.reportComment.split('') : [] }))));
                });
            });
        });
    }
    deleteReportCommentByuserId(id, trip) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.pool.query(updateSqlReports, [trip.reportComment, id], (err, rows, fields) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    if (!err) {
                        this.pool.query(selectOne, [id], (err, rows, fields) => {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (rows) {
                                const comment = rows[0];
                                resolve(Object.assign(Object.assign({}, comment), { reportComment: comment.reportComment ? comment.reportComment.split(/[,\s]+/) : comment.reportComment !== null && comment.reportComment.length > 0 ? comment.reportComment.split('') : [] }));
                            }
                        });
                    }
                    else {
                        reject(new Error(`Error finding new document in database`));
                    }
                });
            });
        });
    }
}
exports.CommentTripRepository = CommentTripRepository;
//# sourceMappingURL=commentService.js.map