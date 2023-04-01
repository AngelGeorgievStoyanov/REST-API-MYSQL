import { Pool } from 'mysql';
import { User } from "../model/user";
import * as bcrypt from 'bcrypt';
import { IdType, IUserRepository } from "../interface/user-repository";
import { v4 as uuid } from 'uuid';
const tokenBlacklist = new Set();


const createSql = `INSERT INTO hack_trip.users (
    _id,
    email,
    firstName,
    lastName,
    hashedPassword,
    timeCreated,
    timeEdited,
    lastTimeLogin,
    countOfLogs
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`;



const loginSql = `UPDATE hack_trip.users SET lastTimeLogin =?, countOfLogs=? WHERE _id =?`;

const selectOne = `SELECT * FROM hack_trip.users WHERE _id =?`;

const updateUserSql = `UPDATE hack_trip.users SET firstName =?, lastName=?, timeEdited=?, imageFile=? WHERE _id =?`;
const updateUserPassSql = `UPDATE hack_trip.users SET firstName =?, lastName=?, timeEdited=?, imageFile=?, hashedPassword=? WHERE _id =?`;
const updateUserNewPassSql = `UPDATE hack_trip.users SET  hashedPassword=? WHERE _id =?`;
const updateUserAdminSql = `UPDATE hack_trip.users SET firstName =?, lastName=?, timeEdited=?, imageFile=?, role=?, status=? WHERE _id =?`;
const updateUserVerifyEmailSql = `UPDATE hack_trip.users SET verifyEmail =? WHERE _id =?`;

export class UserRepository implements IUserRepository<User> {
    constructor(protected pool: Pool) { }


    async findByEmail(email,): Promise<User> {

        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.users WHERE email =?', [email], (err, rows, fields) => {
             
             
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }
                if (rows.length == 1) {

                    const user = rows[0];

                    resolve({ ...user });
                } else {

                    resolve(email)
                }
            });
        });

    }



    async create(user): Promise<User> {
        let pass = user.password;
        user.timeCreated = new Date();
        user.timeEdited = new Date();
        user.lastTimeLogin = new Date();


        user.hashedPassword = await bcrypt.hash(pass, 10);
        user._id = uuid()
        return new Promise((resolve, reject) => {
            this.pool.query(createSql,
                [user._id, user.email, user.firstName, user.lastName, user.hashedPassword,
                user.timeCreated, user.timeEdited, user.lastTimeLogin, user.countOfLogs],
                (err, rows, fields) => {
                    if (err) {

                        console.log(err);
                        reject(err);
                        return;
                    }

                    this.pool.query('SELECT * FROM hack_trip.users WHERE email =?', [user.email], (err, rows, fields) => {
                        if (err) {
                            console.log(err);
                            reject(err);
                            return;
                        }
                        if (rows.length == 1) {

                            const user = rows[0];

                            resolve({ ...user });
                        }
                    });


                });
        });


    }


    async logout(token: IdType) {
        tokenBlacklist.add(token);
    }


    async login(id: IdType, count: IdType): Promise<User> {
        let newLastTimeLogs = new Date();
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
                            console.log(err);
                            reject(err);
                            return;
                        }
                        if (rows) {
                            const user = rows[0];
                            resolve(user);

                        }

                    });

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            });
        });
    }



    async findById(id): Promise<User> {
     
        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.users WHERE _id =?', [id], (err, rows, fields) => {
           
               
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }
                if (rows.length == 1) {

                    const user = rows[0];
                    resolve({ ...user });
                } else {
                    reject(new Error(`Error finding new document in database`));
                }
            });
        });

    }



    async updateUserAdmin(id: IdType, user: User): Promise<User> {

        user.timeEdited = new Date();
        return new Promise((resolve, reject) => {
            this.pool.query(updateUserAdminSql, [user.firstName, user.lastName, user.timeEdited, user.imageFile, user.role, user.status, id], (err, rows, fields) => {
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
                            const user = rows[0];

                            resolve(user);

                        }

                    });

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            });
        });

    }



    async updateUser(id: IdType, user: User): Promise<User> {

        user.timeEdited = new Date();
        return new Promise((resolve, reject) => {
            this.pool.query(updateUserSql, [user.firstName, user.lastName, user.timeEdited, user.imageFile, id], (err, rows, fields) => {
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
                            const user = rows[0];

                            resolve(user);

                        }

                    });

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            });
        });

    }

    
    async updateUserverifyEmail(id: IdType, confirmation: boolean): Promise<User> {

        return new Promise((resolve, reject) => {
            this.pool.query(updateUserVerifyEmailSql, [ confirmation,id], (err, rows, fields) => {
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
                            const user = rows[0];

                            resolve(user);

                        }

                    });

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            });
        });

    }
    async updateUserPass(id: IdType, user): Promise<User> {


        let pass = user.password;
        user.timeEdited = new Date();
        user.hashedPassword = await bcrypt.hash(pass, 10);


        return new Promise((resolve, reject) => {
            this.pool.query(updateUserPassSql, [user.firstName, user.lastName, user.timeEdited, user.imageFile, user.hashedPassword, id], (err, rows, fields) => {
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
                            const user = rows[0];
                            resolve(user);

                        }

                    });

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            });
        });
    }


    async editProfileImage(id: IdType, entity: string): Promise<User> {
        return new Promise((resolve, reject) => {
            this.pool.query('UPDATE hack_trip.users SET imageFile = null WHERE imageFile=? AND _id =?', [entity, id], (err, rows, fields) => {
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
                            const user = rows[0];
                            resolve(user);

                        }

                    });

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            });
        });
    }



    async getAll(): Promise<User[]> {

        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.users', (err, rows, fields) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }

                resolve(rows);
            });
        });
    }


    async confirmRole(id: IdType, role: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.users WHERE _id =? AND role=?', [id, role], (err, rows, fields) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }
                if (rows.length == 1) {

                    resolve(true);
                } else {

                    resolve(false)
                }
            });
        });

    }


    async confirmUserId(id: IdType): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.users WHERE _id =?', [id], (err, rows, fields) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }
                if (rows.length == 1) {

                    resolve(true);
                } else {

                    resolve(false)
                }
            });
        });

    }

    async newUserPassword(id:IdType,password:string):Promise<User>{

        const hashedPassword = await bcrypt.hash(password, 10);
        return new Promise((resolve, reject) => {
            this.pool.query(updateUserNewPassSql, [  hashedPassword, id], (err, rows, fields) => {
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
                            const user = rows[0];

                            resolve(user);

                        }

                    });

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            });
        });

    }

}

