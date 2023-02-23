import * as express from 'express';
import { ITripRepository } from '../interface/trip-repository';
import { Trip } from '../model/trip';
import * as multer from 'multer';
import * as path from 'path';
import { MulterGoogleCloudStorage } from '@duplexsi/multer-storage-google-cloud';


const tripController = express.Router();


export const storage = new MulterGoogleCloudStorage({
    bucketName: 'hack-trip',
    keyFilename: path.join(__dirname, '../utils/hack-trip-414441f1b5d4.json'),
    destination: (req, f, cb) => cb(null, Date.now() + Math.random().toString().slice(-3) + `${f.originalname}`)
});



tripController.post('/upload', multer({ storage }).array('file', 12), function (req, res) {

    let files = req.files;


    res.status(200).json(files);
});

tripController.get('/top', async (req, res) => {


    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');

    const trips = await tripRepo.getTop();


    let sort = trips.sort((a, b) => b.likes.length - a.likes.length);

    if (sort.length > 5) {
        sort = sort.slice(0, 5);
    }
    res.status(200).json(sort);

})

tripController.post('/', async (req, res) => {

    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');



    try {

        const trip = await tripRepo.create(req.body);
        res.status(200).json(trip);
    } catch (err) {
        res.json(err.message);
    }
})



tripController.get('/', async (req, res) => {

    const search = req.query.search.toString();
    const typegroup = req.query.typegroup.toString();
    const typetransport = req.query.typetransport.toString();

    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');

    try {

        const trips = await tripRepo.getAll(search, typegroup, typetransport);

        const pages = Math.ceil(trips.length / 9);
        res.status(200).json(pages);
    } catch (err) {
        res.json(err.message);
    }


});



tripController.get('/paginate', async (req, res) => {

    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');
    const page = Number(req.query.page);
    const search = req.query.search.toString();
    const typegroup = req.query.typegroup.toString();
    const typetransport = req.query.typetransport.toString();

    try {
        const paginatane = await tripRepo.getPagination(page, search, typegroup, typetransport);

        res.status(200).json(paginatane);
    } catch (err) {
        res.json(err.message);
    }


});


tripController.get('/reports', async (req, res) => {


    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');

    try {

        const trips = await tripRepo.getAllReports();
        res.status(200).json(trips);
    } catch (err) {
        res.json(err.message);
    }


})

tripController.get('/:id', async (req, res) => {


    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');

    try {

        const trip = await tripRepo.getTripById(req.params.id);
        res.status(200).json(trip);
    } catch (err) {
        res.status(400).json(err.message);
    }




})


tripController.delete('/:id', async (req, res) => {

    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');


    try {

        const result = await tripRepo.deleteTrypById(req.params.id);
        let images;
        images = result.imageFile;
        images.split(',').map((x) => {
            const filePath = x;
            try {

                deleteFile(filePath);
            } catch (err) {
                console.log(err);
            }

        })


        res.json(result).status(204);
    } catch (err) {
        res.status(400).json(err.message);
    }
})


tripController.get('/my-trips/:id', async (req, res) => {
    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');

    try {
        const trips = await tripRepo.getAllMyTrips(req.params.id);

        res.json(trips);
    } catch (err) {
        res.status(400).json(err.message);
    }

})

tripController.get('/favorites/:id', async (req, res) => {
    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');
    try {
        const trips = await tripRepo.getAllMyFavorites(req.params.id);
        res.json(trips);
    } catch (err) {
        res.status(400).json(err.message);
    }

})

tripController.put('/:id', async (req, res) => {

    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');


    try {

        const existing = await tripRepo.getTripById(req.params.id);

        try {

            const result = await tripRepo.updateTripById(req.params.id, req.body);

            res.json(result);
        } catch (err) {

            res.status(400).json(err.message);
        }
    } catch (err) {

        res.status(400).json(err.message);
    }

});


tripController.put('/like/:id', async (req, res) => {

    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');

    try {

        const existing = await tripRepo.getTripById(req.params.id);

        try {
            const result = await tripRepo.updateTripLikeByuserId(req.params.id, req.body);

            res.json(result);
        } catch (err) {

            res.status(400).json(err.message);
        }
    } catch (err) {
        res.status(400).json(err.message);
    }

});

tripController.put('/favorites/:id', async (req, res) => {
    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');

    try {

        const existing = await tripRepo.getTripById(req.params.id);
        try {
            const result = await tripRepo.updateTripFavoritesByuserId(req.params.id, req.body);

            res.json(result);
        } catch (err) {
            res.status(400).json(err.message);
        }
    } catch (err) {
        res.status(400).json(err.message);
    }
});

tripController.put('/report/:id', async (req, res) => {
    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');

    try {

        const existing = await tripRepo.getTripById(req.params.id);

        try {
            const result = await tripRepo.reportTripByuserId(req.params.id, req.body);

            res.json(result);
        } catch (err) {
            res.status(400).json(err.message);
        }
    } catch (err) {
        res.status(400).json(err.message);
    }
});


tripController.put('/admin/delete-report/:id', async (req, res) => {
    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');

    try {

        const existing = await tripRepo.getTripById(req.params.id);

        try {
            const result = await tripRepo.deleteReportTripByuserId(req.params.id, req.body);

            res.json(result);
        } catch (err) {
            res.status(400).json(err.message);
        }
    } catch (err) {
        res.status(400).json(err.message);
    }
})


tripController.put('/edit-images/:id', async (req, res) => {

    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');


    try {

        const existing = await tripRepo.getTripById(req.params.id);
        const fileName = req.body[0];
        const filePath = fileName;

        const index = existing.imageFile?.indexOf(fileName);

        const editedListImage = existing?.imageFile;

        editedListImage.splice(index, 1);

        existing.imageFile = editedListImage;

        try {
            deleteFile(filePath);
            const result = await tripRepo.editImagesByTripId(req.params.id, existing);

            res.json(result);

        } catch (err) {

            res.status(400).json(err.message);
        }
    } catch (err) {

        res.status(400).json(err.message);

    }
});


const deleteFile = async (filePath) => {
    try {
        await storage.bucket('hack-trip')
            .file(filePath)
            .delete();
        console.log('File deleted from TRIP');
    } catch (err) {
        console.log(err.message);
    }
}


export default tripController