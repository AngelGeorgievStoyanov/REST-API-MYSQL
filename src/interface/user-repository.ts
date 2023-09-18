
export type IdType = number | string;

export interface Identifiable {
    _id?: IdType;
    K?: number

}

export interface IUserRepository<T extends Identifiable> {

    create(entity: T): Promise<T>;

    findByEmail(id: IdType): Promise<T>;

    logout(token: IdType);

    login(id: IdType, count: IdType): Promise<T>;

    findById(id: IdType): Promise<T>;

    updateUser(id: IdType, entity: T): Promise<T>;

    updateUserAdmin(id: IdType, entity: T): Promise<T>;

    updateUserPass(id: IdType, entity: T): Promise<T>;

    editProfileImage(id: IdType, entity: string): Promise<T>;

    getAll(): Promise<T[]>;

    confirmRole(id: IdType, role: string): Promise<boolean>;

    confirmUserId(id: IdType): Promise<boolean>;

    updateUserverifyEmail(id: IdType, confirmation: boolean): Promise<T>;

    newUserPassword(id:IdType, password:string):Promise<T>;

    deletUserById(id:IdType):Promise<T>
}
