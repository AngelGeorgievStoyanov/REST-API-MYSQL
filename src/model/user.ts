import { IdType } from "../interface/user-repository";





export interface IUser {

    email: string,
    firstName: string;
    lastName: string;
    password: string;
    timeCreated: string;
    timeEdited: string;
    lastTimeLogin: string,
    countOfLogs: string
}



export class User {

    constructor(
        public _id?: IdType,
        public email?: string,
        public firstName?: string,
        public lastName?: string,
        public hashedPassword?: string,
        public timeCreated?: Date,
        public timeEdited?: Date,
        public lastTimeLogin?: Date,
        public countOfLogs?: string

    ) { }
}






