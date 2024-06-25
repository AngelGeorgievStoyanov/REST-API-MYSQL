import { Identifiable, IdType } from "./user-repository";


export interface IVerifyTokenRepository<T extends Identifiable> {

    create(token: string, userId: string): Promise<T>;

    findById(userId: string, token: string): Promise<T>;

    forgotPassword(token: string, userId: string): Promise<T>;

    findByIdAndVerifyTokenForgotPassword(token: string, userId: string): Promise<T>;

    findByUserId(userId: string): Promise<T>;

    updateVerifyToken(userId: string, verifyToken: string): Promise<T>;
    
    updateVerifyTokenForgotPassword(userId: string, verifyToken: string): Promise<T>;
}