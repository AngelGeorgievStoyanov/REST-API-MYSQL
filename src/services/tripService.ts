import { Pool } from "mysql";
import { ITripRepository } from "../interface/trip-repository";
import { IdType } from "../interface/user-repository";
import { Trip } from "../model/trip";





const createSql = `INSERT INTO hack_trip.trips (
    title,
    description,
    price,
    transport,
    countPeoples,
    typeOfPeople,
    destination,
    imageUrl,
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

const updateSql = `UPDATE hack_trip.trips SET title =?, description=?, price=?, transport=?, countPeoples=?, typeOfPeople=?, destination=?, imageUrl=?, lat=?,lng=?, timeEdited=?, imageFile =? WHERE _id =?`;

const updateSqlLikes = `UPDATE hack_trip.trips SET likes =? WHERE _id =?`;
const updateSqlFavorites = `UPDATE hack_trip.trips SET favorites =? WHERE _id =?`;

const updateSqlReports = `UPDATE hack_trip.trips SET reportTrip =? WHERE _id =?`;
const updateSqlImages = `UPDATE hack_trip.trips SET imageFile =? WHERE _id =?`;


const selectCreatedTrip = `SELECT * FROM hack_trip.trips WHERE title=? AND description=? AND price=? AND transport=? AND countPeoples=? AND typeOfPeople=? AND destination=? AND imageUrl=? AND _ownerId=?`;

export class TripRepository implements ITripRepository<Trip> {
    constructor(protected pool: Pool) { }



    async create(trip: Trip): Promise<Trip> {
        trip.timeCreated = new Date()
        trip.timeEdited = new Date()
        let imagesNew = trip.imageFile.join()
        return new Promise((resolve, reject) => {
            this.pool.query(createSql,
                [trip.title, trip.description, trip.price, trip.transport, trip.countPeoples, trip.typeOfPeople, trip.destination, trip.imageUrl, trip.coments, trip.likes, trip._ownerId, trip.lat, trip.lng, trip.timeCreated, trip.timeEdited, trip.reportTrip, imagesNew, trip.favorites],
                (err, rows, fields) => {
                    if (err) {

                        console.log(err.message)
                        reject(err);
                        return;
                    }

                    this.pool.query(selectCreatedTrip,
                        [trip.title, trip.description, trip.price, trip.transport, trip.countPeoples, trip.typeOfPeople, trip.destination, trip.imageUrl, trip._ownerId],
                        (err, rows, fields) => {
                            if (err) {

                                console.log(err.message)
                                reject(err);
                                return;
                            }


                            resolve(rows[0]);
                        });

                });
        });


    }



    async getAll(search: string, typegroup: string, typetransport: string): Promise<Trip[]> {
        const searchInp = '%' + search + '%'
        const typeGroupSelect = typegroup.length === 0 ? '%' : typegroup
        const typeTransportSelect = typetransport.length === 0 ? '%' : typetransport

        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.trips WHERE trips.title LIKE ? AND trips.typeOfPeople LIKE ? AND trips.transport LIKE ?;', [searchInp, typeGroupSelect, typeTransportSelect], (err, rows, fields) => {
                if (err) {
                    console.log(err)
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
        const perPage = 3;
        const currentPage = (page - 1) * perPage
        const searchInp = '%' + search + '%'
        const typeGroupSelect = typegroup.length === 0 ? '%' : typegroup
        const typeTransportSelect = typetransport.length === 0 ? '%' : typetransport


        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.trips WHERE trips.title LIKE ? AND trips.typeOfPeople LIKE ? AND trips.transport LIKE ? LIMIT ? OFFSET ?', [searchInp, typeGroupSelect, typeTransportSelect, perPage, currentPage], (err, rows, fields) => {
                if (err) {
                    console.log(err)
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
            this.pool.query('SELECT * FROM hack_trip.trips WHERE reportTrip IS NOT NULL', (err, rows, fields) => {
                if (err) {
                    console.log(err)
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
                    console.log(err)
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


                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            })
        })
    }



    async deleteTrypById(id: IdType): Promise<Trip> {

        let tripDel;

        return new Promise((resolve, reject) => {
            this.pool.query(selectOne, [id], (err, rows, fields) => {
                if (err) {
                    console.log(err)
                    reject(err);
                    return;
                }
                if (rows.length === 1) {

                    tripDel = rows[0];

                    this.pool.query(deleteOne, [id], (err, rows, fields) => {
                        if (err) {
                            console.log(err)
                            reject(err);
                            return;
                        }
                        if (!err) {
                            resolve(tripDel);

                        }

                    })


                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            })
        })
    }


    async getAllMyTrips(id: IdType): Promise<Trip[]> {

        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.trips WHERE _ownerId =?', [id], (err, rows, fields) => {
                if (err) {
                    console.log(err)
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


    async getAllMyFavorites(id: IdType): Promise<Trip[]> {
        id = '%' + id + '%';
        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.trips WHERE trips.favorites LIKE ?', [id], (err, rows, fields) => {
                if (err) {
                    console.log(err)
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


    async updateTripById(id: IdType, trip: Trip): Promise<Trip> {
        trip.timeEdited = new Date()
        let editedImg = trip.imageFile.join()
        return new Promise((resolve, reject) => {
            this.pool.query(updateSql, [trip.title, trip.description, trip.price, trip.transport,
            trip.countPeoples, trip.typeOfPeople, trip.destination, trip.imageUrl, trip.lat, trip.lng, trip.timeEdited, editedImg, id], (err, rows, fields) => {
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

    async updateTripFavoritesByuserId(id: IdType, trip: Trip): Promise<Trip> {

        let favoritessNew = trip.favorites.join()
        return new Promise((resolve, reject) => {
            this.pool.query(updateSqlFavorites, [favoritessNew, id], (err, rows, fields) => {
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

    async updateTripLikeByuserId(id: IdType, trip: Trip): Promise<Trip> {

        let likesNew = trip.likes.join()
        return new Promise((resolve, reject) => {
            this.pool.query(updateSqlLikes, [likesNew, id], (err, rows, fields) => {
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

    async reportTripByuserId(id: IdType, trip: Trip): Promise<Trip> {

        let reportsNew = trip.reportTrip.join()
        return new Promise((resolve, reject) => {
            this.pool.query(updateSqlReports, [reportsNew, id], (err, rows, fields) => {
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


    async editImagesByTripId(id: IdType, data: Trip): Promise<Trip> {

        let editedImages = data.imageFile.join()

        return new Promise((resolve, reject) => {
            this.pool.query(updateSqlImages, [editedImages, id], (err, rows, fields) => {
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

                            const point = rows.map(row => ({
                                ...row,
                                likes: row.likes ? row.likes.split(/[,\s]+/) : [],
                                reportTrip: row.reportTrip ? row.reportTrip.split(/[,\s]+/) : [],
                                imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [],
                                favorites: row.favorites ? row.favorites.split(/[,\s]+/) : [],

                            }))


                            resolve(point[0]);

                        }

                    })

                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            })
        })
    }

    async getTop(): Promise<Trip[]> {
        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.trips', (err, rows, fields) => {
                if (err) {
                    console.log(err)
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

}