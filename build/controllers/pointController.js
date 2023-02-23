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
var multer = require("multer");
var tripController_1 = require("./tripController");
var pointController = express.Router();
pointController.post('/upload', multer({ storage: tripController_1.storage }).array('file', 12), function (req, res) {
    var files = req.files;
    res.status(200).json(files);
});
pointController.post('/', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var pointRepo, point, err_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                pointRepo = req.app.get('pointsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, pointRepo.create(req.body)];
            case 2:
                point = _a.sent();
                res.status(200).json(point);
                return [3 /*break*/, 4];
            case 3:
                err_1 = _a.sent();
                res.json(err_1.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
pointController.delete('/trip/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var pointRepo, result, err_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                pointRepo = req.app.get('pointsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, pointRepo.deletePointByTripId(req.params.id)];
            case 2:
                result = _a.sent();
                result.map(function (x) {
                    var images = x.imageFile;
                    images.split(',').map(function (f) {
                        var filePath = f;
                        try {
                            deleteFile(filePath);
                        }
                        catch (err) {
                            console.log(err);
                        }
                    });
                });
                res.json(result).status(204);
                return [3 /*break*/, 4];
            case 3:
                err_2 = _a.sent();
                res.status(400).json(err_2.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
pointController.get('/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var pointRepo, points, err_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                pointRepo = req.app.get('pointsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, pointRepo.findByTripId(req.params.id)];
            case 2:
                points = _a.sent();
                res.status(200).json(points);
                return [3 /*break*/, 4];
            case 3:
                err_3 = _a.sent();
                res.status(400).json(err_3.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
pointController.delete('/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var pointRepo, ownerTrip, result, images, points, err_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                pointRepo = req.app.get('pointsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, , 5]);
                ownerTrip = req.body.idTrip;
                return [4 /*yield*/, pointRepo.deletePointById(req.params.id)];
            case 2:
                result = _a.sent();
                images = void 0;
                images = result.imageFile;
                images.split(',').map(function (x) {
                    var filePath = x;
                    try {
                        deleteFile(filePath);
                    }
                    catch (err) {
                        console.log(err);
                    }
                });
                return [4 /*yield*/, pointRepo.findBytripIdOrderByPointPosition(ownerTrip)];
            case 3:
                points = _a.sent();
                points.forEach(function (x, i) { return __awaiter(void 0, void 0, void 0, function () {
                    var newPoint, updated;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                x.pointNumber = i + 1;
                                newPoint = x;
                                return [4 /*yield*/, pointRepo.updatePointById(x._id, newPoint)];
                            case 1:
                                updated = _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); });
                res.json(result).status(204);
                return [3 /*break*/, 5];
            case 4:
                err_4 = _a.sent();
                res.status(400).json(err_4.message);
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
pointController.get('/edit/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var pointRepo, point, err_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                pointRepo = req.app.get('pointsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, pointRepo.getPointById(req.params.id)];
            case 2:
                point = _a.sent();
                res.status(200).json(point);
                return [3 /*break*/, 4];
            case 3:
                err_5 = _a.sent();
                res.status(400).json(err_5.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
pointController.put('/edit-position/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var pointRepo, existing1, existing2, result, result1, points, err_6, err_7;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                pointRepo = req.app.get('pointsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 10, , 11]);
                return [4 /*yield*/, pointRepo.getPointById(req.body.currentCardId)];
            case 2:
                existing1 = _a.sent();
                return [4 /*yield*/, pointRepo.getPointById(req.body.upCurrentCardId)];
            case 3:
                existing2 = _a.sent();
                _a.label = 4;
            case 4:
                _a.trys.push([4, 8, , 9]);
                return [4 /*yield*/, pointRepo.updatePointPositionById(req.body.currentCardId, req.body.currentIdNewPosition)];
            case 5:
                result = _a.sent();
                return [4 /*yield*/, pointRepo.updatePointPositionById(req.body.upCurrentCardId, req.body.upCurrentCardNewPosition)];
            case 6:
                result1 = _a.sent();
                return [4 /*yield*/, pointRepo.findByTripId(req.params.id)];
            case 7:
                points = _a.sent();
                res.status(200).json(points);
                return [3 /*break*/, 9];
            case 8:
                err_6 = _a.sent();
                res.status(400).json(err_6.message);
                return [3 /*break*/, 9];
            case 9: return [3 /*break*/, 11];
            case 10:
                err_7 = _a.sent();
                res.status(400).json(err_7.message);
                return [3 /*break*/, 11];
            case 11: return [2 /*return*/];
        }
    });
}); });
pointController.put('/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var pointRepo, existing, result, err_8, err_9;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                pointRepo = req.app.get('pointsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 7, , 8]);
                return [4 /*yield*/, pointRepo.getPointById(req.params.id)];
            case 2:
                existing = _a.sent();
                _a.label = 3;
            case 3:
                _a.trys.push([3, 5, , 6]);
                return [4 /*yield*/, pointRepo.updatePointById(req.params.id, req.body)];
            case 4:
                result = _a.sent();
                res.json(result);
                return [3 /*break*/, 6];
            case 5:
                err_8 = _a.sent();
                res.status(400).json(err_8.message);
                return [3 /*break*/, 6];
            case 6: return [3 /*break*/, 8];
            case 7:
                err_9 = _a.sent();
                res.status(400).json(err_9.message);
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); });
pointController.put('/edit-images/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var pointRepo, existing, fileName, filePath, index, editedListImage, result, err_10, err_11;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                pointRepo = req.app.get('pointsRepo');
                _b.label = 1;
            case 1:
                _b.trys.push([1, 7, , 8]);
                return [4 /*yield*/, pointRepo.getPointById(req.params.id)];
            case 2:
                existing = _b.sent();
                fileName = req.body[0];
                filePath = fileName;
                index = (_a = existing.imageFile) === null || _a === void 0 ? void 0 : _a.indexOf(fileName);
                editedListImage = existing === null || existing === void 0 ? void 0 : existing.imageFile;
                editedListImage.splice(index, 1);
                existing.imageFile = editedListImage;
                _b.label = 3;
            case 3:
                _b.trys.push([3, 5, , 6]);
                deleteFile(filePath);
                return [4 /*yield*/, pointRepo.editImagesByPointId(req.params.id, existing)];
            case 4:
                result = _b.sent();
                res.json(result);
                return [3 /*break*/, 6];
            case 5:
                err_10 = _b.sent();
                res.status(400).json(err_10.message);
                return [3 /*break*/, 6];
            case 6: return [3 /*break*/, 8];
            case 7:
                err_11 = _b.sent();
                res.status(400).json(err_11.message);
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); });
var deleteFile = function (filePath) { return __awaiter(void 0, void 0, void 0, function () {
    var err_12;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, tripController_1.storage.bucket('hack-trip')
                        .file(filePath)
                        .delete()];
            case 1:
                _a.sent();
                console.log('File deleted from POINT');
                return [3 /*break*/, 3];
            case 2:
                err_12 = _a.sent();
                console.log(err_12.message);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); };
exports.default = pointController;
//# sourceMappingURL=pointController.js.map