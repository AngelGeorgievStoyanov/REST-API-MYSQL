import { Identifiable, IdType } from "./user-repository";


export interface IVerifyTokenRepository<T extends Identifiable> {

    create(token: string, userId: string): Promise<T>;

    findById(userId: string, token: string): Promise<T>;

}