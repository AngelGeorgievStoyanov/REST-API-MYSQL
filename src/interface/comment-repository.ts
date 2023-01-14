import { Identifiable, IdType } from "./user-repository";




export interface ICommentTripRepository<T extends Identifiable> {

    create(entity: T): Promise<T>;
    getCommentById(id: IdType): Promise<T>;
    getCommentsByTripId(id: IdType): Promise<T[]>;
    updateCommentById(id: IdType, entity: T): Promise<T>;
    deleteCommentById(id: IdType): Promise<T>;
    deleteCommentByOwnerId(id: IdType):void;

}
