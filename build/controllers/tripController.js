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
exports.storage = void 0;
var express = require("express");
var multer = require("multer");
var path = require("path");
var multer_storage_google_cloud_1 = require("@duplexsi/multer-storage-google-cloud");
var tripController = express.Router();
exports.storage = new multer_storage_google_cloud_1.MulterGoogleCloudStorage({
    bucketName: 'hack-trip',
    keyFilename: path.join(__dirname, '../utils/hack-trip-414441f1b5d4.json'),
    destination: function (req, f, cb) { return cb(null, Date.now() + Math.random().toString().slice(-3) + "".concat(f.originalname)); }
});
tripController.post('/upload', multer({ storage: exports.storage }).array('file', 12), function (req, res) {
    var files = req.files;
    res.status(200).json(files);
});
tripController.get('/top', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var tripRepo, trips, sort;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                tripRepo = req.app.get('tripsRepo');
                return [4 /*yield*/, tripRepo.getTop()];
            case 1:
                trips = _a.sent();
                sort = trips.sort(function (a, b) { return b.likes.length - a.likes.length; });
                if (sort.length > 5) {
                    sort = sort.slice(0, 5);
                }
                res.status(200).json(sort);
                return [2 /*return*/];
        }
    });
}); });
tripController.post('/', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var tripRepo, trip, err_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                tripRepo = req.app.get('tripsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, tripRepo.create(req.body)];
            case 2:
                trip = _a.sent();
                res.status(200).json(trip);
                return [3 /*break*/, 4];
            case 3:
                err_1 = _a.sent();
                res.json(err_1.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
tripController.get('/', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var search, typegroup, typetransport, tripRepo, trips, pages, err_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                search = req.query.search.toString();
                typegroup = req.query.typegroup.toString();
                typetransport = req.query.typetransport.toString();
                tripRepo = req.app.get('tripsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, tripRepo.getAll(search, typegroup, typetransport)];
            case 2:
                trips = _a.sent();
                pages = Math.ceil(trips.length / 9);
                res.status(200).json(pages);
                return [3 /*break*/, 4];
            case 3:
                err_2 = _a.sent();
                res.json(err_2.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
tripController.get('/paginate', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var tripRepo, page, search, typegroup, typetransport, paginatane, err_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                tripRepo = req.app.get('tripsRepo');
                page = Number(req.query.page);
                search = req.query.search.toString();
                typegroup = req.query.typegroup.toString();
                typetransport = req.query.typetransport.toString();
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, tripRepo.getPagination(page, search, typegroup, typetransport)];
            case 2:
                paginatane = _a.sent();
                res.status(200).json(paginatane);
                return [3 /*break*/, 4];
            case 3:
                err_3 = _a.sent();
                res.json(err_3.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
tripController.get('/reports', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var tripRepo, trips, err_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                tripRepo = req.app.get('tripsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, tripRepo.getAllReports()];
            case 2:
                trips = _a.sent();
                res.status(200).json(trips);
                return [3 /*break*/, 4];
            case 3:
                err_4 = _a.sent();
                res.json(err_4.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
tripController.get('/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var tripRepo, trip, err_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                tripRepo = req.app.get('tripsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, tripRepo.getTripById(req.params.id)];
            case 2:
                trip = _a.sent();
                res.status(200).json(trip);
                return [3 /*break*/, 4];
            case 3:
                err_5 = _a.sent();
                res.status(400).json(err_5.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
tripController.delete('/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var tripRepo, result, images, err_6;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                tripRepo = req.app.get('tripsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, tripRepo.deleteTrypById(req.params.id)];
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
                res.json(result).status(204);
                return [3 /*break*/, 4];
            case 3:
                err_6 = _a.sent();
                res.status(400).json(err_6.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
tripController.get('/my-trips/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var tripRepo, trips, err_7;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                tripRepo = req.app.get('tripsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, tripRepo.getAllMyTrips(req.params.id)];
            case 2:
                trips = _a.sent();
                res.json(trips);
                return [3 /*break*/, 4];
            case 3:
                err_7 = _a.sent();
                res.status(400).json(err_7.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
tripController.get('/favorites/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var tripRepo, trips, err_8;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                tripRepo = req.app.get('tripsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, tripRepo.getAllMyFavorites(req.params.id)];
            case 2:
                trips = _a.sent();
                res.json(trips);
                return [3 /*break*/, 4];
            case 3:
                err_8 = _a.sent();
                res.status(400).json(err_8.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
tripController.put('/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var tripRepo, existing, result, err_9, err_10;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                tripRepo = req.app.get('tripsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 7, , 8]);
                return [4 /*yield*/, tripRepo.getTripById(req.params.id)];
            case 2:
                existing = _a.sent();
                _a.label = 3;
            case 3:
                _a.trys.push([3, 5, , 6]);
                return [4 /*yield*/, tripRepo.updateTripById(req.params.id, req.body)];
            case 4:
                result = _a.sent();
                res.json(result);
                return [3 /*break*/, 6];
            case 5:
                err_9 = _a.sent();
                res.status(400).json(err_9.message);
                return [3 /*break*/, 6];
            case 6: return [3 /*break*/, 8];
            case 7:
                err_10 = _a.sent();
                res.status(400).json(err_10.message);
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); });
tripController.put('/like/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var tripRepo, existing, result, err_11, err_12;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                tripRepo = req.app.get('tripsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 7, , 8]);
                return [4 /*yield*/, tripRepo.getTripById(req.params.id)];
            case 2:
                existing = _a.sent();
                _a.label = 3;
            case 3:
                _a.trys.push([3, 5, , 6]);
                return [4 /*yield*/, tripRepo.updateTripLikeByuserId(req.params.id, req.body)];
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
tripController.put('/favorites/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var tripRepo, existing, result, err_13, err_14;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                tripRepo = req.app.get('tripsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 7, , 8]);
                return [4 /*yield*/, tripRepo.getTripById(req.params.id)];
            case 2:
                existing = _a.sent();
                _a.label = 3;
            case 3:
                _a.trys.push([3, 5, , 6]);
                return [4 /*yield*/, tripRepo.updateTripFavoritesByuserId(req.params.id, req.body)];
            case 4:
                result = _a.sent();
                res.json(result);
                return [3 /*break*/, 6];
            case 5:
                err_13 = _a.sent();
                res.status(400).json(err_13.message);
                return [3 /*break*/, 6];
            case 6: return [3 /*break*/, 8];
            case 7:
                err_14 = _a.sent();
                res.status(400).json(err_14.message);
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); });
tripController.put('/report/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var tripRepo, existing, result, err_15, err_16;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                tripRepo = req.app.get('tripsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 7, , 8]);
                return [4 /*yield*/, tripRepo.getTripById(req.params.id)];
            case 2:
                existing = _a.sent();
                _a.label = 3;
            case 3:
                _a.trys.push([3, 5, , 6]);
                return [4 /*yield*/, tripRepo.reportTripByuserId(req.params.id, req.body)];
            case 4:
                result = _a.sent();
                res.json(result);
                return [3 /*break*/, 6];
            case 5:
                err_15 = _a.sent();
                res.status(400).json(err_15.message);
                return [3 /*break*/, 6];
            case 6: return [3 /*break*/, 8];
            case 7:
                err_16 = _a.sent();
                res.status(400).json(err_16.message);
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); });
tripController.put('/admin/delete-report/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var tripRepo, existing, result, err_17, err_18;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                tripRepo = req.app.get('tripsRepo');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 7, , 8]);
                return [4 /*yield*/, tripRepo.getTripById(req.params.id)];
            case 2:
                existing = _a.sent();
                _a.label = 3;
            case 3:
                _a.trys.push([3, 5, , 6]);
                return [4 /*yield*/, tripRepo.deleteReportTripByuserId(req.params.id, req.body)];
            case 4:
                result = _a.sent();
                res.json(result);
                return [3 /*break*/, 6];
            case 5:
                err_17 = _a.sent();
                res.status(400).json(err_17.message);
                return [3 /*break*/, 6];
            case 6: return [3 /*break*/, 8];
            case 7:
                err_18 = _a.sent();
                res.status(400).json(err_18.message);
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); });
tripController.put('/edit-images/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var tripRepo, existing, fileName, filePath, index, editedListImage, result, err_19, err_20;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                tripRepo = req.app.get('tripsRepo');
                _b.label = 1;
            case 1:
                _b.trys.push([1, 7, , 8]);
                return [4 /*yield*/, tripRepo.getTripById(req.params.id)];
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
                return [4 /*yield*/, tripRepo.editImagesByTripId(req.params.id, existing)];
            case 4:
                result = _b.sent();
                res.json(result);
                return [3 /*break*/, 6];
            case 5:
                err_19 = _b.sent();
                res.status(400).json(err_19.message);
                return [3 /*break*/, 6];
            case 6: return [3 /*break*/, 8];
            case 7:
                err_20 = _b.sent();
                res.status(400).json(err_20.message);
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); });
var deleteFile = function (filePath) { return __awaiter(void 0, void 0, void 0, function () {
    var err_21;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, exports.storage.bucket('hack-trip')
                        .file(filePath)
                        .delete()];
            case 1:
                _a.sent();
                console.log('File deleted from TRIP');
                return [3 /*break*/, 3];
            case 2:
                err_21 = _a.sent();
                console.log(err_21.message);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); };
exports.default = tripController;
//# sourceMappingURL=tripController.js.map