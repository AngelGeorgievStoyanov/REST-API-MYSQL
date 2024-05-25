import { Pool } from 'mysql';
import { IFailedLogs, User } from "../model/user";
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

const createFailedLog = `INSERT INTO hack_trip.failedlogs (
    _id, date, email,  ip, userAgent,  country_code,
    country_name, postal, city, latitude, longitude, state
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;



const loginSql = `UPDATE hack_trip.users SET lastTimeLogin =?, countOfLogs=? WHERE _id =?`;

const selectOne = `SELECT * FROM hack_trip.users WHERE _id =?`;

const updateUserSql = `UPDATE hack_trip.users SET firstName =?, lastName=?, timeEdited=?, imageFile=? WHERE _id =?`;
const updateUserPassSql = `UPDATE hack_trip.users SET firstName =?, lastName=?, timeEdited=?, imageFile=?, hashedPassword=? WHERE _id =?`;
const updateUserNewPassSql = `UPDATE hack_trip.users SET  hashedPassword=? WHERE _id =?`;
const updateUserAdminSql = `UPDATE hack_trip.users SET firstName =?, lastName=?, timeEdited=?, imageFile=?, role=?, status=? WHERE _id =?`;
const updateUserVerifyEmailSql = `UPDATE hack_trip.users SET verifyEmail =? WHERE _id =?`;
const deleteOne = `DELETE from hack_trip.users WHERE _id =?`;
const deleteFailedLogsArr = `DELETE from hack_trip.failedlogs WHERE _id IN(?)`;
const selectDeleteFailedLogs = `SELECT * FROM hack_trip.failedlogs WHERE _id IN(?) ORDER BY date desc`;
export class UserRepository implements IUserRepository<User> {
    constructor(protected pool: Pool) { }


    async findByEmail(email): Promise<User> {

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
        user.timeCreated = new Date().toISOString();
        user.timeEdited = new Date().toISOString();
        user.lastTimeLogin = new Date().toISOString();


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

    async logFailedLoginAttempt(date: string, email: string, ip: string, userAgent: string, country_code: string,
        country_name: string, postal: string, city: string, latitude: number, longitude: number, state: string): Promise<IFailedLogs> {
        let _id = uuid()
        return new Promise((resolve, reject) => {
            this.pool.query(createFailedLog,
                [_id, date, email, ip, userAgent, country_code,
                    country_name, postal, city, latitude, longitude, state],
                (err, rows, fields) => {
                    if (err) {

                        console.log(err);
                        reject(err);
                        return;
                    }

                    this.pool.query('SELECT * FROM hack_trip.failedlogs WHERE _id =?', [_id], (err, rows, fields) => {
                        if (err) {
                            console.log(err);
                            reject(err);
                            return;
                        }
                        if (rows.length == 1) {

                            const log = rows[0];

                            resolve({ ...log });
                        }
                    });


                });
        });

    }


    async logout(token: IdType) {
        tokenBlacklist.add(token);
    }


    async login(id: IdType, count: IdType): Promise<User> {
        let newLastTimeLogs = new Date().toISOString();
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



    async findById(id: IdType): Promise<User> {

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

        user.timeEdited = new Date().toISOString();
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

        user.timeEdited = new Date().toISOString();
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
            this.pool.query(updateUserVerifyEmailSql, [confirmation, id], (err, rows, fields) => {
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
        user.timeEdited = new Date().toISOString();
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


    async getAllFailedLogs(): Promise<IFailedLogs[]> {

        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.failedlogs ORDER BY date desc', (err, rows, fields) => {
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

    async newUserPassword(id: IdType, password: string): Promise<User> {

        const hashedPassword = await bcrypt.hash(password, 10);
        return new Promise((resolve, reject) => {
            this.pool.query(updateUserNewPassSql, [hashedPassword, id], (err, rows, fields) => {
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


    async deletUserById(id: IdType): Promise<User> {

        let userDel;

        return new Promise((resolve, reject) => {
            this.pool.query(selectOne, [id], (err, rows, fields) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }
                if (rows.length === 1) {

                    userDel = rows[0];

                    this.pool.query(deleteOne, [id], (err, rows, fields) => {
                        if (err) {
                            console.log(err);
                            reject(err);
                            return;
                        }
                        if (!err) {
                            resolve(userDel);

                        }

                    });
                } else {
                    reject(new Error(`Error finding new document in database`));
                }
            });
        });
    }


    async deletFailedLogsById(failedlogsArr: string[]): Promise<IFailedLogs[]> {

        let selectDeleteFailedLogsArr;
        return new Promise((resolve, reject) => {
            this.pool.query(selectDeleteFailedLogs, [failedlogsArr], (err, rows, fields) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }
                if (rows) {

                    selectDeleteFailedLogsArr = rows.map(row => ({ ...row }));
                    this.pool.query(deleteFailedLogsArr, [failedlogsArr], (err, rows, fields) => {
                        if (err) {
                            console.log(err);
                            reject(err);
                            return;
                        }
                        if (!err) {
                            resolve(selectDeleteFailedLogsArr);
                        }

                    });
                } else {
                    reject(new Error(`Error finding new document in database`));
                }
            });
        });
    }

}

