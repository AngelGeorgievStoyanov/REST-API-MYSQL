import { IdType } from "../interface/user-repository";


export class Comment {
    _id?: IdType
    constructor(
        public nameAuthor: string,
        public comment: string,
        public _tripId: string,
        public _ownerId: string,
        public reportComment: string[], 
        public timeCreated: string,
        public timeEdited: string,
        public countEdited: number
    ) { }
}
