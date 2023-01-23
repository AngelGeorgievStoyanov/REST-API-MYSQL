import { IdType } from "../interface/user-repository";





export interface IUser {


    email: string,
    firstName: string;
    lastName: string;
    password: string;

}



export class User {

    constructor(
        public _id?: IdType,
        public email?: string,
        public firstName?: string,
        public lastName?: string,
        public hashedPassword?: string,

    ) { }
}






