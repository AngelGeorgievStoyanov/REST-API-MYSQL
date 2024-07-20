import * as express from 'express';
import { ITripRepository } from '../interface/trip-repository';
import { Trip } from '../model/trip';
import * as multer from 'multer';
import * as path from 'path';
import { MulterGoogleCloudStorage } from '@duplexsi/multer-storage-google-cloud';
import { User } from '../model/user';
import { IUserRepository } from '../interface/user-repository';
import { Storage } from '@google-cloud/storage';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { authenticateToken } from '../guard/jwt.middleware';

const tripController = express.Router();


const storageGoogle = new Storage();




export const storage = new MulterGoogleCloudStorage({
    bucketName: 'hack-trip',
    keyFilename: path.join(__dirname, '../utils/hack-trip-414441f1b5d4.json'),
    destination: (req, f, cb) => cb(null, Date.now() + Math.random().toString().slice(-3) + `${f.originalname}`),

});


tripController.post('/upload', authenticateToken, multer({ storage, limits: { fieldSize: 50000000 } }).array('file', 12), function (req, res) {

    let files = req.files;


    res.status(200).json(files);
});


tripController.get('/top/:id', async (req, res) => {

    const userId = req.params.id


    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');
    try {

        const trips = await tripRepo.getTop();


        let sort = trips.sort((a, b) => b.likes.length - a.likes.length);

        sort.map((trip) => ({
            ...trip,
            _ownerId: trip._ownerId === userId ? trip._ownerId = userId : trip._ownerId = '',
            likes: trip.likes = [trip.likes.length.toString()],
            reportTrip: trip.reportTrip = [trip.reportTrip.length.toString()],
            favorites: trip.favorites = []
        }))

        if (sort.length > 5) {
            sort = sort.slice(0, 5);
        }
        res.status(200).json(sort);
    } catch (err) {
        console.log(err.message)
        res.status(400).json(err.message);
    }

})


tripController.post('/', authenticateToken, async (req, res) => {
    const userRepo: IUserRepository<User> = req.app.get('usersRepo');
    try {
        const userId = req.body._ownerId;
        const user = await userRepo.findById(userId);
        try {
            const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');
            const trip = await tripRepo.create(req.body);
            res.status(200).json(trip);
        } catch (err) {
            console.log(err.message);
            res.status(400).json(err.message);
        }
    } catch (err) {
        console.log(err.message);
        res.status(401).json(err.message);
    }
})


tripController.get('/', async (req, res) => {

    const search = req.query.search.toString();
    const typegroup = req.query.typegroup.toString();
    const typetransport = req.query.typetransport.toString();

    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');

    try {

        const trips = await tripRepo.getAll(search, typegroup, typetransport);

        const pages = Math.ceil(trips.length / 8);
        res.status(200).json(pages);
    } catch (err) {
        console.log(err.message)
        res.status(400).json(err.message);
    }


});


tripController.get('/background', async (req, res) => {
    try {
        const list = await listBackground();
        res.status(200).json(list);
    } catch (err) {
        console.log(err.message)
        res.status(400).json(err.message);
    }
});


tripController.get('/paginate', async (req, res) => {

    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');
    const page = Number(req.query.page);
    const search = req.query.search.toString();
    const typegroup = req.query.typegroup.toString();
    const typetransport = req.query.typetransport.toString();
    const userId = req.query.userId !== undefined ? req.query.userId.toString() : '';



    try {
        const paginatane = await tripRepo.getPagination(page, search, typegroup, typetransport);

        paginatane.map((page) => ({
            ...page,
            _ownerId: page._ownerId === userId ? page._ownerId = userId : page._ownerId = '',
            likes: page.likes = [page.likes.length.toString()],
            reportTrip: page.reportTrip = [page.reportTrip.length.toString()],
            favorites: page.favorites = []
        }));


        res.status(200).json(paginatane);
    } catch (err) {
        console.log(err.message)
        res.status(400).json(err.message);
    }


});


tripController.get('/reports/:id', authenticateToken, async (req, res) => {

    const userRepo: IUserRepository<User> = req.app.get('usersRepo');

    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');



    try {

        const user = await userRepo.findById(req.params.id);

        if (user.role !== 'admin' && user.role !== 'manager') {
            throw new Error(`Error finding new document in database`)
        }

        try {

            const trips = await tripRepo.getAllReports();
            trips.map((trip) => ({
                ...trip,
                likes: trip.likes = [trip.likes.length.toString()],
                favorites: trip.favorites = []
            }));
            res.status(200).json(trips);
        } catch (err) {
            throw new Error(err.message);
        }
    } catch (err) {
        console.log(err.message)
        res.status(400).json(err.message);
    }

})

tripController.get('/my-trips/:id', authenticateToken, async (req, res) => {
    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');
    const userId = req.params.id;

    try {
        const trips = await tripRepo.getAllMyTrips(req.params.id);
        trips.map((trip) => ({
            ...trip,
            _ownerId: trip._ownerId === userId ? trip._ownerId = userId : trip._ownerId = '',
            likes: trip.likes.length > 0 ? trip.likes = [trip.likes.length.toString()] : [],
            favorites: trip.favorites = []
        }));
        res.json(trips);
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);
    }

})


