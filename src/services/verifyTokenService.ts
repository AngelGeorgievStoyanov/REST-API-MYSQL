import { IdType } from "../interface/user-repository";
import { IVerifyTokenRepository } from "../interface/verifyToken-repository";
import { VerifyToken } from "../model/verifyToken";
import { Pool } from 'mysql';



const createSql = `INSERT INTO hack_trip.verify (
    verifyToken,
    userId    
  )
  VALUES ( ?, ?);`;

const forgotPasswordSql = `UPDATE hack_trip.verify SET verifyTokenForgotPassword =? WHERE userId =?`;



export class VerifyTokenRepository implements IVerifyTokenRepository<VerifyToken> {
    constructor(protected pool: Pool) { }


    async create(token: string, userId: string): Promise<VerifyToken> {


        return new Promise((resolve, reject) => {
            this.pool.query(createSql,
                [token, userId],
                (err, rows, fields) => {
                    if (err) {

                        console.log(err);
                        reject(err);
                        return;
                    }

                    this.pool.query('SELECT * FROM hack_trip.verify WHERE userId =?', [userId], (err, rows, fields) => {
                        if (err) {
                            console.log(err);
                            reject(err);
                            return;
                        }
                        if (rows.length == 1) {

                            const createdToken = rows[0];

                            resolve({ ...createdToken });
                        }
                    });


                });
        });


    }


    async findById(userId: string, token: string): Promise<VerifyToken> {
        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.verify WHERE (userId like ? AND verifyToken like ?);', [userId, token],
                (err, rows, fields) => {
                    if (err) {

                        console.log(err);
                        reject(err);
                        return;
                    } else if (rows.length === 1) {

                        resolve({ ...rows[0] });
                    } else if (rows.length === 0) {
                        reject(new Error(`Error finding new document in database`));
                    }

                });
        });

    }

    async forgotPassword(token: string, userId: string): Promise<VerifyToken> {


        return new Promise((resolve, reject) => {
            this.pool.query(forgotPasswordSql,
                [token, userId],
                (err, rows, fields) => {
                    if (err) {

                        console.log(err);
                        reject(err);
                        return;
                    }

                    this.pool.query('SELECT * FROM hack_trip.verify WHERE userId =?', [userId], (err, rows, fields) => {
                        if (err) {
                            console.log(err);
                            reject(err);
                            return;
                        }
                        if (rows.length == 1) {

                            const createdToken = rows[0];

                            resolve({ ...createdToken });
                        }
                    });


                });
        });


    }

    async findByIdAndVerifyTokenForgotPassword(userId,token:string):Promise<VerifyToken>{
        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.verify WHERE (userId like ? AND verifyTokenForgotPassword like ?);', [userId, token],
                (err, rows, fields) => {
                    if (err) {

                        console.log(err);
                        reject(err);
                        return;
                    } else if (rows.length === 1) {

                        resolve({ ...rows[0] });
                    } else if (rows.length === 0) {
                        reject(new Error(`Error finding new document in database`));
                    }

                });
        });
    }
}