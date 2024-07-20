import * as express from 'express';
import { IPointTripRepository } from '../interface/point-repository';
import { Point } from '../model/point';
import * as multer from 'multer';
import { storage } from './tripController';
import { User } from '../model/user';
import { IUserRepository } from '../interface/user-repository';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { authenticateToken } from '../guard/jwt.middleware';

const pointController = express.Router();



pointController.post('/upload', authenticateToken, multer({ storage }).array('file', 12), function (req, res) {

    let files = req.files;


    res.status(200).json(files);
})

pointController.post('/', authenticateToken, async (req, res) => {

    const userRepo: IUserRepository<User> = req.app.get('usersRepo');
    try {
        const userId = req.body._ownerId;
        const user = await userRepo.findById(userId)
        try {
            const pointRepo: IPointTripRepository<Point> = req.app.get('pointsRepo');

            const point = await pointRepo.create(req.body);
            res.status(200).json(point);
        } catch (err) {
            console.log(err.message);
            res.status(400).json(err.message);
        }
    } catch (err) {
        console.log(err.message)
        res.status(400).json(err.message);

    }
})

pointController.delete('/trip/:id/:userId', authenticateToken, async (req, res) => {
    const pointRepo: IPointTripRepository<Point> = req.app.get('pointsRepo');
    const userRepo: IUserRepository<User> = req.app.get('usersRepo');

    try {
        const userId = req.params.userId;
        const pointId = req.params.id;
        const user = await userRepo.findById(userId)
        const point = await pointRepo.findByTripId(req.params.id);
       
        if (point.some((x) => x._ownerTripId !== pointId) || (user.role !== 'admin' && user.role !== 'manager')) {
            throw new Error(`Error finding document in database`)
        }
        if (point.length > 0) {
            try {
                const result = await pointRepo.deletePointByTripId(req.params.id);

                result.map((x) => {
                    let images = x.imageFile as any;
                    images.split(",").map((f) => {
                        const filePath = f;

                        try {
                            deleteFile(filePath);
                        } catch (err) {
                            console.log(err);
                        }
                    });
                });
                res.json(result).status(200);
            } catch (err) {
                console.log(err.message);
                res.status(400).json(err.message);
            }
        } else {
            res.json([]).status(200);
        }
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);
    }
})

pointController.get('/:id', authenticateToken, async (req, res) => {

    const pointRepo: IPointTripRepository<Point> = req.app.get('pointsRepo');
    try {
        const points = await pointRepo.findByTripId(req.params.id);
        points.map((point) => ({
            ...point,
            _ownerId: point._ownerId = ''
        }))
        res.status(200).json(points);
    } catch (err) {
        console.log(err.message)
        res.status(400).json(err.message);
    }
})

pointController.delete('/:id', authenticateToken, async (req, res) => {

    const pointRepo: IPointTripRepository<Point> = req.app.get('pointsRepo');
    const userRepo: IUserRepository<User> = req.app.get('usersRepo');

    try {
        const pointId = req.params.id
        const userId = req.body.userId;
        const ownerTrip = req.body.idTrip;

        const user = await userRepo.findById(userId)
        const point = await pointRepo.findById(pointId)

        if (userId !== point._ownerId || (user.role !== 'admin' && user.role !== 'manager')) {
            throw new Error(`Error finding document in database`)
        }

        const result = await pointRepo.deletePointById(req.params.id);

        let images;
        images = result.imageFile;
        images.split(',').map((x) => {
            const filePath = x
            try {

                deleteFile(filePath);
            } catch (err) {
                console.log(err);
            }
        })

        const points = await pointRepo.findBytripIdOrderByPointPosition(ownerTrip);

        points.forEach(async (x, i) => {
            x.pointNumber = i + 1;
            let newPoint = x;
            const updated = await pointRepo.updatePointById(x._id, newPoint);
        })
        res.json(result).status(204);
    } catch (err) {
        console.log(err.message)
        res.status(400).json(err.message);
    }
})

pointController.get('/edit/:id', authenticateToken, async (req, res) => {
    const pointRepo: IPointTripRepository<Point> = req.app.get('pointsRepo');
    try {
        const point = await pointRepo.getPointById(req.params.id);
        point._ownerId = '';
        res.status(200).json(point);
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);
    }
})

pointController.put('/edit-position/:id', authenticateToken, async (req, res) => {

    const pointRepo: IPointTripRepository<Point> = req.app.get('pointsRepo');

    try {

        const existing1 = await pointRepo.getPointById(req.body.currentCardId);
        const existing2 = await pointRepo.getPointById(req.body.upCurrentCardId);

        try {

            const result = await pointRepo.updatePointPositionById(req.body.currentCardId, req.body.currentIdNewPosition);
            const result1 = await pointRepo.updatePointPositionById(req.body.upCurrentCardId, req.body.upCurrentCardNewPosition);

            const points = await pointRepo.findByTripId(req.params.id);

            res.status(200).json(points);

        } catch (err) {
            console.log(err.message);
            res.status(400).json(err.message);
        }

    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);
    }


})

pointController.put('/:id', authenticateToken, async (req, res) => {

    const userRepo: IUserRepository<User> = req.app.get('usersRepo');

    try {
        const ownerTrip = req.body._ownerId;
        const user = await userRepo.findById(ownerTrip)

        try {
            const pointRepo: IPointTripRepository<Point> = req.app.get('pointsRepo');

            const existing = await pointRepo.getPointById(req.params.id);

            try {
                const result = await pointRepo.updatePointById(req.params.id, req.body);
                res.status(200).json(result);
            } catch (err) {
                console.log(err.message);
                res.status(400).json(err.message);
            }
        } catch (err) {
            console.log(err.message);
            res.status(400).json(err.message);
        }
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);
    }
})

pointController.put('/edit-images/:id', authenticateToken, async (req, res) => {

    const pointRepo: IPointTripRepository<Point> = req.app.get('pointsRepo');


    try {

        const existing = await pointRepo.getPointById(req.params.id);
        const fileName = req.body[0];
        const filePath = fileName;

        const index = existing.imageFile?.indexOf(fileName);

        const editedListImage = existing?.imageFile;

        editedListImage.splice(index, 1);

        existing.imageFile = editedListImage;

        try {
            deleteFile(filePath)
            const result = await pointRepo.editImagesByPointId(req.params.id, existing);

            res.json(result);

        } catch (err) {
            console.log(err.message);
            res.status(400).json(err.message);
        }
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);

    }
})

pointController.use(routeNotFoundLogsMiddleware);


const deleteFile = async (filePath: string) => {
    try {
        await storage.bucket('hack-trip')
            .file(filePath)
            .delete();
        console.log('File deleted from POINT');
    } catch (err) {
        console.log(err.message);
    }
}

export default pointController
