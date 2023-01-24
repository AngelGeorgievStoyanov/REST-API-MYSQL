import * as express from 'express'

import { body, validationResult } from 'express-validator';
import { User } from '../model/user';
import * as jwt from 'jsonwebtoken'
import * as bcrypt from 'bcrypt'
import { IdType, IUserRepository } from '../interface/user-repository';

const secret = 'very_secret!!!!';






const authController = express.Router()

authController.post('/login', async (req, res) => {

    const userRepo: IUserRepository<User> = req.app.get('usersRepo')

    try {

        const user = await userRepo.findByEmail(req.body.email)

        if (user.email !== req.body.email) {

            throw new Error('Incorrect email or password');
        }

        const match = await bcrypt.compare(req.body.password, user.hashedPassword)
        if (!match) {
            throw new Error('Incorrect email or password');
        }
        const token = createToken(user)

        try {
            const result = await userRepo.login(user._id, user.countOfLogs)
            console.log(result)

        } catch (err) {
            console.log(err)
            throw new Error(err)
        }

        res.status(200).json(token)
    } catch (err) {
        console.log(err.message)
        res.status(401).json(err.message)
    }
})





authController.post('/register', body('email').isEmail().withMessage('Invalid email'),


    body('password').isLength({ min: 3 }).withMessage('Password must be at least 3 characters long'),

    async (req, res) => {


        try {
            const errors = validationResult(req)

            if (!errors.isEmpty()) {


                throw errors
            }

        } catch (error) {
            res.status(400).json(error.message)
        }



        const userRepo: IUserRepository<User> = req.app.get('usersRepo')

        try {

            const existing = await userRepo.findByEmail(req.body.email)


            if (existing.email === req.body.email) {

                throw new Error('Email is taken');
            }


            try {

                const user = await userRepo.create(req.body);

                const token = createToken(user)

                res.status(201).json(token)
            } catch (err) {
                console.log(err)
                res.status(400).json(err.message)
            }


        } catch (err) {
            console.log(err)
            res.status(400).json(err.message)
        }

    })


function createToken(user) {
    const payload = {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
    };

    return {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        accessToken: jwt.sign(payload, secret)
    };
}


authController.post('/logout', async (req, res) => {

    const userRepo: IUserRepository<User> = req.app.get('usersRepo')

    if ('token' in req) {

        const token = req.token as IdType;
        await userRepo.logout(token);
    }

    res.json('Logout').status(204);
})


export default authController

