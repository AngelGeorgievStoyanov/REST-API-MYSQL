import { IdType } from "../interface/user-repository";


export enum Transport {
    Car, Bus, Aircraft, 'Another type'
}

export enum TypeOfPeople {
    Family, 'Family with children', Friends, 'Another type'
}


export class Trip {
    _id?: IdType
    constructor(
        public title: string,
        public description: string,
        public price: number,
        public transport: Transport = Transport.Car,
        public countPeoples: number,
        public typeOfPeople: TypeOfPeople = TypeOfPeople.Family,
        public destination: string,
        public coments: string,
        public likes: string[],
        public _ownerId: string,
        public lat: number,
        public lng: number,
        public timeCreated: Date,
        public timeEdited: Date,
        public reportTrip: string[],
        public imageFile:string[],
        public favorites:string[],
       
    ) { }
}
