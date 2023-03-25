import { IdType } from "../interface/user-repository";





export interface IUser {

    email: string,
    firstName: string;
    lastName: string;
    password: string;
    timeCreated: string;
    timeEdited: string;
    lastTimeLogin: string,
    countOfLogs: string;
    imageFile: string;
    role: string;
    status: string;
    verifyEmail: boolean;
}



export class User {

    constructor(
        public email: string,
        public firstName: string,
        public lastName: string,
        public hashedPassword: string,
        public timeCreated: Date,
        public timeEdited: Date,
        public lastTimeLogin: Date,
        public countOfLogs: string,
        public verifyEmail: boolean | number,
        public role: string,
        public _id?: IdType,
        public imageFile?: string,
        public status?: string,

    ) { }
}






