import { Pool } from "mysql";
import { IPointTripRepository } from "../interface/point-repository";
import { IdType } from "../interface/user-repository";
import { Point } from "../model/point";



const createSql = `INSERT INTO hack_trip.points (
    name,
    description,
    imageUrl,
    _ownerTripId,
    lat,
    lng,
    pointNumber,
    imageFile
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?);`;


const selectOne = `SELECT * FROM hack_trip.points WHERE _id =?`;

const deleteOne = `DELETE from hack_trip.points WHERE _id =?`

const deleteByOTripId = `DELETE from hack_trip.points WHERE (_ownerTripId =? AND _id>0)`

const selectByOwnerId = `SELECT * FROM hack_trip.points WHERE _ownerTripId =?`;


const updateSql = `UPDATE hack_trip.points SET name =?, description=?, imageUrl=?, lat=?, lng=?, pointNumber=?, imageFile =? WHERE (_id =? AND _id>0)`;

const updatePositionSql = `UPDATE hack_trip.points SET pointNumber=? WHERE _id =?`;

const updateSqlImages = `UPDATE hack_trip.points SET imageFile =? WHERE _id =?`;


const findBytripIdOrderByPointPositionSql = `SELECT * FROM hack_trip.points  WHERE _ownerTripId=? ORDER BY pointNumber ASC`;

export class PointTripRepository implements IPointTripRepository<Point> {
    constructor(protected pool: Pool) { }

    async create(point: Point): Promise<Point> {
        console.log(point)
        return new Promise((resolve, reject) => {
            let imagesNew = point.imageFile.join()

            this.pool.query(createSql,
                [point.name, point.description, point.imageUrl, point._ownerTripId, point.lat, point.lng, point.pointNumber, imagesNew],
                (err, rows, fields) => {
                    if (err) {

                        console.log(err.message)
                        reject(err);
                        return;
                    }

                    resolve(point);
                });
        });


    }



    async findByTripId(id: IdType): Promise<Point[]> {

        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.points WHERE _ownerTripId =?', [id], (err, rows, fields) => {
                if (err) {
                    console.log(err)
                    reject(err);
                    return;
                }
                if (rows) {

                    const points = rows;
                    resolve(points.map(point => ({
                        ...point,
                        imageFile: point.imageFile ? point.imageFile.split(/[,\s]+/) : [],

                    })));


                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            })
        })
    }



    async deletePointById(id: IdType): Promise<Point> {

        let pointDel;

        return new Promise((resolve, reject) => {
            this.pool.query(selectOne, [id], (err, rows, fields) => {
                if (err) {
                    console.log(err)
                    reject(err);
                    return;
                }
                if (rows.length === 1) {
                    deleteOne
                    pointDel = rows[0];
                    this.pool.query(deleteOne, [id], (err, rows, fields) => {
                        if (err) {
                            console.log(err)
                            reject(err);
                            return;
                        }
                        if (!err) {
                            resolve(pointDel);

                        }

                    })


                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            })
        })
    }


    async deletePointByTripId(id: IdType): Promise<Point[]> {

        let pointsDel;

        return new Promise((resolve, reject) => {
            this.pool.query(selectByOwnerId, [id], (err, rows, fields) => {
                if (err) {
                    console.log(err)
                    reject(err);
                    return;
                }
                if (rows.length > 0) {
                    deleteOne
                    pointsDel = rows;
                    this.pool.query(deleteByOTripId, [id], (err, rows, fields) => {
                        if (err) {
                            console.log(err)
                            reject(err);
                            return;
                        }
                        if (!err) {
                            resolve(pointsDel);

                        }

                    })


                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            })
        })
    }






    async getPointById(id: IdType): Promise<Point> {

        return new Promise((resolve, reject) => {
            this.pool.query('SELECT * FROM hack_trip.points WHERE _id =?', [id], (err, rows, fields) => {
                if (err) {
                    console.log(err)
                    reject(err);
                    return;
                }
                if (rows.length == 1) {

                    const point = rows[0];
                    resolve({
                        ...point,
                        imageFile: point.imageFile ? point.imageFile.split(/[,\s]+/) : point.imageFile !== null && point.imageFile.length > 0 ? point.imageFile.split('') : [],

                    });


                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            })
        })
    }



    async updatePointById(id: IdType, point: Point): Promise<Point> {
        let editedImg = point.imageFile.join()
        
        return new Promise((resolve, reject) => {
            this.pool.query(updateSql, [point.name, point.description, point.imageUrl, point.lat, point.lng, point.pointNumber, editedImg, id], (err, rows, fields) => {
                if (err) {
                    console.log(err)
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



    async updatePointPositionById(id: IdType, pointPosition: IdType): Promise<Point> {

        return new Promise((resolve, reject) => {

            this.pool.query(updatePositionSql, [pointPosition, id], (err, rows, fields) => {
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

    async editImagesByPointId(id: IdType, data: Point): Promise<Point> {

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
                                imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [],
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



    async findBytripIdOrderByPointPosition(id: IdType): Promise<Point[]> {

        return new Promise((resolve, reject) => {
            this.pool.query(findBytripIdOrderByPointPositionSql, [id], (err, rows, fields) => {
                if (err) {
                    console.log(err)
                    reject(err);
                    return;
                }
                if (rows) {
                
                    resolve(rows.map(row => ({
                        ...row,
                        imageFile: row.imageFile ? row.imageFile.split(/[,\s]+/) : [],

                    })));


                } else {

                    reject(new Error(`Error finding new document in database`));
                }
            })
        })
    }

}



