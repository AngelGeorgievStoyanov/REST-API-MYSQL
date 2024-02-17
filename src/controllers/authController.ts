import * as express from 'express';
import { body, validationResult } from 'express-validator';
import { IUser, User } from '../model/user';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { IdType, IUserRepository } from '../interface/user-repository';
import { storage } from './tripController';
import * as multer from 'multer';
import * as dotenv from 'dotenv';
import sendMail from '../utils/sendEmail';
import { IVerifyTokenRepository } from '../interface/verifyToken-repository';
import { VerifyToken } from '../model/verifyToken';
import { CONNECTIONURL } from '../utils/baseUrl';
import * as ip from 'ip'
import { authenticateToken } from '../guard/jwt.middleware';
dotenv.config()


const secret = process.env.secret

const APP_URL = CONNECTIONURL



const authController = express.Router();

const loginAttempts = {};


authController.post('/login', async (req, res) => {


    const userRepo: IUserRepository<User> = req.app.get('usersRepo');
    try {
        const email = req.body.email;
        const maxLoginAttempts = 5;
        const lockoutTime = 10 * 60 * 1000;

        if (loginAttempts[email] && loginAttempts[email].attempts >= maxLoginAttempts) {
            const timeRemaining = lockoutTime - (Date.now() - loginAttempts[email].firstAttempt);
            const sec = Math.floor(timeRemaining / 1000);
            const min = Math.floor(sec / 60);
            if (timeRemaining > 0) {
                let str = (min === 0 ? '' : min % 60 + 'min : ') + (sec % 60 < 10 ? '0' + sec % 60 + 'sec' : sec % 60 + 'sec');
                return res.status(401).json(`Account locked. Try again in ${str} .`);
            } else {

                delete loginAttempts[email];
            }
        }


        if (loginAttempts[email] && Date.now() - loginAttempts[email].lastAttempt > lockoutTime) {

            delete loginAttempts[email];
        }



        const user = await userRepo.findByEmail(req.body.email);


        if (user.email !== req.body.email) {
            console.log(req.body.email)
            throw new Error('Incorrect email or password');
        }

        const match = await bcrypt.compare(req.body.password, user.hashedPassword);


        if (!match) {
            if (!loginAttempts[email]) {
                loginAttempts[email] = { attempts: 1, firstAttempt: Date.now() };
            } else {
                loginAttempts[email].attempts++;
                if (loginAttempts[email].attempts >= maxLoginAttempts) {
                    let ipAddress: string;
                    ipAddress = req.body.userGeolocation.IPv4;
                    let country_code = req.body.userGeolocation.country_code;
                    let country_name = req.body.userGeolocation.country_name;
                    let postal = req.body.userGeolocation.postal;
                    let city = req.body.userGeolocation.city;
                    let latitude = req.body.userGeolocation.latitude;
                    let longitude = req.body.userGeolocation.longitude;
                    let state = req.body.userGeolocation.state
                    await userRepo.logFailedLoginAttempt(new Date().toISOString(), req.body.email, ipAddress, req.headers['user-agent'],
                        country_code, country_name, postal, city, latitude, longitude, state)
                }
            }
            throw new Error('Incorrect email or password');
        }

        if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
            throw new Error(`Your profile status is ${user.status}`);
        }

        if (user.verifyEmail === 0) {
            throw new Error('Your Email has not been verified. Look for the verification email in your inbox and click the link. ')
        }

        const token = createToken(user);

        try {
            const result = await userRepo.login(user._id, user.countOfLogs);
            if (loginAttempts[email]) {
                delete loginAttempts[email];
            }
        } catch (err) {
            console.log(err);
            throw new Error(err);
        }

        res.status(200).json(token);
    } catch (err) {
        console.log(err.message);
        res.status(401).json(err.message);
    }
});



