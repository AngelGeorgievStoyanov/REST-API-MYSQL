import * as express from 'express';
import { ICommentTripRepository } from '../interface/comment-repository';
import { IUserRepository } from '../interface/user-repository';
import { Comment } from '../model/comment';
import { User } from '../model/user';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { authenticateToken } from '../guard/jwt.middleware';


const commentController = express.Router();


commentController.get('/reports/:id', authenticateToken, async (req, res) => {

    const userRepo: IUserRepository<User> = req.app.get('usersRepo');

    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');


    try {

        const user = await userRepo.findById(req.params.id);

        if (user.role !== 'admin' && user.role !== 'manager') {
            throw new Error(`Error finding new document in database`)
        }

        try {

            const comments = await commentRepo.getAllReports();

            res.status(200).json(comments);
        } catch (err) {
            throw new Error(err.message);
        }

    } catch (err) {

        console.log(err.message)
        res.status(400).json(err.message);
    }
})


commentController.post('/', authenticateToken, async (req, res) => {

    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');
    try {

        const comment = await commentRepo.create(req.body);

        res.status(200).json(comment);
    } catch (err) {
        res.json(err.message);
    }
})



commentController.get('/:id', authenticateToken, async (req, res) => {


    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');

    try {

        const comment = await commentRepo.getCommentById(req.params.id);
        res.status(200).json(comment);
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);
    }


})


commentController.get('/trip/:id/:userId', authenticateToken, async (req, res) => {

    const tripId = req.params.id;
    const userId = req.params.userId;
    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');

    try {

        const comments = await commentRepo.getCommentsByTripId(tripId);

        comments.map((comment) => ({
            ...comment,
            _ownerId: comment._ownerId === userId ? comment._ownerId = userId : comment._ownerId = '',
            reportComment: comment.reportComment.includes(userId) ? comment.reportComment = [userId] : comment.reportComment = []
        }))

        res.status(200).json(comments);
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);
    }


})


commentController.put('/:id', authenticateToken, async (req, res) => {
    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');

    try {

        const result = await commentRepo.updateCommentById(req.params.id, req.body);
        res.json(result);
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);
    }

})


commentController.delete('/trip/:id/:userId', authenticateToken, async (req, res) => {

    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');
    try {

        const result = await commentRepo.deleteCommentByOwnerId(req.params.id);
        res.status(200).json(result);
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);
    }
})


commentController.delete('/:id', authenticateToken, async (req, res) => {

    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');

    try {

        const result = await commentRepo.deleteCommentById(req.params.id);

        res.status(200).json(result);
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);

    }
})


commentController.put('/report/:id', authenticateToken, async (req, res) => {
    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');


    try {

        const existing = await commentRepo.getCommentById(req.params.id);

        try {
            const result = await commentRepo.reportCommentByuserId(req.params.id, req.body);


            try {

                const comments = await commentRepo.getCommentsByTripId(req.body._tripId)
                res.status(200).json(comments);
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
});


commentController.put('/admin/report/:id', authenticateToken, async (req, res) => {
    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');


    try {

        const existing = await commentRepo.getCommentById(req.params.id);

        try {
            const result = await commentRepo.reportCommentByuserId(req.params.id, req.body);


            try {

                const comments = await commentRepo.getAllReports()
                res.json(comments);
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
});



commentController.put('/admin/delete-report/:id', authenticateToken, async (req, res) => {


    const commentRepo: ICommentTripRepository<Comment> = req.app.get('commentsRepo');



    try {

        const existing = await commentRepo.getCommentById(req.params.id);

        try {
            const result = await commentRepo.deleteReportCommentByuserId(req.params.id, req.body);

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


commentController.get('/image-user/:id', authenticateToken, async (req, res) => {

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
                console.log(err.message);
                res.status(400).json(err.message);
            }
        }
    } catch (err) {
        console.log(err.message);
        res.status(400).json(err.message);
    }


})

commentController.use(routeNotFoundLogsMiddleware);

export default commentController