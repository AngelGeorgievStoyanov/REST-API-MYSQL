import { Pool } from "mysql";
import { ITripRepository } from "../interface/trip-repository";
import { IdType } from "../interface/user-repository";
import { Trip } from "../model/trip";
import { v4 as uuid } from 'uuid';





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
    favorites,
    currency,
    dayNumber,
    tripGroupId
  )
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;

const selectOne = `SELECT * FROM hack_trip.trips WHERE _id =?`;

const deleteOne = `DELETE from hack_trip.trips WHERE _id =?`;

const updateSql = `UPDATE hack_trip.trips SET title =?, description=?, price=?, transport=?, countPeoples=?, typeOfPeople=?, destination=?, lat=?,lng=?, timeEdited=?, imageFile =?, currency =?, dayNumber =?, countEdited = countEdited + 1 WHERE _id =?`;

const updateSqlLikes = `UPDATE hack_trip.trips SET likes =? WHERE _id =?`;
const updateSqlFavorites = `UPDATE hack_trip.trips SET favorites =? WHERE _id =?`;

const updateSqlReports = `UPDATE hack_trip.trips SET reportTrip =? WHERE _id =?`;
const updateSqlImages = `UPDATE hack_trip.trips SET imageFile =? WHERE _id =?`;


const selectCreatedTrip = `SELECT * FROM hack_trip.trips WHERE title=? AND description=? AND price=? AND transport=? AND countPeoples=? AND typeOfPeople=? AND destination=? AND _ownerId=? AND dayNumber =? AND tripGroupId =?`;


export class TripRepository implements ITripRepository<Trip> {
    constructor(protected pool: Pool) { }


    async create(trip: Trip): Promise<Trip> {
        trip.timeCreated = new Date().toISOString();
        trip.timeEdited = new Date().toISOString();
        trip._id = uuid();

        if (!trip.tripGroupId) {
            trip.tripGroupId = uuid();
        }

        const duplicateCheckQuery = `SELECT * FROM hack_trip.trips WHERE tripGroupId = ? AND dayNumber = ? LIMIT 1`;

        return new Promise((resolve, reject) => {

            this.pool.query(duplicateCheckQuery, [trip.tripGroupId, trip.dayNumber], (err, rows) => {
                if (err) {
                    return reject(err);
                }

                if (rows.length > 0) {
                    return reject(new Error(`A trip ${trip.title} with day ${trip.dayNumber} already exists, please change the day of trip.`));
                }

                let imagesNew = (trip.imageFile || []).join();

                this.pool.query(createSql,
                    [trip._id, trip.title, trip.description, trip.price, trip.transport, trip.countPeoples, trip.typeOfPeople, trip.destination, trip.coments, trip.likes, trip._ownerId, trip.lat, trip.lng, trip.timeCreated, trip.timeEdited, trip.reportTrip, imagesNew, trip.favorites, trip.currency, trip.dayNumber, trip.tripGroupId],
                    (err, rows, fields) => {
                        if (err) {
                            return reject(err);
                        }

                        this.pool.query(selectCreatedTrip,
                            [trip.title, trip.description, trip.price, trip.transport, trip.countPeoples, trip.typeOfPeople, trip.destination, trip._ownerId, trip.dayNumber, trip.tripGroupId],
                            (err, rows, fields) => {
                                if (err) {
                                    return reject(err);
                                }

                                resolve(rows[0]);
                            });
                    });
            });
        });
    }



