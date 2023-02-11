import * as express from 'express';
import { ICommentTripRepository } from '../interface/comment-repository';
import { Comment } from '../model/comment';



const commentController = express.Router();


commentController.get('/reports', async (req, res) => {


    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');

    try {

        const comments = await commentRepo.getAllReports();

        res.status(200).json(comments);
    } catch (err) {
        res.json(err.message);
    }


})


commentController.post('/', async (req, res) => {

    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');
    try {

        const comment = await commentRepo.create(req.body);

        res.status(200).json(comment);
    } catch (err) {
        res.json(err.message);
    }
})



commentController.get('/:id', async (req, res) => {


    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');

    try {

        const comment = await commentRepo.getCommentById(req.params.id);
        res.status(200).json(comment);
    } catch (err) {
        res.status(400).json(err.message);
    }


})


commentController.get('/trip/:id', async (req, res) => {


    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');

    try {

        const comments = await commentRepo.getCommentsByTripId(req.params.id);

        res.status(200).json(comments);
    } catch (err) {
        res.status(400).json(err.message);
    }


})


commentController.put('/:id', async (req, res) => {
    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');

    try {

        const result = await commentRepo.updateCommentById(req.params.id, req.body);
        res.json(result);
    } catch (err) {
        res.status(400).json(err.message);
    }

})


commentController.delete('/trip/:id', async (req, res) => {

    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');

    const result = await commentRepo.deleteCommentByOwnerId(req.params.id);

    res.status(204).json(result);
})


commentController.delete('/:id', async (req, res) => {

    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');

    try {

        const result = await commentRepo.deleteCommentById(req.params.id);

        res.json(result).status(204);
    } catch (err) {
        res.status(400).json(err.message);

    }
})





commentController.put('/report/:id', async (req, res) => {
    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');


    try {

        const existing = await commentRepo.getCommentById(req.params.id);

        try {
            const result = await commentRepo.reportCommentByuserId(req.params.id, req.body);



            try {


                const comments = await commentRepo.getCommentsByTripId(req.body._tripId)
                res.json(comments);
            } catch (err) {
                res.status(400).json(err.message);
            }
        } catch (err) {
            res.status(400).json(err.message);
        }
    } catch (err) {
        res.status(400).json(err.message);
    }
});



commentController.put('/admin/delete-report/:id', async (req, res) => {


    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');



    try {

        const existing = await commentRepo.getCommentById(req.params.id);

        try {
            const result = await commentRepo.deleteReportCommentByuserId(req.params.id, req.body);

            res.json(result);
        } catch (err) {
            res.status(400).json(err.message);
        }
    } catch (err) {
        res.status(400).json(err.message);
    }
})



export default commentController