tripController.get('/favorites/:id', authenticateToken, async (req, res) => {
    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');
    const userId = req.params.id;
    try {
        const trips = await tripRepo.getAllMyFavorites(req.params.id);

        trips.map((trip) => ({
            ...trip,
            _ownerId: trip._ownerId === userId ? trip._ownerId = userId : trip._ownerId = '',
            likes: trip.likes.length > 0 ? trip.likes = [trip.likes.length.toString()] : [],
            favorites: trip.favorites = []
        }));

        res.json(trips);
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);
    }

})

tripController.get('/:id/:userId', authenticateToken, async (req, res) => {



    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');

    const userRepo: IUserRepository<User> = req.app.get('usersRepo');

    try {
        const userId = req.params.userId;
        const user = await userRepo.findById(userId)
        const trip = await tripRepo.getTripById(req.params.id);
        if (user.role === 'admin' || user.role === 'manager') {
            // you can see trip._ownerId
        } else if (trip._ownerId !== userId) {
            trip._ownerId = '';
        }
        if (trip.likes.includes(userId)) {
            trip.likes = [userId]
        } else {
            trip.likes = []
        }
        if (trip.favorites.includes(userId)) {
            trip.favorites = [userId]
        } else {
            trip.favorites = []
        }

        res.status(200).json(trip);
    } catch (err) {
        console.log(err);
        res.status(400).json(err.message);
    }


})


tripController.delete('/:id/:userId', authenticateToken, async (req, res) => {

    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');

    const userRepo: IUserRepository<User> = req.app.get('usersRepo');

    try {
        const userId = req.params.userId;
        const user = await userRepo.findById(userId)
        const trip = await tripRepo.getTripById(req.params.id);

        if (userId !== trip._ownerId || (user.role !== 'admin' && user.role !== 'manager')) {
            throw new Error(`Error finding document in database`)
        }

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
            result.favorites = [];
            result.likes = [];

            res.json(result).status(200);
        } catch (err) {
            console.log(err.message);
            res.status(400).json(err.message);
        }
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);
    }
})


tripController.put('/like/:id', authenticateToken, async (req, res) => {

    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');
    const userRepo: IUserRepository<User> = req.app.get('usersRepo');

    try {

        const userId = req.body.userId;
        const user = await userRepo.findById(userId)
        const existing = await tripRepo.getTripById(req.params.id);

        if (existing.likes.includes(userId)) {

            const index = existing.likes.indexOf(userId);
            existing.likes.splice(index, 1);
        } else {
            existing.likes.push(userId);
        }

        try {
            const result = await tripRepo.updateTripLikeByuserId(req.params.id, existing);
            if (result.likes.includes(userId)) {
                result.likes = [userId];
            } else {
                result.likes = [];
            }
            result.favorites = [];
            result._ownerId = '';
            res.json(result);
        } catch (err) {
            console.log(err.message);
            res.status(400).json(err.message);
        }
    } catch (err) {
        console.log(err.message)
        res.status(400).json(err.message);
    }

});

tripController.put('/favorites/:id', authenticateToken, async (req, res) => {
    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');
    try {

        const existing = await tripRepo.getTripById(req.params.id);
        try {
            const result = await tripRepo.updateTripFavoritesByuserId(req.params.id, req.body);
            result.likes = [];
            result.favorites = [];
            result._ownerId = '';
            res.json(result);
        } catch (err) {
            res.status(400).json(err.message);
        }
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);
    }
});


tripController.put('/details/:id/:userId', authenticateToken, async (req, res) => {
    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo');
    const userRepo: IUserRepository<User> = req.app.get('usersRepo');


    try {
        const userId = req.params.userId;

        const trip = await tripRepo.getTripById(req.params.id);
        const user = await userRepo.findById(userId)
        if (userId !== trip._ownerId && (user.role !== 'admin' && user.role !== 'manager')) {
            throw new Error(`Error finding document in database`)
        }

        try {
            const result = await tripRepo.updateTripById(req.params.id, req.body);
            result.likes = [];
            result.favorites = [];
            res.status(200).json(result);
        } catch (err) {
            console.log(err.message);
            res.status(400).json(err.message);
        }
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);
    }

});

tripController.put('/report/:id', authenticateToken, async (req, res) => {
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
        console.log(err.message);
        res.status(400).json(err.message);
    }
});


tripController.put('/admin/delete-report/:id', authenticateToken, async (req, res) => {
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
        console.log(err.message);
        res.status(400).json(err.message);
    }
})


tripController.put('/edit-images/:id', authenticateToken, async (req, res) => {

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
            console.log(err.message);
            res.status(400).json(err.message);
        }
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);

    }
});


tripController.use(routeNotFoundLogsMiddleware);



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

const listBackground = async function listFiles() {
    try {
        let [files] = await storageGoogle.bucket('hack-trip-background-images').getFiles();
        return files.map((x) => { return x.name });
    } catch (err) {
        console.log(err.message);
    }
}


export default tripController;