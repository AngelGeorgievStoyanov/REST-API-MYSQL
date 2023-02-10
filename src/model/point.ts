import { IdType } from "../interface/user-repository";


export class Point {
    _id?: IdType
    constructor(
        public name: string,
        public description: string,
        public _ownerTripId: string,
        public lat: string,
        public lng: string,
        public pointNumber: IdType,
        public imageFile:string[],
        public _ownerId: string,
    ) { }
}
