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
    hashedPassword
  )
  VALUES (?, ?, ?, ?);`;






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


        user.hashedPassword = await bcrypt.hash(pass, 10)

        return new Promise((resolve, reject) => {
            this.pool.query(createSql,
                [user.email, user.firstName, user.lastName, user.hashedPassword],
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

}

