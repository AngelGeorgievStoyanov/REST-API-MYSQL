import { Pool } from "mysql";
import { CloudImages } from "../model/trip";
import { ICloudImages } from "../interface/cloudService-repository";





export class CloudRepository implements ICloudImages<CloudImages> {
    constructor(protected pool: Pool) { }
    getAllImagesFromDB(): Promise<string[]> {
        return new Promise((resolve, reject) => {
            this.pool.query(`
            SELECT distinct
            trips.imageFile AS tripImageFile,
            points.imageFile AS pointImageFile,
            users.imageFile AS userImageFile
        FROM
            hack_trip.trips
        LEFT JOIN
            hack_trip.points ON trips._id = points._ownerTripId
        LEFT JOIN
            hack_trip.users ON trips._ownerId = users._id
            WHERE
            trips.imageFile IS NOT NULL AND trips.imageFile != '' AND
            points.imageFile IS NOT NULL AND points.imageFile != '' AND
            users.imageFile IS NOT NULL AND users.imageFile != '';
            `, (err, rows, fields) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }

              
                const imageFiles = [
                    ...rows.map(row => row.tripImageFile).filter(file => file && file.trim() !== '').map(file => file.split(/[,\s]+/)),
                    ...rows.map(row => row.pointImageFile).filter(file => file && file.trim() !== '').map(file => file.split(/[,\s]+/)),
                    ...rows.map(row => row.userImageFile).filter(file => file && file.trim() !== '').map(file => file.split(/[,\s]+/)),
                ].filter(files => files.length > 0);

                const mergedImageFiles = [].concat(...imageFiles);
                resolve(mergedImageFiles);
            });
        });
    }


}