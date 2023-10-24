import { Identifiable } from "./user-repository";

export interface ICloudImages <T> {
    getAllImagesFromDB(): Promise<string[]>
}
