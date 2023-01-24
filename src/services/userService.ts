import { NextFunction, Request, Response } from "express";
import { Pool } from 'mysql';
import { resolve } from "path";

import { User } from "../model/user";
import * as bcrypt from 'bcrypt'
import { IdType, IUserRepository } from "../interface/user-repository";

const tokenBlacklist = new Set();


const createSql = `INSERT INTO hack_trip.users (
    email,
    firstName,
    lastName,
    hashedPassword,
    timeCreated,
    timeEdited,
    lastTimeLogin,
    countOfLogs
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?);`;



const loginSql = `UPDATE hack_trip.users SET lastTimeLogin =?, countOfLogs=? WHERE _id =?`;

const selectOne = `SELECT * FROM hack_trip.users WHERE _id =?`;


export class UserRepository implements IUserRepository<User> {
    constructor(protected pool: Pool) { }


    async findByEmail(email,): Promise<User> {

        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.users WHERE email =?', [email], (err, rows, fields) => {
                if (err) {
                    console.log(err)
                    reject(err);
                    return;
                }
                if (rows.length == 1) {

                    const user = rows[0];

                    resolve({ ...user });
                } else {

                    resolve(email)
                }
            })
        })



    }



    async create(user): Promise<User> {
        let pass = user.password
        user.timeCreated = new Date()
        user.timeEdited = new Date()
        user.lastTimeLogin = new Date()


        user.hashedPassword = await bcrypt.hash(pass, 10)

        return new Promise((resolve, reject) => {
            this.pool.query(createSql,
                [user.email, user.firstName, user.lastName, user.hashedPassword,
                user.timeCreated, user.timeEdited, user.lastTimeLogin, user.countOfLogs],
                (err, rows, fields) => {
                    if (err) {

                        console.log(err)
                        reject(err);
                        return;
                    }

                    this.pool.query('SELECT * FROM hack_trip.users WHERE email =?', [user.email], (err, rows, fields) => {
                        if (err) {
                            console.log(err)
                            reject(err);
                            return;
                        }
                        if (rows.length == 1) {

                            const user = rows[0];

                            resolve({ ...user });
                        }
                    })


                });
        });


    }


    async logout(token: IdType) {
        tokenBlacklist.add(token);
    }


    async login(id: IdType, count: IdType): Promise<User> {
        let newLastTimeLogs = new Date()
        let newCount = Number(count) + 1
        return new Promise((resolve, reject) => {
            this.pool.query(loginSql, [newLastTimeLogs, newCount, id], (err, rows, fields) => {
                if (err) {

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
                            const point = rows[0];
                            resolve(point);

                        }

                    })

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            })
        })
    }

}

