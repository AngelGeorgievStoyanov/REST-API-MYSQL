import { Identifiable, IdType } from "./user-repository";


export interface ITripRepository<T extends Identifiable> {
    getTop(): Promise<T[]>;
    getAll(search: string, typegroup: string, typetransport: string): Promise<T[]>;
    create(entity: T): Promise<T>;
    getTripById(id: IdType): Promise<T>;
    deleteTrypById(id: IdType): Promise<T>;
    getAllMyTrips(id: IdType): Promise<T[]>;
    updateTripById(id: IdType, entity: T): Promise<T>;
    updateTripLikeByuserId(id: IdType, entity: T): Promise<T>;
    reportTripByuserId(id: IdType, entity: T): Promise<T>;
    editImagesByTripId(id: IdType, entity: T): Promise<T>;
    getAllReports(): Promise<T[]>;
    deleteReportTripByuserId(id: IdType, entity: T): Promise<T>;
    updateTripFavoritesByuserId(id: IdType, entity: T): Promise<T>;
    getAllMyFavorites(id: IdType): Promise<T[]>;
    getPagination(page: number, search: string, typegroup: string, typetransport: string): Promise<T[]>;
  
}


