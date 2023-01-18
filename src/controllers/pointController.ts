import * as express from 'express'
import { IPointTripRepository } from '../interface/point-repository'
import { Point } from '../model/point'



const pointController = express.Router()

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

        const result = await pointRepo.deletePointById(req.params.id)

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
            console.log(result)

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




export default pointController