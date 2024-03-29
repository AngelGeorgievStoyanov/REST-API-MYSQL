import { Identifiable, IdType } from "./user-repository";




export interface IPointTripRepository<T extends Identifiable> {

    create(entity: T): Promise<T>;
    findByTripId(id: IdType): Promise<T[]>;
    deletePointById(id: IdType): Promise<T>;
    deletePointByTripId(id: IdType): Promise<T[]>
    getPointById(id: IdType): Promise<T>;
    updatePointById(id: IdType, entity: T): Promise<T>;
    updatePointPositionById(id: IdType, position: IdType): Promise<T>;
    editImagesByPointId(id: IdType, entity: T): Promise<T>;
    findBytripIdOrderByPointPosition(id:IdType):Promise<T[]>;
    findById(id: IdType): Promise<T>;
}