authController.post('/register', body('email').isEmail().withMessage('Invalid email'),


    body('password').isLength({ min: 3 }).withMessage('Password must be at least 3 characters long'),

    async (req, res) => {


        try {
            const errors = validationResult(req);

            if (!errors.isEmpty()) {


                throw errors;
            }

        } catch (error) {
            res.status(400).json(error.message);
        }



        const userRepo: IUserRepository<User> = req.app.get('usersRepo');

        try {

            const existing = await userRepo.findByEmail(req.body.email);


            if (existing.email === req.body.email) {

                throw new Error('Email is taken');
            }




            try {

                const user = await userRepo.create(req.body);

                if (user) {
                    const hexStr = verifyToken()
                    const verifyTokenRepo: IVerifyTokenRepository<VerifyToken> = req.app.get('verifyTokenRepo');
                    const tokenVerifyUser = await verifyTokenRepo.create(hexStr, user._id.toString())


                    const confirmUrl = `<html><head></head><body style="display:flex;justify-content: center; margin-top: 50px; background-color: rgb(33 150 243 / 77%);color:white; min-height: 100vh"><p>You requested for email verification, kindly use this <a href="${APP_URL}/users/verify-email/${user._id}/${tokenVerifyUser.verifyToken}">link</a> to verify your email address</p></body></html>`

                    const subject = 'Email verification - HACK-TRIP'
                    try {

                        const sendEmail = await sendMail(req.body.email, confirmUrl, subject)

                        res.status(201).json('An email has been sent to you with a confirmation link, please verify.');
                    } catch (err) {
                        console.log(err);
                        res.status(400).json(err.message);
                    }

                }


            } catch (err) {
                console.log(err);
                res.status(400).json(err.message);
            }


        } catch (err) {
            console.log(err);
            res.status(400).json(err.message);
        }

    })


