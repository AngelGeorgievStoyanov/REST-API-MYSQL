export interface ICloudImages {
    getAllImagesFromDB(): Promise<string[]>
}