    async getAll(search: string, typegroup: string, typetransport: string): Promise<Trip[]> {
        const searchInp = '%' + search + '%';
        const typeGroupSelect = typegroup.length === 0 ? '%' : typegroup;
        const typeTransportSelect = typetransport.length === 0 ? '%' : typetransport;

        return new Promise((resolve, reject) => {
            this.pool.query(`SELECT t1.*
        FROM hack_trip.trips t1
        JOIN (
            SELECT tripGroupId, MIN(dayNumber) as minDayNumber
            FROM hack_trip.trips
            WHERE title LIKE ? AND typeOfPeople LIKE ? AND transport LIKE ?
            GROUP BY tripGroupId
        ) t2
        ON t1.tripGroupId = t2.tripGroupId AND t1.dayNumber = t2.minDayNumber
        ;
    `, [searchInp, typeGroupSelect, typeTransportSelect], (err, rows, fields) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }

                resolve(rows.map(row => ({
                    ...row,
                    likes: row.likes ? row.likes.split(/[,\s]+/) : [],
                    reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [],
                    imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [],
                    favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [],

                })));
            });
        });
    }


    async getPagination(page: number, search: string, typegroup: string, typetransport: string): Promise<Trip[]> {

        page = page || 1;
        const perPage = 8;
        const currentPage = (page - 1) * perPage;
        const searchInp = '%' + search + '%';
        const typeGroupSelect = typegroup.length === 0 ? '%' : typegroup;
        const typeTransportSelect = typetransport.length === 0 ? '%' : typetransport;


        return new Promise((resolve, reject) => {
            this.pool.query(` SELECT t1.*
        FROM hack_trip.trips t1
        JOIN (
            SELECT tripGroupId, MIN(dayNumber) as minDayNumber
            FROM hack_trip.trips
            WHERE title LIKE ? AND typeOfPeople LIKE ? AND transport LIKE ?
            GROUP BY tripGroupId
        ) t2
        ON t1.tripGroupId = t2.tripGroupId AND t1.dayNumber = t2.minDayNumber
        LIMIT ? OFFSET ?;
    `, [searchInp, typeGroupSelect, typeTransportSelect, perPage, currentPage], (err, rows, fields) => {

                if (err) {
                    (err);
                    reject(err);
                    return;
                }

                resolve(rows.map(row => ({
                    ...row,
                    likes: row.likes ? row.likes.split(/[,\s]+/) : [],
                    reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [],
                    imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [],
                    favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [],

                })));
            });
        });
    }


    async getAllReports(): Promise<Trip[]> {

        return new Promise((resolve, reject) => {
            this.pool.query("SELECT * FROM hack_trip.trips WHERE reportTrip IS NOT NULL AND TRIM(reportTrip) <> '';", (err, rows, fields) => {
                if (err) {
                    (err);
                    reject(err);
                    return;
                }

                resolve(rows.map(row => ({
                    ...row,
                    likes: row.likes ? row.likes.split(/[,\s]+/) : [],
                    reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [],
                    imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [],
                    favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [],

                })));
            });
        });
    }


    async getTripById(id: IdType): Promise<Trip> {

        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.trips WHERE _id =?', [id], (err, rows, fields) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }

                if (rows.length == 1) {

                    const trip = rows[0];
                    resolve({
                        ...trip,
                        likes: trip.likes ? trip.likes.split(/[,\s]+/) : trip.likes !== null && trip.likes.length > 0 ? trip.likes.split('') : [],
                        reportTrip: trip.reportTrip ? trip.reportTrip.split(/[,\s]+/) : trip.reportTrip !== null && trip.reportTrip.length > 0 ? trip.reportTrip.split('') : [],
                        imageFile: trip.imageFile ? trip.imageFile.split(/[,\s]+/) : trip.imageFile !== null && trip.imageFile.length > 0 ? trip.imageFile.split('') : [],
                        favorites: trip.favorites ? trip.favorites.split(/[,\s]+/) : trip.favorites !== null && trip.favorites.length > 0 ? trip.favorites.split('') : [],

                    });


                } else if (Array.isArray(rows) && rows.length == 0) {
                    resolve(rows[0])
                }
                else {

                    reject(new Error(`Error finding new document in database`));
                }
            });
        });
    }


    async deleteTrypById(id: IdType): Promise<Trip> {

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
                } else {
                    reject(new Error(`Error finding new document in database`));
                }
            });
        });
    }


    async getAllMyTrips(id: IdType): Promise<Trip[]> {

        return new Promise((resolve, reject) => {
            this.pool.query(`SELECT t1.*
                FROM hack_trip.trips t1
                JOIN (
                    SELECT tripGroupId, MIN(dayNumber) as minDayNumber
                    FROM hack_trip.trips
                    WHERE _ownerId =?
                    GROUP BY tripGroupId
                ) t2
                ON t1.tripGroupId = t2.tripGroupId AND t1.dayNumber = t2.minDayNumber
                ;`, [id], (err, rows, fields) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }
                resolve(rows.map(row => ({
                    ...row,
                    likes: row.likes ? row.likes.split(/[,\s]+/) : [],
                    reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [],
                    imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [],
                    favorites: row.favorites = [],

                })));
            });
        });
    }


    async getAllMyFavorites(id: IdType): Promise<Trip[]> {
        id = '%' + id + '%';
        return new Promise((resolve, reject) => {
            this.pool.query(`SELECT t.*
            FROM hack_trip.trips t
            JOIN (
                SELECT tripGroupId, MAX(_id) AS max_id
                FROM hack_trip.trips
                WHERE favorites LIKE ?
                GROUP BY tripGroupId
            ) AS grouped_trips ON t.tripGroupId = grouped_trips.tripGroupId AND t._id = grouped_trips.max_id
            WHERE t.favorites LIKE ?;`, [id, id], (err, rows, fields) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }
                resolve(rows.map(row => ({
                    ...row,
                    likes: row.likes ? row.likes.split(/[,\s]+/) : [],
                    reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [],
                    imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [],
                    favorites: row.favorites = [],

                })));
            });
        });
    }


    async updateTripById(id: IdType, trip: Trip): Promise<Trip> {
        trip.timeEdited = new Date().toISOString();
        let editedImg = trip.imageFile.join();
        return new Promise((resolve, reject) => {
            this.pool.query(updateSql, [trip.title, trip.description, trip.price, trip.transport,
            trip.countPeoples, trip.typeOfPeople, trip.destination, trip.lat, trip.lng, trip.timeEdited, editedImg, trip.currency, trip.dayNumber, id], (err, rows, fields) => {
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
                            resolve({
                                ...rows[0],
                                likes: rows[0].likes ? rows[0].likes.split(/[,\s]+/) : [],
                                reportTrip: rows[0].reportTrip ? rows[0].reportTrip.split(/[,\s]+/) : [],
                                imageFile: rows[0].imageFile ? rows[0].imageFile.split(/[,\s]+/) : [],
                                favorites: rows[0].favorites ? rows[0].favorites.split(/[,\s]+/) : [],

                            });

                        }

                    });

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            });
        });
    }


    async updateTripFavoritesByuserId(id: IdType, trip: Trip): Promise<Trip> {

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
                            resolve({
                                ...rows[0],
                                likes: rows[0].likes ? rows[0].likes.split(/[,\s]+/) : [],
                                reportTrip: rows[0].reportTrip ? rows[0].reportTrip.split(/[,\s]+/) : [],
                                imageFile: rows[0].imageFile ? rows[0].imageFile.split(/[,\s]+/) : [],
                                favorites: rows[0].favorites ? rows[0].favorites.split(/[,\s]+/) : [],

                            });

                        }

                    });

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            });
        });
    }


    async updateTripLikeByuserId(id: IdType, trip: Trip): Promise<Trip> {

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
                            resolve({
                                ...rows[0],
                                likes: rows[0].likes ? rows[0].likes.split(/[,\s]+/) : [],
                                reportTrip: rows[0].reportTrip ? rows[0].reportTrip.split(/[,\s]+/) : [],
                                imageFile: rows[0].imageFile ? rows[0].imageFile.split(/[,\s]+/) : [],
                                favorites: rows[0].favorites ? rows[0].favorites.split(/[,\s]+/) : [],

                            });

                        }

                    });

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            });
        });
    }


    async deleteReportTripByuserId(id: IdType, trip: Trip): Promise<Trip> {

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
                            resolve({
                                ...rows[0],
                                likes: rows[0].likes ? rows[0].likes.split(/[,\s]+/) : [],
                                reportTrip: rows[0].reportTrip ? rows[0].reportTrip.split(/[,\s]+/) : [],
                                imageFile: rows[0].imageFile ? rows[0].imageFile.split(/[,\s]+/) : [],
                                favorites: rows[0].favorites ? rows[0].favorites.split(/[,\s]+/) : [],

                            });

                        }

                    });

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            });
        });
    }

    async reportTripByuserId(id: IdType, trip: Trip): Promise<Trip> {

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
                            resolve({
                                ...rows[0],
                                likes: rows[0].likes ? rows[0].likes.split(/[,\s]+/) : [],
                                reportTrip: rows[0].reportTrip ? rows[0].reportTrip.split(/[,\s]+/) : [],
                                imageFile: rows[0].imageFile ? rows[0].imageFile.split(/[,\s]+/) : [],
                                favorites: rows[0].favorites ? rows[0].favorites.split(/[,\s]+/) : [],

                            });

                        }

                    })

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            });
        });
    }


    async editImagesByTripId(id: IdType, data: Trip): Promise<Trip> {

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

                            const point = rows.map(row => ({
                                ...row,
                                likes: row.likes ? row.likes.split(/[,\s]+/) : [],
                                reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [],
                                imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [],
                                favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [],

                            }));


                            resolve(point[0]);

                        }

                    });

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            });
        });
    }


    async getTop(): Promise<Trip[]> {
        return new Promise((resolve, reject) => {
            this.pool.query(`
             SELECT t1.*
                FROM hack_trip.trips t1
            LEFT JOIN hack_trip.trips t2
            ON t1.tripGroupId = t2.tripGroupId
            AND (
                LENGTH(t1.likes) < LENGTH(t2.likes) 
                OR (LENGTH(t1.likes) = LENGTH(t2.likes) AND t1.dayNumber > t2.dayNumber)
            )
            WHERE t2.tripGroupId IS NULL
            ORDER BY LENGTH(t1.likes) DESC, t1.dayNumber ASC
            LIMIT 5;
            `, (err, rows) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }

                resolve(rows.map(row => ({
                    ...row,
                    likes: row.likes ? row.likes.split(/[,\s]+/) : [],
                    reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [],
                    imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [],
                    favorites: [],
                })));
            });
        });
    }

    async getTripsByGroupId(id: string): Promise<Trip[]> {
        return new Promise((resolve, reject) => {
            this.pool.query(`SELECT * FROM hack_trip.trips WHERE tripGroupId = ? ORDER BY dayNumber DESC;`, [id], (err, rows, fields) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }
                if (rows) {

                    resolve(
                        rows.map(row => ({
                            ...row
                        }))
                    );
                }
            });
        });

    }
}