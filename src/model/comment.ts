import { IdType } from "../interface/user-repository";


export class Comment {
    _id?: IdType
    constructor(
        public nameAuthor: string,
        public comment: string,
        public _tripId: string,
        public _ownerId: string,

    ) { }
}
