import * as express from 'express'

import { body, validationResult } from 'express-validator';
import { User } from '../model/user';
import * as jwt from 'jsonwebtoken'
import * as bcrypt from 'bcrypt'
import { IdType, IUserRepository } from '../interface/user-repository';
import { upload } from './tripController';
import * as path from 'path'
import * as fsPromises from 'fs/promises'

const secret = 'very_secret!!!!';






const authController = express.Router();


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

        if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
            throw new Error(`Your profile status is ${user.status}`);

        }



        const token = createToken(user)

        try {
            const result = await userRepo.login(user._id, user.countOfLogs)

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



authController.get('/profile/:id', async (req, res) => {
    const userRepo: IUserRepository<User> = req.app.get('usersRepo')

    try {

        const user = await userRepo.findById(req.params.id)
        res.status(200).json(user)

    } catch (err) {
        console.log(err.message)
        res.status(401).json(err.message)
    }

})


authController.post('/confirmpassword/:id', async (req, res) => {
    const userRepo: IUserRepository<User> = req.app.get('usersRepo')


    try {
        const user = await userRepo.findById(req.params.id)
        const match = await bcrypt.compare(req.body.password, user.hashedPassword)
        if (!match) {
            throw new Error('Incorrect  password');
        }
        res.status(200).json(user)


    } catch (err) {
        console.log(err)
        res.status(401).json(err.message)
    }
})



authController.put('/admin/edit/:id', async (req, res) => {
    const userRepo: IUserRepository<User> = req.app.get('usersRepo')
    const id = req.params.id


    try {

        const user = await userRepo.findById(req.params.id)


        try {



            if (req.body.imageFile === undefined) {
                req.body.imageFile = user.imageFile
            } else {

                if (user.imageFile !== null) {
                    const filePath = path.join(__dirname, `../uploads/${user.imageFile}`)

                    try {

                        deleteFile(filePath)
                    } catch (err) {
                        console.log(err)
                    }
                }
            }



            const editedUser = await userRepo.updateUserAdmin(id, req.body)


            res.status(200).json(editedUser)





        } catch (err) {
            console.log(err)
        }

    } catch (err) {
        console.log(err.message)
        res.status(401).json(err.message)
    }

})




authController.put('/edit/:id', async (req, res) => {
    const userRepo: IUserRepository<User> = req.app.get('usersRepo')
    const id = req.params.id


    try {

        const user = await userRepo.findById(req.params.id)


        try {
            if (req.body.password !== undefined) {

                if (req.body.password.length > 0 && req.body.oldpassword.length > 0 && req.body.confirmpass.length > 0) {
                    if (req.body.imageFile === undefined) {
                        req.body.imageFile = user.imageFile
                    } else {

                        const filePath = path.join(__dirname, `../uploads/${user.imageFile}`)

                        if (filePath !== null) {

                            try {

                                deleteFile(filePath)
                            } catch (err) {
                                console.log(err)
                            }
                        }
                    }
                }


                const editedUserPassword = await userRepo.updateUserPass(id, req.body)
                res.status(200).json(editedUserPassword)

            } else {
                if (req.body.imageFile === undefined) {
                    req.body.imageFile = user.imageFile
                } else {

                    if (user.imageFile !== null) {
                        const filePath = path.join(__dirname, `../uploads/${user.imageFile}`)

                        try {

                            deleteFile(filePath)
                        } catch (err) {
                            console.log(err)
                        }
                    }
                }
                const editedUser = await userRepo.updateUser(id, req.body)


                res.status(200).json(editedUser)

            }



        } catch (err) {
            console.log(err)
        }

    } catch (err) {
        console.log(err.message)
        res.status(401).json(err.message)
    }

})



function createToken(user) {
    const payload = {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
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



authController.post('/upload', upload.array('file', 1), function (req, res) {

    let files = req.files


    res.status(200).json(files)
})




authController.put('/delete-image/:id', async (req, res) => {
    const userRepo: IUserRepository<User> = req.app.get('usersRepo')



    try {

        const existing = await userRepo.findById(req.params.id)
        const fileName = req.body.image
        const filePath = path.join(__dirname, `../uploads/${fileName}`)


        try {
            deleteFile(filePath)
            const result = await userRepo.editProfileImage(req.params.id, fileName)

            res.json(result)

        } catch (err) {

            res.status(400).json(err.message);
        }
    } catch (err) {




        res.status(400).json(err.message);

    }
})


authController.get('/admin', async (req, res) => {


    const userRepo: IUserRepository<User> = req.app.get('usersRepo')


    try {

        const users = await userRepo.getAll()


        res.status(200).json(users)
    } catch (err) {
        res.json(err.message)
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



export default authController

