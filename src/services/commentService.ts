import { Pool } from "mysql";
import { ICommentTripRepository } from "../interface/comment-repository";
import { IdType } from "../interface/user-repository";
import { Comment } from "../model/comment";



const createSql = `INSERT INTO hack_trip.comments (
    nameAuthor,
    comment,
    _tripId,
    _ownerId
  )
  VALUES (?, ?, ?, ?);`;


const updateSql = `UPDATE hack_trip.comments SET comment =? WHERE _id =?`;

const selectOne = `SELECT * FROM hack_trip.comments WHERE _id =?`;

const deleteOne = `DELETE from hack_trip.comments WHERE _id =?`

const deleteByOTripId =`DELETE from hack_trip.comments WHERE (_tripId =? AND _id>0)`

const selectByOwnerId = `SELECT * FROM hack_trip.comments WHERE _tripId =?`;

export class CommentTripRepository implements ICommentTripRepository<Comment> {
    constructor(protected pool: Pool) { }


    async create(comment: Comment): Promise<Comment> {



        return new Promise((resolve, reject) => {
            this.pool.query(createSql,
                [comment.nameAuthor, comment.comment, comment._tripId, comment._ownerId],
                (err, rows, fields) => {
                    if (err) {

                        console.log(err.message)
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
                    console.log(err)
                    reject(err);
                    return;
                }
                if (rows.length == 1) {

                    const comment = rows[0];
                    resolve(comment);


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
                    console.log(err)
                    reject(err);
                    return;
                }
                if (rows) {

                    const comments = rows;
                    resolve(comments);


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
                    console.log(err)
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
                            resolve(comment);

                        }

                    })

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
                    console.log(err)
                    reject(err);
                    return;
                }
                if (rows.length > 0) {
                    deleteOne
                    commentDel = rows;
                    console.log(commentDel)
                    this.pool.query(deleteOne, [id], (err, rows, fields) => {
                        if (err) {
                            console.log(err)
                            reject(err);
                            return;
                        }
                        if (!err) {
                            resolve(commentDel);

                        }

                    })


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
                    console.log(err)
                    reject(err);
                    return;
                }
                if (rows.length > 0) {
                    deleteOne
                    commentDel = rows;
                    console.log(commentDel)
                    this.pool.query(deleteByOTripId, [id], (err, rows, fields) => {
                        if (err) {
                            console.log(err)
                            reject(err);
                            return;
                        }
                        if (!err) {
                            resolve(commentDel);

                        }

                    })


                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            })
        })
    }

}