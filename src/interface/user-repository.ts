
export type IdType = number | string

export interface Identifiable {
    _id?: IdType;

}

export interface IUserRepository<T extends Identifiable> {

    create(entity: T): Promise<T>;

    findByEmail(id: IdType): Promise<T>;

    logout(token: IdType);

    login(id: IdType, count: IdType): Promise<T>;

    findById(id: IdType): Promise<T>;

    updateUser(id: IdType, entity: T): Promise<T>;

    updateUserPass(id: IdType, entity: T): Promise<T>;

}
