import * as express from 'express'
import { ITripRepository } from '../interface/trip-repository'
import { Trip } from '../model/trip'
import * as multer from 'multer'
import * as path from 'path'
import * as fsPromises from 'fs/promises'





const tripController = express.Router()

export const storage = multer.diskStorage({
    destination: function (req, file, cb) {

        cb(null, path.join(__dirname, '../uploads/'));
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + file.originalname)
    }

})


export  const upload = multer({ storage })




tripController.post('/upload', upload.array('file', 12), function (req, res) {

    let files = req.files


    res.status(200).json(files)
})


tripController.get('/top', async (req, res) => {


    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo')

    const trips = await tripRepo.getTop()


    let sort = trips.sort((a, b) => b.likes.length - a.likes.length)

    if (sort.length > 5) {
        sort = sort.slice(0, 5)
    }
    res.json(sort)

})

tripController.post('/', async (req, res) => {

    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo')



    try {

        const trip = await tripRepo.create(req.body)
        res.status(200).json(trip)
    } catch (err) {
        res.json(err.message)
    }
})



tripController.get('/', async (req, res) => {


    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo')

    try {

        const trips = await tripRepo.getAll()
        res.status(200).json(trips)
    } catch (err) {
        res.json(err.message)
    }


})



tripController.get('/:id', async (req, res) => {


    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo')

    try {

        const trip = await tripRepo.getTripById(req.params.id)
        res.status(200).json(trip)
    } catch (err) {
        res.status(400).json(err.message)
    }




})



tripController.delete('/:id', async (req, res) => {

    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo')


    try {

        const result = await tripRepo.deleteTrypById(req.params.id)



        let images
        images = result.imageFile
        images.split(',').map((x) => {
            const filePath = path.join(__dirname, `../uploads/${x}`)
            try {

                deleteFile(filePath)
            } catch (err) {
                console.log(err)
            }

        })


        res.json(result).status(204)
    } catch (err) {
        res.status(400).json(err.message)
    }
})



tripController.get('/my-trips/:id', async (req, res) => {
    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo')

    try {
        const trips = await tripRepo.getAllMyTrips(req.params.id)

        res.json(trips)
    } catch (err) {
        res.status(400).json(err.message)
    }

})


tripController.put('/:id', async (req, res) => {

    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo')


    try {

        const existing = await tripRepo.getTripById(req.params.id)

        try {

            const result = await tripRepo.updateTripById(req.params.id, req.body)

            res.json(result)
        } catch (err) {

            res.status(400).json(err.message)
        }
    } catch (err) {

        res.status(400).json(err.message)
    }

})


tripController.put('/like/:id', async (req, res) => {

    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo')

    try {

        const existing = await tripRepo.getTripById(req.params.id)

        try {
            const result = await tripRepo.updateTripLikeByuserId(req.params.id, req.body)

            res.json(result)
        } catch (err) {

            res.status(400).json(err.message);
        }
    } catch (err) {
        res.status(400).json(err.message);
    }

})


tripController.put('/report/:id', async (req, res) => {
    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo')

    try {

        const existing = await tripRepo.getTripById(req.params.id)

        try {
            const result = await tripRepo.reportTripByuserId(req.params.id, req.body)

            res.json(result)
        } catch (err) {
            res.status(400).json(err.message);
        }
    } catch (err) {
        res.status(400).json(err.message);
    }
})





tripController.put('/edit-images/:id', async (req, res) => {
    const tripRepo: ITripRepository<Trip> = req.app.get('tripsRepo')



    try {

        const existing = await tripRepo.getTripById(req.params.id)
        const fileName = req.body[0]
        const filePath = path.join(__dirname, `../uploads/${fileName}`)

        const index = existing.imageFile?.indexOf(fileName)

        const editedListImage = existing?.imageFile

        editedListImage.splice(index, 1)

        existing.imageFile = editedListImage

        try {
            deleteFile(filePath)
            const result = await tripRepo.editImagesByTripId(req.params.id, existing)

            res.json(result)

        } catch (err) {

            res.status(400).json(err.message);
        }
    } catch (err) {




        res.status(400).json(err.message);

    }
})



const deleteFile = async (filePath) => {
    try {
        await fsPromises.unlink(filePath)
        console.log('File deleted')
    } catch (err) {
        console.log(err)
    }
}


export default tripController