import * as express from 'express';
import { Storage } from '@google-cloud/storage';
import { ICloudImages } from '../interface/cloudService-repository';
import { CloudImages } from '../model/trip';
import { IUserRepository } from '../interface/user-repository';
import { User } from '../model/user';

const cloudController = express.Router();
const storageGoogle = new Storage();

cloudController.get('/cloud-images/:userId', async (req, res) => {
    const userRepo: IUserRepository<User> = req.app.get('usersRepo');
    try {

        const user = await userRepo.findById(req.params.userId);
        if (user.role !== 'admin' && user.role !== 'manager') {
            throw new Error(`Error finding document in database`)
        }
        try {
            const cloudImageNames = await listCloudImages(storageGoogle);
            res.status(200).json(cloudImageNames);
        } catch (err) {
            console.log(err.message);
            res.status(500).json('Internal Server Error');
        }
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);
    }
});


cloudController.get('/db-images/:userId', async (req, res) => {
    const imagesRepo: ICloudImages<CloudImages> = req.app.get('imagesRepo');

    const userRepo: IUserRepository<User> = req.app.get('usersRepo');

    try {

        const user = await userRepo.findById(req.params.userId);
        if (user.role !== 'admin' && user.role !== 'manager') {
            throw new Error(`Error finding document in database`)
        }
        try {
            const dbImageNames = await imagesRepo.getAllImagesFromDB();
            res.status(200).json(dbImageNames);
        } catch (err) {
            console.log(err.message);
            res.status(500).json('Internal Server Error');
        }
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);
    }
});

cloudController.get('/unique-images/:userId', async (req, res) => {
    const userRepo: IUserRepository<User> = req.app.get('usersRepo');
    try {

        const user = await userRepo.findById(req.params.userId);
        if (user.role !== 'admin' && user.role !== 'manager') {
            throw new Error(`Error finding document in database`)
        }


        const imagesRepo: ICloudImages<CloudImages> = req.app.get('imagesRepo');
        let allCloudImages: any[];
        let allDBImages: string[];
        try {
            allCloudImages = await listCloudImages(storageGoogle);
            allCloudImages = allCloudImages.map(image => image.name);

        } catch (err) {
            console.log(err.message);
            res.status(500).json('Internal Server Error');
        }
        try {
            allDBImages = await imagesRepo.getAllImagesFromDB();

        } catch (err) {
            console.log(err.message);
            res.status(500).json('Internal Server Error');
        }
        if (allCloudImages.length > 0 && allDBImages.length > 0) {

            const dbOnlyImages = allDBImages.filter(image => !allCloudImages.includes(image));
            const cloudOnlyImages = allCloudImages.filter(image => !allDBImages.includes(image));
            res.status(200).json({ dbOnlyImages, cloudOnlyImages });
        }
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);
    }

})


export async function listCloudImages(storage: Storage): Promise<any[]> {
    const bucketName = 'hack-trip';
    const [files] = await storage.bucket(bucketName).getFiles();

  const images = files.filter((file) => !file.name.endsWith('/')).map((file) => ({
      name: file.name,
      generation: file.metadata.generation,
      timeCreated: file.metadata.timeCreated,
      updated: file.metadata.updated,
      timeStorageClassUpdated: file.metadata.timeStorageClassUpdated,
    }));

    return images;
}



export default cloudController;
