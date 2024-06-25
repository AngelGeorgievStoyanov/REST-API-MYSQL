import { IVerifyTokenRepository } from "../interface/verifyToken-repository";
import { VerifyToken } from "../model/verifyToken";
import { Pool } from 'mysql';



const createSql = `INSERT INTO hack_trip.verify (
    verifyToken,
    userId    
  )
  VALUES ( ?, ?);`;

const forgotPasswordSql = `UPDATE hack_trip.verify SET verifyTokenForgotPassword =? WHERE userId =?`;

const updateDateVerifyToken = `UPDATE hack_trip.verify SET timeVerifyToken =? WHERE userId =? AND verifyToken =?`;
const updateVerifyTokenForgotPassword  = `UPDATE hack_trip.verify SET timeVerifyTokenForgotPassword =?, countForgotPassword = countForgotPassword + 1 WHERE userId =? AND verifyTokenForgotPassword =?`;

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

    async findByIdAndVerifyTokenForgotPassword(userId:string, token: string): Promise<VerifyToken> {
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


    async findByUserId(userId: string): Promise<VerifyToken> {
        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.verify WHERE (userId like ? );', [userId],
                (err, rows, fields) => {
                   
                    if (err) {

                        console.log(err);
                        reject(err);
                        return;
                    } else if (rows.length === 1) {

                        resolve({ ...rows[0] });
                    } else {
                        resolve(rows);
                    }

                });
        });

    }

    async updateVerifyToken(userId: string, verifyToken:string): Promise<VerifyToken> {
       const timeVerifyToken = new Date().toISOString()
        return new Promise((resolve, reject) => {
            this.pool.query(updateDateVerifyToken, [timeVerifyToken,userId, verifyToken],
                (err, rows, fields) => {
                    if (err) {

                        console.log(err);
                        reject(err);
                        return;
                    } else if (rows.length === 1) {

                        resolve({ ...rows[0] });
                    } else {
                        resolve(rows);
                    }

                });
        });
    }

    async updateVerifyTokenForgotPassword(userId: string, verifyToken:string): Promise<VerifyToken> {
        const timeVerifyTokenForgotPassword = new Date().toISOString()
         return new Promise((resolve, reject) => {
             this.pool.query(updateVerifyTokenForgotPassword, [timeVerifyTokenForgotPassword, userId, verifyToken],
                 (err, rows, fields) => {
                     if (err) {
 
                         console.log(err);
                         reject(err);
                         return;
                     } else if (rows.length === 1) {
 
                         resolve({ ...rows[0] });
                     } else {
                         resolve(rows);
                     }
 
                 });
         });
     }
}