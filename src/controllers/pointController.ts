import * as express from 'express'
import { IPointTripRepository } from '../interface/point-repository'
import { Point } from '../model/point'
import { upload } from './tripController'
import * as path from 'path'
import * as fsPromises from 'fs/promises'


const pointController = express.Router()






pointController.post('/upload', upload.array('file', 12), function (req, res) {

    let files = req.files




    res.status(200).json(files)
})


pointController.post('/', async (req, res) => {


    const pointRepo: IPointTripRepository<Point> = req.app.get('pointsRepo')
    try {

        const point = await pointRepo.create(req.body)
        res.status(200).json(point)
    } catch (err) {
        res.json(err.message)
    }
})




pointController.get('/:id', async (req, res) => {


    const pointRepo: IPointTripRepository<Point> = req.app.get('pointsRepo')

    try {

        const points = await pointRepo.findByTripId(req.params.id)
        res.status(200).json(points)
    } catch (err) {
        res.status(400).json(err.message)
    }


})


pointController.delete('/:id', async (req, res) => {

    const pointRepo: IPointTripRepository<Point> = req.app.get('pointsRepo')

    try {

        const ownerTrip = req.body.idTrip


        const result = await pointRepo.deletePointById(req.params.id)

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

        const points = await pointRepo.findBytripIdOrderByPointPosition(+ownerTrip)

        points.forEach(async (x, i) => {
           
            x.pointNumber = i + 1
            let newPoint = x


            const updated = await pointRepo.updatePointById(x._id, newPoint)
        })


         res.json(result).status(204)
    } catch (err) {
        res.status(400).json(err.message)
    }
})

pointController.get('/edit/:id', async (req, res) => {

    const pointRepo: IPointTripRepository<Point> = req.app.get('pointsRepo')


    try {

        const point = await pointRepo.getPointById(req.params.id)
        res.status(200).json(point)
    } catch (err) {
        res.status(400).json(err.message)
    }
})


pointController.put('/:id', async (req, res) => {

    const pointRepo: IPointTripRepository<Point> = req.app.get('pointsRepo')
    try {

        const existing = await pointRepo.getPointById(req.params.id)

        try {
            const result = await pointRepo.updatePointById(req.params.id, req.body)

            res.json(result)
        } catch (err) {
            res.status(400).json(err.message)
        }
    } catch (err) {
        res.status(400).json(err.message)
    }

})


pointController.put('/edit-position/:id', async (req, res) => {

    const pointRepo: IPointTripRepository<Point> = req.app.get('pointsRepo')

    try {

        const existing1 = await pointRepo.getPointById(req.body.currentCardId)
        const existing2 = await pointRepo.getPointById(req.body.upCurrentCardId)

        try {

            const result = await pointRepo.updatePointPositionById(req.body.currentCardId, req.body.currentIdNewPosition)
            const result1 = await pointRepo.updatePointPositionById(req.body.upCurrentCardId, req.body.upCurrentCardNewPosition)


            const points = await pointRepo.findByTripId(req.params.id)


            res.status(200).json(points)

        } catch (err) {
            res.status(400).json(err.message)
        }




    } catch (err) {
        res.status(400).json(err.message)
    }



})






pointController.delete('/trip/:id', async (req, res) => {
    const pointRepo: IPointTripRepository<Point> = req.app.get('pointsRepo')

    try {

        const result = await pointRepo.deletePointByTripId(req.params.id)

        res.json(result).status(204)
    } catch (err) {
        res.status(400).json(err.message)
    }
})




pointController.put('/edit-images/:id', async (req, res) => {
    const pointRepo: IPointTripRepository<Point> = req.app.get('pointsRepo')




    try {

        const existing = await pointRepo.getPointById(req.params.id)
        const fileName = req.body[0]
        const filePath = path.join(__dirname, `../uploads/${fileName}`)

        const index = existing.imageFile?.indexOf(fileName)

        const editedListImage = existing?.imageFile

        editedListImage.splice(index, 1)

        existing.imageFile = editedListImage

        try {
            deleteFile(filePath)
            const result = await pointRepo.editImagesByPointId(req.params.id, existing)

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




export default pointController
