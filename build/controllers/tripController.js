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
exports.storage = void 0;
const express = require("express");
const multer = require("multer");
const path = require("path");
const multer_storage_google_cloud_1 = require("@duplexsi/multer-storage-google-cloud");
const tripController = express.Router();
exports.storage = new multer_storage_google_cloud_1.MulterGoogleCloudStorage({
    bucketName: 'hack-trip',
    keyFilename: path.join(__dirname, '../utils/hack-trip-414441f1b5d4.json'),
    destination: (req, f, cb) => cb(null, Date.now() + Math.random().toString().slice(-3) + `${f.originalname}`)
});
tripController.post('/upload', multer({ storage: exports.storage }).array('file', 12), function (req, res) {
    let files = req.files;
    res.status(200).json(files);
});
tripController.get('/top', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tripRepo = req.app.get('tripsRepo');
    const trips = yield tripRepo.getTop();
    let sort = trips.sort((a, b) => b.likes.length - a.likes.length);
    if (sort.length > 5) {
        sort = sort.slice(0, 5);
    }
    res.status(200).json(sort);
}));
tripController.post('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tripRepo = req.app.get('tripsRepo');
    try {
        const trip = yield tripRepo.create(req.body);
        res.status(200).json(trip);
    }
    catch (err) {
        res.json(err.message);
    }
}));
tripController.get('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const search = req.query.search.toString();
    const typegroup = req.query.typegroup.toString();
    const typetransport = req.query.typetransport.toString();
    const tripRepo = req.app.get('tripsRepo');
    try {
        const trips = yield tripRepo.getAll(search, typegroup, typetransport);
        const pages = Math.ceil(trips.length / 9);
        res.status(200).json(pages);
    }
    catch (err) {
        res.json(err.message);
    }
}));
tripController.get('/paginate', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tripRepo = req.app.get('tripsRepo');
    const page = Number(req.query.page);
    const search = req.query.search.toString();
    const typegroup = req.query.typegroup.toString();
    const typetransport = req.query.typetransport.toString();
    try {
        const paginatane = yield tripRepo.getPagination(page, search, typegroup, typetransport);
        res.status(200).json(paginatane);
    }
    catch (err) {
        res.json(err.message);
    }
}));
tripController.get('/reports', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tripRepo = req.app.get('tripsRepo');
    try {
        const trips = yield tripRepo.getAllReports();
        res.status(200).json(trips);
    }
    catch (err) {
        res.json(err.message);
    }
}));
tripController.get('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tripRepo = req.app.get('tripsRepo');
    try {
        const trip = yield tripRepo.getTripById(req.params.id);
        res.status(200).json(trip);
    }
    catch (err) {
        res.status(400).json(err.message);
    }
}));
tripController.delete('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tripRepo = req.app.get('tripsRepo');
    try {
        const result = yield tripRepo.deleteTrypById(req.params.id);
        let images;
        images = result.imageFile;
        images.split(',').map((x) => {
            const filePath = x;
            try {
                deleteFile(filePath);
            }
            catch (err) {
                console.log(err);
            }
        });
        res.json(result).status(204);
    }
    catch (err) {
        res.status(400).json(err.message);
    }
}));
tripController.get('/my-trips/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tripRepo = req.app.get('tripsRepo');
    try {
        const trips = yield tripRepo.getAllMyTrips(req.params.id);
        res.json(trips);
    }
    catch (err) {
        res.status(400).json(err.message);
    }
}));
tripController.get('/favorites/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tripRepo = req.app.get('tripsRepo');
    try {
        const trips = yield tripRepo.getAllMyFavorites(req.params.id);
        res.json(trips);
    }
    catch (err) {
        res.status(400).json(err.message);
    }
}));
tripController.put('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tripRepo = req.app.get('tripsRepo');
    try {
        const existing = yield tripRepo.getTripById(req.params.id);
        try {
            const result = yield tripRepo.updateTripById(req.params.id, req.body);
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
tripController.put('/like/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tripRepo = req.app.get('tripsRepo');
    try {
        const existing = yield tripRepo.getTripById(req.params.id);
        try {
            const result = yield tripRepo.updateTripLikeByuserId(req.params.id, req.body);
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
tripController.put('/favorites/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tripRepo = req.app.get('tripsRepo');
    try {
        const existing = yield tripRepo.getTripById(req.params.id);
        try {
            const result = yield tripRepo.updateTripFavoritesByuserId(req.params.id, req.body);
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
tripController.put('/report/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tripRepo = req.app.get('tripsRepo');
    try {
        const existing = yield tripRepo.getTripById(req.params.id);
        try {
            const result = yield tripRepo.reportTripByuserId(req.params.id, req.body);
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
tripController.put('/admin/delete-report/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tripRepo = req.app.get('tripsRepo');
    try {
        const existing = yield tripRepo.getTripById(req.params.id);
        try {
            const result = yield tripRepo.deleteReportTripByuserId(req.params.id, req.body);
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
tripController.put('/edit-images/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const tripRepo = req.app.get('tripsRepo');
    try {
        const existing = yield tripRepo.getTripById(req.params.id);
        const fileName = req.body[0];
        const filePath = fileName;
        const index = (_a = existing.imageFile) === null || _a === void 0 ? void 0 : _a.indexOf(fileName);
        const editedListImage = existing === null || existing === void 0 ? void 0 : existing.imageFile;
        editedListImage.splice(index, 1);
        existing.imageFile = editedListImage;
        try {
            deleteFile(filePath);
            const result = yield tripRepo.editImagesByTripId(req.params.id, existing);
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
const deleteFile = (filePath) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield exports.storage.bucket('hack-trip')
            .file(filePath)
            .delete();
        console.log('File deleted from TRIP');
    }
    catch (err) {
        console.log(err.message);
    }
});
exports.default = tripController;
//# sourceMappingURL=tripController.js.map