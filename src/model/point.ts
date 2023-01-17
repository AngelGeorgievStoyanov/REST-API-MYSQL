import { IdType } from "../interface/user-repository";


export class Point {
    id?: IdType
    constructor(
        public name: string,
        public description: string,
        public imageUrl: string,
        public _ownerTripId: string,
        public lat: string,
        public lng: string,
        public pointNumber: IdType

    ) { }
}