authController.post('/new-password', async (req, res) => {


    const userId = req.body.id;
    const token = req.body.token;
    const password = req.body.password;


    const userRepo: IUserRepository<User> = req.app.get('usersRepo');
    const verifyTokenRepo: IVerifyTokenRepository<VerifyToken> = req.app.get('verifyTokenRepo');

    try {
        const verifiedUser = await verifyTokenRepo.findByIdAndVerifyTokenForgotPassword(userId, token);

        if (verifiedUser) {
            try {
                const user = await userRepo.newUserPassword(userId, password);

                res.status(200).json(user);

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


authController.get('/profile/:id', async (req, res) => {
    const userRepo: IUserRepository<User> = req.app.get('usersRepo');

    try {

        const user = await userRepo.findById(req.params.id);


        res.status(200).json(user);

    } catch (err) {
        console.log(err.message);
        res.status(401).json(err.message);
    }

})



authController.get('/verify-email/:id/:token', async (req, res) => {

    const verifyTokenRepo: IVerifyTokenRepository<VerifyToken> = req.app.get('verifyTokenRepo');

    const userRepo: IUserRepository<User> = req.app.get('usersRepo');


    const id = req.params.id;
    const token = req.params.token;

    try {
        const userVerifyTokenTable = await verifyTokenRepo.findById(id, token)

        const user = await userRepo.findById(id)

        if (userVerifyTokenTable.userId === id && user.verifyEmail === 0) {
            try {

                const verifiedUser = await userRepo.updateUserverifyEmail(id, true)


                res.status(200).json(true)
            } catch (err) {
                console.log(err)
                res.status(400).json(err.message);
            }

        } else if (user.verifyEmail === 1) {

            res.status(200).json(true)

        }

    } catch (err) {
        console.log(err)
        res.status(400).json(err.message);
    }

})



authController.post('/confirmpassword/:id', async (req, res) => {
    const userRepo: IUserRepository<User> = req.app.get('usersRepo');


    try {
        const user = await userRepo.findById(req.params.id);
        const match = await bcrypt.compare(req.body.password, user.hashedPassword);
        if (!match) {
            throw new Error('Incorrect  password');
        }
        res.status(200).json(user);


    } catch (err) {
        console.log(err);
        res.status(401).json(err.message);
    }
})



authController.put('/admin/edit/:id', async (req, res) => {
    const userRepo: IUserRepository<User> = req.app.get('usersRepo');
    const id = req.params.id;

    try {

        const user = await userRepo.findById(req.params.id);

        try {

            if (req.body.imageFile === undefined) {
                req.body.imageFile = user.imageFile;
            } else {
                if (user.imageFile !== null) {
                    const filePath = user.imageFile;
                    try {
                        deleteFile(filePath);
                    } catch (err) {
                        console.log(err);
                    }
                }
            }

            const editedUser = await userRepo.updateUserAdmin(id, req.body);
            res.status(200).json(editedUser);

        } catch (err) {
            console.log(err);
        }

    } catch (err) {
        console.log(err.message);
        res.status(401).json(err.message);
    }

})




authController.put('/edit/:id', async (req, res) => {
    const userRepo: IUserRepository<User> = req.app.get('usersRepo');
    const id = req.params.id;
    try {
        const user = await userRepo.findById(req.params.id);

        try {


            if (req.body.password !== undefined && req.body.password.length > 0) {

                if (req.body.password.length > 0 && req.body.oldpassword.length > 0 && req.body.confirmpass.length > 0) {
                    if (req.body.imageFile === undefined) {
                        req.body.imageFile = user.imageFile;
                    } else {

                        if (user.imageFile !== null) {
                            const filePath = user.imageFile;
                            try {
                                deleteFile(filePath);
                            } catch (err) {
                                console.log(err);
                            }
                        }
                    }
                }


                const editedUserPassword = await userRepo.updateUserPass(id, req.body);
                res.status(200).json(editedUserPassword);

            } else {

                if (req.body.imageFile === undefined) {
                    req.body.imageFile = user.imageFile;
                } else {

                    if (user.imageFile !== null) {
                        const filePath = user.imageFile;

                        try {

                            deleteFile(filePath);
                        } catch (err) {
                            console.log(err);
                        }
                    }
                }
                const editedUser = await userRepo.updateUser(id, req.body);


                res.status(200).json(editedUser);

            }

        } catch (err) {
            console.log(err);
        }

    } catch (err) {
        console.log(err.message);
        res.status(401).json(err.message);
    }
})


authController.post('/forgot-password', async (req, res) => {

    const email = req.body.email;
    const userRepo: IUserRepository<User> = req.app.get('usersRepo');
    try {
        const user = await userRepo.findByEmail(email)

        if (user.email && user.verifyEmail === 1) {

            const hexStr = verifyToken()
            const verifyTokenRepo: IVerifyTokenRepository<VerifyToken> = req.app.get('verifyTokenRepo');
            const tokenVerifyUser = await verifyTokenRepo.forgotPassword(hexStr, user._id.toString())

            const resetUrl = `<html><head></head><body style="display:flex;justify-content: center; margin-top: 50px; background-color: rgb(33 150 243 / 77%);color:white; min-height: 100vh"><p>You requested for reset password, kindly use this <a href="${APP_URL}/register/${user._id}/${tokenVerifyUser.verifyTokenForgotPassword}">link</a> to proceed. If you did not request a password reset, please ignore this email or reply to let us know.</p></body></html>`

            try {
                const subject = 'Forgot password - HACK-TRIP'
                const sendEmail = await sendMail(req.body.email, resetUrl, subject)

                res.status(201).json('An email has been sent to you with a reset password link.');
            } catch (err) {
                console.log(err);
                res.status(400).json(err.message);
            }
        } else if (user.email && user.verifyEmail === 0) {

            throw new Error(`Please confirm your email: ${email} first, and then change your password. If you do not see an email with a confirmation link, go to the register page and click button RESEND VERIFICATIN EMAIL`)
        } else {
            throw new Error(`Error finding user with ${email} in database`)
        }

    } catch (err) {
        console.log(err.message)
        res.status(401).json(err.message);
    }


})


authController.post('/resend-email', async (req, res) => {

    const email = req.body.email;
    const userRepo: IUserRepository<User> = req.app.get('usersRepo');
    const verifyTokenRepo: IVerifyTokenRepository<VerifyToken> = req.app.get('verifyTokenRepo');



    try {
        const user = await userRepo.findByEmail(email)



        if (user.email) {
            const verifyUser = await verifyTokenRepo.findByUserId(user._id.toString())

            if (verifyUser.userId && verifyUser.verifyToken) {

                const confirmUrl = `<html><head></head><body style="display:flex;justify-content: center; margin-top: 50px; background-color: rgb(33 150 243 / 77%);color:white; min-height: 100vh"><p>You requested for email verification, kindly use this <a href="${APP_URL}/users/verify-email/${user._id}/${verifyUser.verifyToken}">link</a> to verify your email address</p></body></html>`

                const subject = 'Email verification - HACK-TRIP'
                try {

                    const sendEmail = await sendMail(req.body.email, confirmUrl, subject)

                    res.status(201).json('An email has been sent to you with a confirmation link, please verify.');
                } catch (err) {
                    console.log(err);
                    res.status(400).json(err.message);
                }

            } else {
                const hexStr = verifyToken()
                const tokenVerifyUser = await verifyTokenRepo.create(hexStr, user._id.toString())

                const confirmUrl = `<html><head></head><body style="display:flex;justify-content: center; margin-top: 50px; background-color: rgb(33 150 243 / 77%);color:white; min-height: 100vh"><p>You requested for email verification, kindly use this <a href="${APP_URL}/users/verify-email/${user._id}/${tokenVerifyUser.verifyToken}">link</a> to verify your email address</p></body></html>`

                const subject = 'Email verification - HACK-TRIP'
                try {

                    const sendEmail = await sendMail(req.body.email, confirmUrl, subject)

                    res.status(201).json('An email has been sent to you with a confirmation link, please verify.');
                } catch (err) {
                    console.log(err);
                    res.status(400).json(err.message);
                }
            }


        } else {
            throw new Error(`Error finding user with ${email} in database`)
        }
    } catch (err) {
        console.log(err.message)
        res.status(400).json(err.message);
    }
})

function createToken(user: User) {
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

    const userRepo: IUserRepository<User> = req.app.get('usersRepo');

    if ('token' in req) {

        const token = req.token as IdType;
        await userRepo.logout(token);
    }

    res.json('Logout').status(204);
})




authController.post('/upload', multer({ storage }).array('file', 1), function (req, res) {

    let files = req.files;

    res.status(200).json(files);
})



authController.put('/delete-image/:id', async (req, res) => {
    const userRepo: IUserRepository<User> = req.app.get('usersRepo');



    try {

        const existing = await userRepo.findById(req.params.id);
        const fileName = req.body.image;
        const filePath = fileName;


        try {
            deleteFile(filePath);
            const result = await userRepo.editProfileImage(req.params.id, fileName);

            res.json(result);

        } catch (err) {

            res.status(400).json(err.message);
        }
    } catch (err) {
        res.status(400).json(err.message);

    }
})

authController.delete('/admin/delete/failedlogs/:adminId', async (req, res) => {

    const userRepo: IUserRepository<User> = req.app.get('usersRepo');

    try {

        const user = await userRepo.findById(req.params.adminId);

        if (user.role !== 'admin' && user.role !== 'manager') {
            throw new Error(`Error finding new document in database`)
        }

        try {

            const result = await userRepo.deletFailedLogsById(req.body);

            res.json(result).status(204);
        } catch (err) {
            console.log(err.message)
            res.status(400).json(err.message);
        }

    } catch (err) {
        console.log(err.message)
        res.status(400).json(err.message);
    }

});

authController.get('/admin/failedlogs/:id', async (req, res) => {


    const userRepo: IUserRepository<User> = req.app.get('usersRepo');


    try {

        const user = await userRepo.findById(req.params.id);
        if (user.role !== 'admin' && user.role !== 'manager') {
            throw new Error(`Error finding new document in database`)
        }

        try {
            const allFailedLogs = await userRepo.getAllFailedLogs();
            res.status(200).json(allFailedLogs);
        } catch (err) {
            throw new Error(err.message);
        }

    } catch (err) {
        console.log(err.message)
        res.status(400).json(err.message);
    }

})



authController.get('/admin/:id', async (req, res) => {


    const userRepo: IUserRepository<User> = req.app.get('usersRepo');


    try {

        const user = await userRepo.findById(req.params.id);

        if (user.role !== 'admin' && user.role !== 'manager') {
            throw new Error(`Error finding new document in database`)
        }

        try {
            const users = await userRepo.getAll();
            res.status(200).json(users);
        } catch (err) {
            throw new Error(err.message);
        }

    } catch (err) {
        console.log(err.message)
        res.status(400).json(err.message);
    }

})



authController.post('/guard', authenticateToken, async (req, res) => {
    const userRepo: IUserRepository<User> = req.app.get('usersRepo');

    try {

        const _id = req.body.id;
        const role = req.body.role;


        const guard = await userRepo.confirmRole(_id, role);

        res.status(200).json(guard);

    } catch (err) {
        console.log(err);
        res.status(401).json(err.message);
    }

})


authController.get('/userId/:id', async (req, res) => {
    const userRepo: IUserRepository<User> = req.app.get('usersRepo');

    try {

        const guard = await userRepo.confirmUserId(req.params.id);
        res.status(200).json(guard);
    } catch (err) {
        console.log(err);
        res.status(401).json(err.message);
    }

})


authController.delete('/admin/:adminId/:id', async (req, res) => {


    const userRepo: IUserRepository<User> = req.app.get('usersRepo');

    try {

        const user = await userRepo.findById(req.params.adminId);

        if (user.role !== 'admin' && user.role !== 'manager') {
            throw new Error(`Error finding new document in database`)
        }

        try {

            const result = await userRepo.deletUserById(req.params.id);

            res.json(result).status(204);
        } catch (err) {
            console.log(err.message)
            res.status(400).json(err.message);
        }

    } catch (err) {
        console.log(err.message)
        res.status(400).json(err.message);
    }
})

authController.use((req, res, next) => {
    res.status(404).json('Route not found');
});

const deleteFile = async (filePath) => {
    try {
        await storage.bucket('hack-trip')
            .file(filePath)
            .delete();
        console.log('File deleted USER');
    } catch (err) {
        console.log(err.message);
    }
}


function verifyToken() {
    let hex = (((Date.now() * Math.random() * 99999)).toString(16) + ((Date.now() * Math.random() * 99999)).toString(16) + ((Date.now() * Math.random() * 99999)).toString(16))
    if (hex.includes('.')) {
        hex = hex.split('.').join('')

    }

    return hex.length > 36 ? hex.slice(0, 36) : hex
}



export default authController;

