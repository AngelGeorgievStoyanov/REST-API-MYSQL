import { Pool } from "mysql";
import { ICommentTripRepository } from "../interface/comment-repository";
import { IdType } from "../interface/user-repository";
import { Comment } from "../model/comment";
import { v4 as uuid } from 'uuid';



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

const deleteOne = `DELETE from hack_trip.comments WHERE _id =?`

const deleteByOTripId = `DELETE from hack_trip.comments WHERE _tripId =?`;

const selectByOwnerId = `SELECT * FROM hack_trip.comments WHERE _tripId =?`;

const updateSqlReports = `UPDATE hack_trip.comments SET reportComment =? WHERE _id =?`;


export class CommentTripRepository implements ICommentTripRepository<Comment> {
    constructor(protected pool: Pool) { }


    async create(comment: Comment): Promise<Comment> {
        comment._id = uuid()
        return new Promise((resolve, reject) => {
            this.pool.query(createSql,
                [comment._id, comment.nameAuthor, comment.comment, comment._tripId, comment._ownerId, comment.reportComment],
                (err, rows, fields) => {
                    if (err) {

                        console.log(err.message);
                        reject(err);
                        return;
                    }

                    resolve(comment);
                });
        });


    }



    async getCommentById(id: IdType): Promise<Comment> {

        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.comments WHERE _id =?', [id], (err, rows, fields) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }
                if (rows.length == 1) {

                    const comment = rows[0];
                    resolve({
                        ...comment,
                        reportComment: comment.reportComment ? comment.reportComment.split(/[,\s]+/) : comment.reportComment !== null && comment.reportComment.length > 0 ? comment.reportComment.split('') : [],
                    });


                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            })
        })
    }


    async getCommentsByTripId(id: IdType): Promise<Comment[]> {

        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.comments WHERE _tripId =?', [id], (err, rows, fields) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }
                if (rows) {

                    const comments = rows;
                    resolve(comments.map(comment => ({
                        ...comment,
                        reportComment: comment.reportComment ? comment.reportComment.split(/[,\s]+/) : comment.reportComment !== null && comment.reportComment.length > 0 ? comment.reportComment.split('') : []
                    })));


                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            })
        })
    }


    async updateCommentById(id: IdType, comment: Comment): Promise<Comment> {

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
                            console.log(err)
                            reject(err);
                            return;
                        }
                        if (rows) {
                            const comment = rows[0];
                            resolve({
                                ...comment,
                                reportComment: comment.reportComment ? comment.reportComment.split(/[,\s]+/) : comment.reportComment !== null && comment.reportComment.length > 0 ? comment.reportComment.split('') : [],
                            });

                        }

                    });

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            })
        })
    }


    async deleteCommentById(id: IdType): Promise<Comment> {

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
                            console.log(err)
                            reject(err);
                            return;
                        }
                        if (!err) {
                            resolve(commentDel);

                        }

                    });


                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            })
        })
    }


    async deleteCommentByOwnerId(id: IdType): Promise<Comment> {

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
                } else {
                    return;
                }
            });
        });
    }


    async reportCommentByuserId(id: IdType, comment: Comment): Promise<Comment> {

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
                            resolve({
                                ...rows[0],
                                reportComment: rows[0].reportComment ? rows[0].reportComment.split(/[,\s]+/) : [],

                            });

                        }

                    })

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            });
        });
    }


    async getAllReports(): Promise<Comment[]> {
        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.comments WHERE (reportComment IS NOT NULL AND reportComment NOT LIKE "")', (err, rows, fields) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }


                const comments = rows;
                resolve(comments.map(comment => ({
                    ...comment,
                    reportComment: comment.reportComment ? comment.reportComment.split(/[,\s]+/) : comment.reportComment !== null && comment.reportComment.length > 0 ? comment.reportComment.split('') : []
                })));
            });
        });
    }

    async deleteReportCommentByuserId(id: IdType, trip: Comment): Promise<Comment> {

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
                            resolve({
                                ...comment,
                                reportComment: comment.reportComment ? comment.reportComment.split(/[,\s]+/) : comment.reportComment !== null && comment.reportComment.length > 0 ? comment.reportComment.split('') : [],
                            });

                        }

                    });

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            });
        });
    }

}