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
exports.PointTripRepository = void 0;
const uuid_1 = require("uuid");
const createSql = `INSERT INTO hack_trip.points (
    _id,
    name,
    description,
    _ownerTripId,
    lat,
    lng,
    pointNumber,
    imageFile,
    _ownerId
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`;
const selectOne = `SELECT * FROM hack_trip.points WHERE _id =?`;
const deleteOne = `DELETE from hack_trip.points WHERE _id =?`;
const deleteByOTripId = `DELETE from hack_trip.points WHERE _ownerTripId =?`;
const selectByOwnerId = `SELECT * FROM hack_trip.points WHERE _ownerTripId =?`;
const updateSql = `UPDATE hack_trip.points SET name =?, description=?, lat=?, lng=?, pointNumber=?, imageFile =? WHERE _id =?`;
const updatePositionSql = `UPDATE hack_trip.points SET pointNumber=? WHERE _id =?`;
const updateSqlImages = `UPDATE hack_trip.points SET imageFile =? WHERE _id =?`;
const findBytripIdOrderByPointPositionSql = `SELECT * FROM hack_trip.points  WHERE _ownerTripId=? ORDER BY pointNumber ASC`;
class PointTripRepository {
    constructor(pool) {
        this.pool = pool;
    }
    create(point) {
        return __awaiter(this, void 0, void 0, function* () {
            point._id = (0, uuid_1.v4)();
            return new Promise((resolve, reject) => {
                let imagesNew = point.imageFile.join();
                this.pool.query(createSql, [point._id, point.name, point.description, point._ownerTripId, point.lat, point.lng, point.pointNumber, imagesNew, point._ownerId], (err, rows, fields) => {
                    if (err) {
                        console.log(err.message);
                        reject(err);
                        return;
                    }
                    resolve(point);
                });
            });
        });
    }
    findByTripId(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.pool.query('SELECT * FROM hack_trip.points WHERE _ownerTripId =?', [id], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    if (rows) {
                        const points = rows;
                        resolve(points.map(point => (Object.assign(Object.assign({}, point), { imageFile: point.imageFile ? point.imageFile.split(/[,\s]+/) : [] }))));
                    }
                    else {
                        reject(new Error(`Error finding new document in database`));
                    }
                });
            });
        });
    }
    deletePointById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            let pointDel;
            return new Promise((resolve, reject) => {
                this.pool.query(selectOne, [id], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    if (rows.length === 1) {
                        deleteOne;
                        pointDel = rows[0];
                        this.pool.query(deleteOne, [id], (err, rows, fields) => {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (!err) {
                                resolve(pointDel);
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
    deletePointByTripId(id) {
        return __awaiter(this, void 0, void 0, function* () {
            let pointsDel;
            return new Promise((resolve, reject) => {
                this.pool.query(selectByOwnerId, [id], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    if (rows.length > 0) {
                        deleteOne;
                        pointsDel = rows;
                        this.pool.query(deleteByOTripId, [id], (err, rows, fields) => {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (!err) {
                                resolve(pointsDel);
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
    getPointById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.pool.query('SELECT * FROM hack_trip.points WHERE _id =?', [id], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    if (rows.length == 1) {
                        const point = rows[0];
                        resolve(Object.assign(Object.assign({}, point), { imageFile: point.imageFile ? point.imageFile.split(/[,\s]+/) : point.imageFile !== null && point.imageFile.length > 0 ? point.imageFile.split('') : [] }));
                    }
                    else {
                        reject(new Error(`Error finding new document in database`));
                    }
                });
            });
        });
    }
    updatePointById(id, point) {
        return __awaiter(this, void 0, void 0, function* () {
            let editedImg = point.imageFile.join();
            return new Promise((resolve, reject) => {
                this.pool.query(updateSql, [point.name, point.description, point.lat, point.lng, point.pointNumber, editedImg, id], (err, rows, fields) => {
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
    updatePointPositionById(id, pointPosition) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.pool.query(updatePositionSql, [pointPosition, id], (err, rows, fields) => {
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
    editImagesByPointId(id, data) {
        return __awaiter(this, void 0, void 0, function* () {
            let editedImages = data.imageFile.join();
            return new Promise((resolve, reject) => {
                this.pool.query(updateSqlImages, [editedImages, id], (err, rows, fields) => {
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
                                const point = rows.map(row => (Object.assign(Object.assign({}, row), { imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [] })));
                                resolve(point[0]);
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
    findBytripIdOrderByPointPosition(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.pool.query(findBytripIdOrderByPointPositionSql, [id], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    if (rows) {
                        resolve(rows.map(row => (Object.assign(Object.assign({}, row), { imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [] }))));
                    }
                    else {
                        reject(new Error(`Error finding new document in database`));
                    }
                });
            });
        });
    }
}
exports.PointTripRepository = PointTripRepository;
//# sourceMappingURL=pointService.js.map