import * as express from 'express';
import { ICommentTripRepository } from '../interface/comment-repository';
import { IUserRepository } from '../interface/user-repository';
import { Comment } from '../model/comment';
import { User } from '../model/user';



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


commentController.get('/trip/:id/:userId', async (req, res) => {

    const tripId = req.params.id;
    const userId = req.params.userId;
    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');

    try {

        const comments = await commentRepo.getCommentsByTripId(tripId);

        comments.map((comment) => ({
            ...comment,
            _ownerId: comment._ownerId === userId ? comment._ownerId = userId : comment._ownerId = ''
        }))

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


commentController.get('/image-user/:id', async (req, res) => {

    const commentId = req.params.id

    const userRepo: IUserRepository<User> = req.app.get('usersRepo');

    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');


    try {

        const comment = await commentRepo.getCommentById(commentId)

        if (comment._ownerId !== undefined && comment._ownerId !== null) {
            try {
                const userId = comment._ownerId
                const user = await userRepo.findById(userId)

                res.status(200).json(user.imageFile);

            } catch (err) {
                res.status(400).json(err.message);
            }
        }
    } catch (err) {
        res.status(400).json(err.message);
    }


})


export default commentController