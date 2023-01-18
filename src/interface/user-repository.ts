
export type IdType = number | string

export interface Identifiable {
    id?: IdType;

}

export interface IUserRepository<T extends Identifiable> {

    create(entity: T): Promise<T>;

    findByEmail(id: IdType): Promise<T>;

    logout(token:IdType)
}