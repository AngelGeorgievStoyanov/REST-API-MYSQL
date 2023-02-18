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
const multer = require("multer");
const tripController_1 = require("./tripController");
const pointController = express.Router();
pointController.post('/upload', multer({ storage: tripController_1.storage }).array('file', 12), function (req, res) {
    let files = req.files;
    res.status(200).json(files);
});
pointController.post('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const pointRepo = req.app.get('pointsRepo');
    try {
        const point = yield pointRepo.create(req.body);
        res.status(200).json(point);
    }
    catch (err) {
        res.json(err.message);
    }
}));
pointController.delete('/trip/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const pointRepo = req.app.get('pointsRepo');
    try {
        const result = yield pointRepo.deletePointByTripId(req.params.id);
        result.map((x) => {
            let images = x.imageFile;
            images.split(',').map((f) => {
                const filePath = f;
                try {
                    deleteFile(filePath);
                }
                catch (err) {
                    console.log(err);
                }
            });
        });
        res.json(result).status(204);
    }
    catch (err) {
        res.status(400).json(err.message);
    }
}));
pointController.get('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const pointRepo = req.app.get('pointsRepo');
    try {
        const points = yield pointRepo.findByTripId(req.params.id);
        res.status(200).json(points);
    }
    catch (err) {
        res.status(400).json(err.message);
    }
}));
pointController.delete('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const pointRepo = req.app.get('pointsRepo');
    try {
        const ownerTrip = req.body.idTrip;
        const result = yield pointRepo.deletePointById(req.params.id);
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
        const points = yield pointRepo.findBytripIdOrderByPointPosition(ownerTrip);
        points.forEach((x, i) => __awaiter(void 0, void 0, void 0, function* () {
            x.pointNumber = i + 1;
            let newPoint = x;
            const updated = yield pointRepo.updatePointById(x._id, newPoint);
        }));
        res.json(result).status(204);
    }
    catch (err) {
        res.status(400).json(err.message);
    }
}));
pointController.get('/edit/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const pointRepo = req.app.get('pointsRepo');
    try {
        const point = yield pointRepo.getPointById(req.params.id);
        res.status(200).json(point);
    }
    catch (err) {
        res.status(400).json(err.message);
    }
}));
pointController.put('/edit-position/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const pointRepo = req.app.get('pointsRepo');
    try {
        const existing1 = yield pointRepo.getPointById(req.body.currentCardId);
        const existing2 = yield pointRepo.getPointById(req.body.upCurrentCardId);
        try {
            const result = yield pointRepo.updatePointPositionById(req.body.currentCardId, req.body.currentIdNewPosition);
            const result1 = yield pointRepo.updatePointPositionById(req.body.upCurrentCardId, req.body.upCurrentCardNewPosition);
            const points = yield pointRepo.findByTripId(req.params.id);
            res.status(200).json(points);
        }
        catch (err) {
            res.status(400).json(err.message);
        }
    }
    catch (err) {
        res.status(400).json(err.message);
    }
}));
pointController.put('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const pointRepo = req.app.get('pointsRepo');
    try {
        const existing = yield pointRepo.getPointById(req.params.id);
        try {
            const result = yield pointRepo.updatePointById(req.params.id, req.body);
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
pointController.put('/edit-images/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const pointRepo = req.app.get('pointsRepo');
    try {
        const existing = yield pointRepo.getPointById(req.params.id);
        const fileName = req.body[0];
        const filePath = fileName;
        const index = (_a = existing.imageFile) === null || _a === void 0 ? void 0 : _a.indexOf(fileName);
        const editedListImage = existing === null || existing === void 0 ? void 0 : existing.imageFile;
        editedListImage.splice(index, 1);
        existing.imageFile = editedListImage;
        try {
            deleteFile(filePath);
            const result = yield pointRepo.editImagesByPointId(req.params.id, existing);
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
        yield tripController_1.storage.bucket('hack-trip')
            .file(filePath)
            .delete();
        console.log('File deleted from POINT');
    }
    catch (err) {
        console.log(err.message);
    }
});
exports.default = pointController;
//# sourceMappingURL=pointController.js.map