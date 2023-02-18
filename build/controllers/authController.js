"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const express_validator_1 = require("express-validator");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const tripController_1 = require("./tripController");
const multer = require("multer");
const dotenv = require("dotenv");
dotenv.config();
const secret = process.env.secret;
const authController = express.Router();
authController.post('/login', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userRepo = req.app.get('usersRepo');
    try {
        const user = yield userRepo.findByEmail(req.body.email);
        if (user.email !== req.body.email) {
            throw new Error('Incorrect email or password');
        }
        const match = bcrypt.compare(req.body.password, user.hashedPassword);
        if (!match) {
            throw new Error('Incorrect email or password');
        }
        if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
            throw new Error(`Your profile status is ${user.status}`);
        }
        const token = createToken(user);
        try {
            const result = yield userRepo.login(user._id, user.countOfLogs);
        }
        catch (err) {
            console.log(err);
            throw new Error(err);
        }
        res.status(200).json(token);
    }
    catch (err) {
        console.log(err.message);
        res.status(401).json(err.message);
    }
}));
authController.post('/register', (0, express_validator_1.body)('email').isEmail().withMessage('Invalid email'), (0, express_validator_1.body)('password').isLength({ min: 3 }).withMessage('Password must be at least 3 characters long'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            throw errors;
        }
    }
    catch (error) {
        res.status(400).json(error.message);
    }
    const userRepo = req.app.get('usersRepo');
    try {
        const existing = yield userRepo.findByEmail(req.body.email);
        if (existing.email === req.body.email) {
            throw new Error('Email is taken');
        }
        try {
            const user = yield userRepo.create(req.body);
            const token = createToken(user);
            res.status(201).json(token);
        }
        catch (err) {
            console.log(err);
            res.status(400).json(err.message);
        }
    }
    catch (err) {
        console.log(err);
        res.status(400).json(err.message);
    }
}));
authController.get('/profile/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userRepo = req.app.get('usersRepo');
    try {
        const user = yield userRepo.findById(req.params.id);
        res.status(200).json(user);
    }
    catch (err) {
        console.log(err.message);
        res.status(401).json(err.message);
    }
}));
authController.post('/confirmpassword/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userRepo = req.app.get('usersRepo');
    try {
        const user = yield userRepo.findById(req.params.id);
        const match = yield bcrypt.compare(req.body.password, user.hashedPassword);
        if (!match) {
            throw new Error('Incorrect  password');
        }
        res.status(200).json(user);
    }
    catch (err) {
        console.log(err);
        res.status(401).json(err.message);
    }
}));
authController.put('/admin/edit/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userRepo = req.app.get('usersRepo');
    const id = req.params.id;
    try {
        const user = yield userRepo.findById(req.params.id);
        console.log(user);
        try {
            if (req.body.imageFile === undefined) {
                req.body.imageFile = user.imageFile;
            }
            else {
                if (user.imageFile !== null) {
                    const filePath = user.imageFile;
                    try {
                        deleteFile(filePath);
                    }
                    catch (err) {
                        console.log(err);
                    }
                }
            }
            const editedUser = yield userRepo.updateUserAdmin(id, req.body);
            res.status(200).json(editedUser);
        }
        catch (err) {
            console.log(err);
        }
    }
    catch (err) {
        console.log(err.message);
        res.status(401).json(err.message);
    }
}));
authController.put('/edit/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userRepo = req.app.get('usersRepo');
    const id = req.params.id;
    try {
        const user = yield userRepo.findById(req.params.id);
        try {
            if (req.body.password !== undefined && req.body.password.length > 0) {
                if (req.body.password.length > 0 && req.body.oldpassword.length > 0 && req.body.confirmpass.length > 0) {
                    if (req.body.imageFile === undefined) {
                        req.body.imageFile = user.imageFile;
                    }
                    else {
                        if (user.imageFile !== null) {
                            const filePath = user.imageFile;
                            try {
                                deleteFile(filePath);
                            }
                            catch (err) {
                                console.log(err);
                            }
                        }
                    }
                }
                const editedUserPassword = yield userRepo.updateUserPass(id, req.body);
                res.status(200).json(editedUserPassword);
            }
            else {
                if (req.body.imageFile === undefined) {
                    req.body.imageFile = user.imageFile;
                }
                else {
                    if (user.imageFile !== null) {
                        const filePath = user.imageFile;
                        try {
                            deleteFile(filePath);
                        }
                        catch (err) {
                            console.log(err);
                        }
                    }
                }
                const editedUser = yield userRepo.updateUser(id, req.body);
                res.status(200).json(editedUser);
            }
        }
        catch (err) {
            console.log(err);
        }
    }
    catch (err) {
        console.log(err.message);
        res.status(401).json(err.message);
    }
}));
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
authController.post('/logout', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userRepo = req.app.get('usersRepo');
    if ('token' in req) {
        const token = req.token;
        yield userRepo.logout(token);
    }
    res.json('Logout').status(204);
}));
authController.post('/upload', multer({ storage: tripController_1.storage }).array('file', 1), function (req, res) {
    let files = req.files;
    res.status(200).json(files);
});
authController.put('/delete-image/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userRepo = req.app.get('usersRepo');
    try {
        const existing = yield userRepo.findById(req.params.id);
        const fileName = req.body.image;
        const filePath = fileName;
        try {
            deleteFile(filePath);
            const result = yield userRepo.editProfileImage(req.params.id, fileName);
            res.json(result);
        }
        catch (err) {
            res.status(400).json(err.message);
        }
    }
    catch (err) {
        res.status(400).json(err.message);
    }
}));
authController.get('/admin', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userRepo = req.app.get('usersRepo');
    try {
        const users = yield userRepo.getAll();
        res.status(200).json(users);
    }
    catch (err) {
        res.json(err.message);
    }
}));
authController.post('/guard', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userRepo = req.app.get('usersRepo');
    try {
        const _id = req.body.id;
        const role = req.body.role;
        const guard = yield userRepo.confirmRole(_id, role);
        res.status(200).json(guard);
    }
    catch (err) {
        console.log(err);
        res.status(401).json(err.message);
    }
}));
const deleteFile = (filePath) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield tripController_1.storage.bucket('hack-trip')
            .file(filePath)
            .delete();
        console.log('File deleted USER');
    }
    catch (err) {
        console.log(err.message);
    }
});
exports.default = authController;
//# sourceMappingURL=authController.js.map