import { Pool } from "mysql";
import { CloudImages } from "../model/trip";
import { ICloudImages } from "../interface/cloudService-repository";





export class CloudRepository implements ICloudImages<CloudImages> {
    constructor(protected pool: Pool) { }
    getAllImagesFromDB(): Promise<string[]> {
        return new Promise((resolve, reject) => {
            this.pool.query(`
            SELECT imageFile FROM hack_trip.trips WHERE imageFile IS NOT NULL
            UNION
            SELECT imageFile FROM hack_trip.points WHERE imageFile IS NOT NULL
            UNION
            SELECT imageFile FROM hack_trip.users WHERE imageFile IS NOT NULL;
            `, (err, rows, fields) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }
                const imageFiles = [
                    ...rows.map(row => row.imageFile).filter(file => file && file.trim() !== '').map(file => file.split(/[,\s]+/)),
                ].filter(files => files.length > 0);

                const mergedImageFiles = [].concat(...imageFiles);
                resolve(mergedImageFiles);
            });
        });
    }


}