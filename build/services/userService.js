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
exports.UserRepository = void 0;
const bcrypt = require("bcrypt");
const uuid_1 = require("uuid");
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
const updateUserAdminSql = `UPDATE hack_trip.users SET firstName =?, lastName=?, timeEdited=?, imageFile=?, role=?, status=? WHERE _id =?`;
class UserRepository {
    constructor(pool) {
        this.pool = pool;
    }
    findByEmail(email) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.pool.query('SELECT * FROM hack_trip.users WHERE email =?', [email], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    if (rows.length == 1) {
                        const user = rows[0];
                        resolve(Object.assign({}, user));
                    }
                    else {
                        resolve(email);
                    }
                });
            });
        });
    }
    create(user) {
        return __awaiter(this, void 0, void 0, function* () {
            let pass = user.password;
            user.timeCreated = new Date();
            user.timeEdited = new Date();
            user.lastTimeLogin = new Date();
            user.hashedPassword = yield bcrypt.hash(pass, 10);
            user._id = (0, uuid_1.v4)();
            return new Promise((resolve, reject) => {
                this.pool.query(createSql, [user._id, user.email, user.firstName, user.lastName, user.hashedPassword,
                    user.timeCreated, user.timeEdited, user.lastTimeLogin, user.countOfLogs], (err, rows, fields) => {
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
                            resolve(Object.assign({}, user));
                        }
                    });
                });
            });
        });
    }
    logout(token) {
        return __awaiter(this, void 0, void 0, function* () {
            tokenBlacklist.add(token);
        });
    }
    login(id, count) {
        return __awaiter(this, void 0, void 0, function* () {
            let newLastTimeLogs = new Date();
            let newCount = Number(count) + 1;
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
                                const point = rows[0];
                                resolve(point);
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
    findById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.pool.query('SELECT * FROM hack_trip.users WHERE _id =?', [id], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    if (rows.length == 1) {
                        const user = rows[0];
                        resolve(Object.assign({}, user));
                    }
                    else {
                        resolve(id);
                    }
                });
            });
        });
    }
    updateUserAdmin(id, user) {
        return __awaiter(this, void 0, void 0, function* () {
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
                    }
                    else {
                        reject(new Error(`Error finding new document in database`));
                    }
                });
            });
        });
    }
    updateUser(id, user) {
        return __awaiter(this, void 0, void 0, function* () {
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
                    }
                    else {
                        reject(new Error(`Error finding new document in database`));
                    }
                });
            });
        });
    }
    updateUserPass(id, user) {
        return __awaiter(this, void 0, void 0, function* () {
            let pass = user.password;
            user.timeEdited = new Date();
            user.hashedPassword = yield bcrypt.hash(pass, 10);
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
                    }
                    else {
                        reject(new Error(`Error finding new document in database`));
                    }
                });
            });
        });
    }
    editProfileImage(id, entity) {
        return __awaiter(this, void 0, void 0, function* () {
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
                    }
                    else {
                        reject(new Error(`Error finding new document in database`));
                    }
                });
            });
        });
    }
    getAll() {
        return __awaiter(this, void 0, void 0, function* () {
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
        });
    }
    confirmRole(id, role) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.pool.query('SELECT * FROM hack_trip.users WHERE _id =? AND role=?', [id, role], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    if (rows.length == 1) {
                        resolve(true);
                    }
                    else {
                        resolve(false);
                    }
                });
            });
        });
    }
}
exports.UserRepository = UserRepository;
//# sourceMappingURL=userService.js.map