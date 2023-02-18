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
exports.TripRepository = void 0;
const uuid_1 = require("uuid");
const createSql = `INSERT INTO hack_trip.trips (
    _id,
    title,
    description,
    price,
    transport,
    countPeoples,
    typeOfPeople,
    destination,
    coments,
    likes,
    _ownerId,
    lat,
    lng,
    timeCreated,
    timeEdited,
    reportTrip,
    imageFile,
    favorites
  )
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;
const selectOne = `SELECT * FROM hack_trip.trips WHERE _id =?`;
const deleteOne = `DELETE from hack_trip.trips WHERE _id =?`;
const updateSql = `UPDATE hack_trip.trips SET title =?, description=?, price=?, transport=?, countPeoples=?, typeOfPeople=?, destination=?, lat=?,lng=?, timeEdited=?, imageFile =? WHERE _id =?`;
const updateSqlLikes = `UPDATE hack_trip.trips SET likes =? WHERE _id =?`;
const updateSqlFavorites = `UPDATE hack_trip.trips SET favorites =? WHERE _id =?`;
const updateSqlReports = `UPDATE hack_trip.trips SET reportTrip =? WHERE _id =?`;
const updateSqlImages = `UPDATE hack_trip.trips SET imageFile =? WHERE _id =?`;
const selectCreatedTrip = `SELECT * FROM hack_trip.trips WHERE title=? AND description=? AND price=? AND transport=? AND countPeoples=? AND typeOfPeople=? AND destination=? AND _ownerId=?`;
class TripRepository {
    constructor(pool) {
        this.pool = pool;
    }
    create(trip) {
        return __awaiter(this, void 0, void 0, function* () {
            trip.timeCreated = new Date();
            trip.timeEdited = new Date();
            trip._id = (0, uuid_1.v4)();
            let imagesNew = trip.imageFile.join();
            return new Promise((resolve, reject) => {
                this.pool.query(createSql, [trip._id, trip.title, trip.description, trip.price, trip.transport, trip.countPeoples, trip.typeOfPeople, trip.destination, trip.coments, trip.likes, trip._ownerId, trip.lat, trip.lng, trip.timeCreated, trip.timeEdited, trip.reportTrip, imagesNew, trip.favorites], (err, rows, fields) => {
                    if (err) {
                        console.log(err.message);
                        reject(err);
                        return;
                    }
                    this.pool.query(selectCreatedTrip, [trip.title, trip.description, trip.price, trip.transport, trip.countPeoples, trip.typeOfPeople, trip.destination, trip._ownerId], (err, rows, fields) => {
                        if (err) {
                            console.log(err.message);
                            reject(err);
                            return;
                        }
                        resolve(rows[0]);
                    });
                });
            });
        });
    }
    getAll(search, typegroup, typetransport) {
        return __awaiter(this, void 0, void 0, function* () {
            const searchInp = '%' + search + '%';
            const typeGroupSelect = typegroup.length === 0 ? '%' : typegroup;
            const typeTransportSelect = typetransport.length === 0 ? '%' : typetransport;
            return new Promise((resolve, reject) => {
                this.pool.query('SELECT * FROM hack_trip.trips WHERE trips.title LIKE ? AND trips.typeOfPeople LIKE ? AND trips.transport LIKE ?;', [searchInp, typeGroupSelect, typeTransportSelect], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    resolve(rows.map(row => (Object.assign(Object.assign({}, row), { likes: row.likes ? row.likes.split(/[,\s]+/) : [], reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [], imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [], favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [] }))));
                });
            });
        });
    }
    getPagination(page, search, typegroup, typetransport) {
        return __awaiter(this, void 0, void 0, function* () {
            page = page || 1;
            const perPage = 9;
            const currentPage = (page - 1) * perPage;
            const searchInp = '%' + search + '%';
            const typeGroupSelect = typegroup.length === 0 ? '%' : typegroup;
            const typeTransportSelect = typetransport.length === 0 ? '%' : typetransport;
            return new Promise((resolve, reject) => {
                this.pool.query('SELECT * FROM hack_trip.trips WHERE trips.title LIKE ? AND trips.typeOfPeople LIKE ? AND trips.transport LIKE ? LIMIT ? OFFSET ?', [searchInp, typeGroupSelect, typeTransportSelect, perPage, currentPage], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    resolve(rows.map(row => (Object.assign(Object.assign({}, row), { likes: row.likes ? row.likes.split(/[,\s]+/) : [], reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [], imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [], favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [] }))));
                });
            });
        });
    }
    getAllReports() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.pool.query('SELECT * FROM hack_trip.trips WHERE reportTrip IS NOT NULL', (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    resolve(rows.map(row => (Object.assign(Object.assign({}, row), { likes: row.likes ? row.likes.split(/[,\s]+/) : [], reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [], imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [], favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [] }))));
                });
            });
        });
    }
    getTripById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.pool.query('SELECT * FROM hack_trip.trips WHERE _id =?', [id], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    if (rows.length == 1) {
                        const trip = rows[0];
                        resolve(Object.assign(Object.assign({}, trip), { likes: trip.likes ? trip.likes.split(/[,\s]+/) : trip.likes !== null && trip.likes.length > 0 ? trip.likes.split('') : [], reportTrip: trip.reportTrip ? trip.reportTrip.split(/[,\s]+/) : trip.reportTrip !== null && trip.reportTrip.length > 0 ? trip.reportTrip.split('') : [], imageFile: trip.imageFile ? trip.imageFile.split(/[,\s]+/) : trip.imageFile !== null && trip.imageFile.length > 0 ? trip.imageFile.split('') : [], favorites: trip.favorites ? trip.favorites.split(/[,\s]+/) : trip.favorites !== null && trip.favorites.length > 0 ? trip.favorites.split('') : [] }));
                    }
                    else {
                        reject(new Error(`Error finding new document in database`));
                    }
                });
            });
        });
    }
    deleteTrypById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            let tripDel;
            return new Promise((resolve, reject) => {
                this.pool.query(selectOne, [id], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    if (rows.length === 1) {
                        tripDel = rows[0];
                        this.pool.query(deleteOne, [id], (err, rows, fields) => {
                            if (err) {
                                console.log(err);
                                reject(err);
                                return;
                            }
                            if (!err) {
                                resolve(tripDel);
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
    getAllMyTrips(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.pool.query('SELECT * FROM hack_trip.trips WHERE _ownerId =?', [id], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    resolve(rows.map(row => (Object.assign(Object.assign({}, row), { likes: row.likes ? row.likes.split(/[,\s]+/) : [], reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [], imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [], favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [] }))));
                });
            });
        });
    }
    getAllMyFavorites(id) {
        return __awaiter(this, void 0, void 0, function* () {
            id = '%' + id + '%';
            return new Promise((resolve, reject) => {
                this.pool.query('SELECT * FROM hack_trip.trips WHERE trips.favorites LIKE ?', [id], (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    resolve(rows.map(row => (Object.assign(Object.assign({}, row), { likes: row.likes ? row.likes.split(/[,\s]+/) : [], reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [], imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [], favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [] }))));
                });
            });
        });
    }
    updateTripById(id, trip) {
        return __awaiter(this, void 0, void 0, function* () {
            trip.timeEdited = new Date();
            let editedImg = trip.imageFile.join();
            return new Promise((resolve, reject) => {
                this.pool.query(updateSql, [trip.title, trip.description, trip.price, trip.transport,
                    trip.countPeoples, trip.typeOfPeople, trip.destination, trip.lat, trip.lng, trip.timeEdited, editedImg, id], (err, rows, fields) => {
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
                                resolve(Object.assign(Object.assign({}, rows[0]), { likes: rows[0].likes ? rows[0].likes.split(/[,\s]+/) : [], reportTrip: rows[0].reportTrip ? rows[0].reportTrip.split(/[,\s]+/) : [], imageFile: rows[0].imageFile ? rows[0].imageFile.split(/[,\s]+/) : [], favorites: rows[0].favorites ? rows[0].favorites.split(/[,\s]+/) : [] }));
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
    updateTripFavoritesByuserId(id, trip) {
        return __awaiter(this, void 0, void 0, function* () {
            let favoritessNew = trip.favorites.join();
            return new Promise((resolve, reject) => {
                this.pool.query(updateSqlFavorites, [favoritessNew, id], (err, rows, fields) => {
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
                                resolve(Object.assign(Object.assign({}, rows[0]), { likes: rows[0].likes ? rows[0].likes.split(/[,\s]+/) : [], reportTrip: rows[0].reportTrip ? rows[0].reportTrip.split(/[,\s]+/) : [], imageFile: rows[0].imageFile ? rows[0].imageFile.split(/[,\s]+/) : [], favorites: rows[0].favorites ? rows[0].favorites.split(/[,\s]+/) : [] }));
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
    updateTripLikeByuserId(id, trip) {
        return __awaiter(this, void 0, void 0, function* () {
            let likesNew = trip.likes.join();
            return new Promise((resolve, reject) => {
                this.pool.query(updateSqlLikes, [likesNew, id], (err, rows, fields) => {
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
                                resolve(Object.assign(Object.assign({}, rows[0]), { likes: rows[0].likes ? rows[0].likes.split(/[,\s]+/) : [], reportTrip: rows[0].reportTrip ? rows[0].reportTrip.split(/[,\s]+/) : [], imageFile: rows[0].imageFile ? rows[0].imageFile.split(/[,\s]+/) : [], favorites: rows[0].favorites ? rows[0].favorites.split(/[,\s]+/) : [] }));
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
    deleteReportTripByuserId(id, trip) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.pool.query(updateSqlReports, [trip.reportTrip, id], (err, rows, fields) => {
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
                                resolve(Object.assign(Object.assign({}, rows[0]), { likes: rows[0].likes ? rows[0].likes.split(/[,\s]+/) : [], reportTrip: rows[0].reportTrip ? rows[0].reportTrip.split(/[,\s]+/) : [], imageFile: rows[0].imageFile ? rows[0].imageFile.split(/[,\s]+/) : [], favorites: rows[0].favorites ? rows[0].favorites.split(/[,\s]+/) : [] }));
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
    reportTripByuserId(id, trip) {
        return __awaiter(this, void 0, void 0, function* () {
            let reportsNew = trip.reportTrip.join();
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
                                resolve(Object.assign(Object.assign({}, rows[0]), { likes: rows[0].likes ? rows[0].likes.split(/[,\s]+/) : [], reportTrip: rows[0].reportTrip ? rows[0].reportTrip.split(/[,\s]+/) : [], imageFile: rows[0].imageFile ? rows[0].imageFile.split(/[,\s]+/) : [], favorites: rows[0].favorites ? rows[0].favorites.split(/[,\s]+/) : [] }));
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
    editImagesByTripId(id, data) {
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
                                const point = rows.map(row => (Object.assign(Object.assign({}, row), { likes: row.likes ? row.likes.split(/[,\s]+/) : [], reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [], imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [], favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [] })));
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
    getTop() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.pool.query('SELECT * FROM hack_trip.trips', (err, rows, fields) => {
                    if (err) {
                        console.log(err);
                        reject(err);
                        return;
                    }
                    resolve(rows.map(row => (Object.assign(Object.assign({}, row), { likes: row.likes ? row.likes.split(/[,\s]+/) : [], reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [], imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [], favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [] }))));
                });
            });
        });
    }
}
exports.TripRepository = TripRepository;
//# sourceMappingURL=tripService.js.map