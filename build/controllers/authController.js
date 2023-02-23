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
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var express = require("express");
var express_validator_1 = require("express-validator");
var jwt = require("jsonwebtoken");
var bcrypt = require("bcrypt");
var tripController_1 = require("./tripController");
var multer = require("multer");
var dotenv = require("dotenv");
dotenv.config();
var secret = process.env.secret;
var authController = express.Router();
authController.post('/login', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userRepo, user, match, token, result, err_1, err_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                userRepo = req.app.get('usersRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 7, , 8]);
                return [4 /*yield*/, userRepo.findByEmail(req.body.email)];
            case 2:
                user = _a.sent();
                if (user.email !== req.body.email) {
                    throw new Error('Incorrect email or password');
                }
                match = bcrypt.compare(req.body.password, user.hashedPassword);
                if (!match) {
                    throw new Error('Incorrect email or password');
                }
                if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
                    throw new Error("Your profile status is ".concat(user.status));
                }
                token = createToken(user);
                _a.label = 3;
            case 3:
                _a.trys.push([3, 5, , 6]);
                return [4 /*yield*/, userRepo.login(user._id, user.countOfLogs)];
            case 4:
                result = _a.sent();
                return [3 /*break*/, 6];
            case 5:
                err_1 = _a.sent();
                console.log(err_1);
                throw new Error(err_1);
            case 6:
                res.status(200).json(token);
                return [3 /*break*/, 8];
            case 7:
                err_2 = _a.sent();
                console.log(err_2.message);
                res.status(401).json(err_2.message);
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); });
authController.post('/register', (0, express_validator_1.body)('email').isEmail().withMessage('Invalid email'), (0, express_validator_1.body)('password').isLength({ min: 3 }).withMessage('Password must be at least 3 characters long'), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var errors, userRepo, existing, user, token, err_3, err_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                try {
                    errors = (0, express_validator_1.validationResult)(req);
                    if (!errors.isEmpty()) {
                        throw errors;
                    }
                }
                catch (error) {
                    res.status(400).json(error.message);
                }
                userRepo = req.app.get('usersRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 7, , 8]);
                return [4 /*yield*/, userRepo.findByEmail(req.body.email)];
            case 2:
                existing = _a.sent();
                if (existing.email === req.body.email) {
                    throw new Error('Email is taken');
                }
                _a.label = 3;
            case 3:
                _a.trys.push([3, 5, , 6]);
                return [4 /*yield*/, userRepo.create(req.body)];
            case 4:
                user = _a.sent();
                token = createToken(user);
                res.status(201).json(token);
                return [3 /*break*/, 6];
            case 5:
                err_3 = _a.sent();
                console.log(err_3);
                res.status(400).json(err_3.message);
                return [3 /*break*/, 6];
            case 6: return [3 /*break*/, 8];
            case 7:
                err_4 = _a.sent();
                console.log(err_4);
                res.status(400).json(err_4.message);
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); });
authController.get('/profile/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userRepo, user, err_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                userRepo = req.app.get('usersRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, userRepo.findById(req.params.id)];
            case 2:
                user = _a.sent();
                res.status(200).json(user);
                return [3 /*break*/, 4];
            case 3:
                err_5 = _a.sent();
                console.log(err_5.message);
                res.status(401).json(err_5.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
authController.post('/confirmpassword/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userRepo, user, match, err_6;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                userRepo = req.app.get('usersRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, , 5]);
                return [4 /*yield*/, userRepo.findById(req.params.id)];
            case 2:
                user = _a.sent();
                return [4 /*yield*/, bcrypt.compare(req.body.password, user.hashedPassword)];
            case 3:
                match = _a.sent();
                if (!match) {
                    throw new Error('Incorrect  password');
                }
                res.status(200).json(user);
                return [3 /*break*/, 5];
            case 4:
                err_6 = _a.sent();
                console.log(err_6);
                res.status(401).json(err_6.message);
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
authController.put('/admin/edit/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userRepo, id, user, filePath, editedUser, err_7, err_8;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                userRepo = req.app.get('usersRepo');
                id = req.params.id;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 7, , 8]);
                return [4 /*yield*/, userRepo.findById(req.params.id)];
            case 2:
                user = _a.sent();
                console.log(user);
                _a.label = 3;
            case 3:
                _a.trys.push([3, 5, , 6]);
                if (req.body.imageFile === undefined) {
                    req.body.imageFile = user.imageFile;
                }
                else {
                    if (user.imageFile !== null) {
                        filePath = user.imageFile;
                        try {
                            deleteFile(filePath);
                        }
                        catch (err) {
                            console.log(err);
                        }
                    }
                }
                return [4 /*yield*/, userRepo.updateUserAdmin(id, req.body)];
            case 4:
                editedUser = _a.sent();
                res.status(200).json(editedUser);
                return [3 /*break*/, 6];
            case 5:
                err_7 = _a.sent();
                console.log(err_7);
                return [3 /*break*/, 6];
            case 6: return [3 /*break*/, 8];
            case 7:
                err_8 = _a.sent();
                console.log(err_8.message);
                res.status(401).json(err_8.message);
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); });
authController.put('/edit/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userRepo, id, user, filePath, editedUserPassword, filePath, editedUser, err_9, err_10;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                userRepo = req.app.get('usersRepo');
                id = req.params.id;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 10, , 11]);
                return [4 /*yield*/, userRepo.findById(req.params.id)];
            case 2:
                user = _a.sent();
                _a.label = 3;
            case 3:
                _a.trys.push([3, 8, , 9]);
                if (!(req.body.password !== undefined && req.body.password.length > 0)) return [3 /*break*/, 5];
                if (req.body.password.length > 0 && req.body.oldpassword.length > 0 && req.body.confirmpass.length > 0) {
                    if (req.body.imageFile === undefined) {
                        req.body.imageFile = user.imageFile;
                    }
                    else {
                        if (user.imageFile !== null) {
                            filePath = user.imageFile;
                            try {
                                deleteFile(filePath);
                            }
                            catch (err) {
                                console.log(err);
                            }
                        }
                    }
                }
                return [4 /*yield*/, userRepo.updateUserPass(id, req.body)];
            case 4:
                editedUserPassword = _a.sent();
                res.status(200).json(editedUserPassword);
                return [3 /*break*/, 7];
            case 5:
                if (req.body.imageFile === undefined) {
                    req.body.imageFile = user.imageFile;
                }
                else {
                    if (user.imageFile !== null) {
                        filePath = user.imageFile;
                        try {
                            deleteFile(filePath);
                        }
                        catch (err) {
                            console.log(err);
                        }
                    }
                }
                return [4 /*yield*/, userRepo.updateUser(id, req.body)];
            case 6:
                editedUser = _a.sent();
                res.status(200).json(editedUser);
                _a.label = 7;
            case 7: return [3 /*break*/, 9];
            case 8:
                err_9 = _a.sent();
                console.log(err_9);
                return [3 /*break*/, 9];
            case 9: return [3 /*break*/, 11];
            case 10:
                err_10 = _a.sent();
                console.log(err_10.message);
                res.status(401).json(err_10.message);
                return [3 /*break*/, 11];
            case 11: return [2 /*return*/];
        }
    });
}); });
function createToken(user) {
    var payload = {
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
authController.post('/logout', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userRepo, token;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                userRepo = req.app.get('usersRepo');
                if (!('token' in req)) return [3 /*break*/, 2];
                token = req.token;
                return [4 /*yield*/, userRepo.logout(token)];
            case 1:
                _a.sent();
                _a.label = 2;
            case 2:
                res.json('Logout').status(204);
                return [2 /*return*/];
        }
    });
}); });
authController.post('/upload', multer({ storage: tripController_1.storage }).array('file', 1), function (req, res) {
    var files = req.files;
    res.status(200).json(files);
});
authController.put('/delete-image/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userRepo, existing, fileName, filePath, result, err_11, err_12;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                userRepo = req.app.get('usersRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 7, , 8]);
                return [4 /*yield*/, userRepo.findById(req.params.id)];
            case 2:
                existing = _a.sent();
                fileName = req.body.image;
                filePath = fileName;
                _a.label = 3;
            case 3:
                _a.trys.push([3, 5, , 6]);
                deleteFile(filePath);
                return [4 /*yield*/, userRepo.editProfileImage(req.params.id, fileName)];
            case 4:
                result = _a.sent();
                res.json(result);
                return [3 /*break*/, 6];
            case 5:
                err_11 = _a.sent();
                res.status(400).json(err_11.message);
                return [3 /*break*/, 6];
            case 6: return [3 /*break*/, 8];
            case 7:
                err_12 = _a.sent();
                res.status(400).json(err_12.message);
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); });
authController.get('/admin', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userRepo, users, err_13;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                userRepo = req.app.get('usersRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, userRepo.getAll()];
            case 2:
                users = _a.sent();
                res.status(200).json(users);
                return [3 /*break*/, 4];
            case 3:
                err_13 = _a.sent();
                res.json(err_13.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
authController.post('/guard', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userRepo, _id, role, guard, err_14;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                userRepo = req.app.get('usersRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                _id = req.body.id;
                role = req.body.role;
                return [4 /*yield*/, userRepo.confirmRole(_id, role)];
            case 2:
                guard = _a.sent();
                res.status(200).json(guard);
                return [3 /*break*/, 4];
            case 3:
                err_14 = _a.sent();
                console.log(err_14);
                res.status(401).json(err_14.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
var deleteFile = function (filePath) { return __awaiter(void 0, void 0, void 0, function () {
    var err_15;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, tripController_1.storage.bucket('hack-trip')
                        .file(filePath)
                        .delete()];
            case 1:
                _a.sent();
                console.log('File deleted USER');
                return [3 /*break*/, 3];
            case 2:
                err_15 = _a.sent();
                console.log(err_15.message);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); };
exports.default = authController;
//# sourceMappingURL=authController.js.map