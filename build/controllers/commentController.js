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
const commentController = express.Router();
commentController.get('/reports', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const commentRepo = req.app.get('commentsRepo');
    try {
        const comments = yield commentRepo.getAllReports();
        res.status(200).json(comments);
    }
    catch (err) {
        res.json(err.message);
    }
}));
commentController.post('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const commentRepo = req.app.get('commentsRepo');
    try {
        const comment = yield commentRepo.create(req.body);
        res.status(200).json(comment);
    }
    catch (err) {
        res.json(err.message);
    }
}));
commentController.get('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const commentRepo = req.app.get('commentsRepo');
    try {
        const comment = yield commentRepo.getCommentById(req.params.id);
        res.status(200).json(comment);
    }
    catch (err) {
        res.status(400).json(err.message);
    }
}));
commentController.get('/trip/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const commentRepo = req.app.get('commentsRepo');
    try {
        const comments = yield commentRepo.getCommentsByTripId(req.params.id);
        res.status(200).json(comments);
    }
    catch (err) {
        res.status(400).json(err.message);
    }
}));
commentController.put('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const commentRepo = req.app.get('commentsRepo');
    try {
        const result = yield commentRepo.updateCommentById(req.params.id, req.body);
        res.json(result);
    }
    catch (err) {
        res.status(400).json(err.message);
    }
}));
commentController.delete('/trip/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const commentRepo = req.app.get('commentsRepo');
    const result = yield commentRepo.deleteCommentByOwnerId(req.params.id);
    res.status(204).json(result);
}));
commentController.delete('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const commentRepo = req.app.get('commentsRepo');
    try {
        const result = yield commentRepo.deleteCommentById(req.params.id);
        res.json(result).status(204);
    }
    catch (err) {
        res.status(400).json(err.message);
    }
}));
commentController.put('/report/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const commentRepo = req.app.get('commentsRepo');
    try {
        const existing = yield commentRepo.getCommentById(req.params.id);
        try {
            const result = yield commentRepo.reportCommentByuserId(req.params.id, req.body);
            try {
                const comments = yield commentRepo.getCommentsByTripId(req.body._tripId);
                res.json(comments);
            }
            catch (err) {
                res.status(400).json(err.message);
            }
        }
        catch (err) {
            res.status(400).json(err.message);
        }
    }
    catch (err) {
        res.status(400).json(err.message);
    }
}));
commentController.put('/admin/delete-report/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const commentRepo = req.app.get('commentsRepo');
    try {
        const existing = yield commentRepo.getCommentById(req.params.id);
        try {
            const result = yield commentRepo.deleteReportCommentByuserId(req.params.id, req.body);
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
exports.default = commentController;
//# sourceMappingURL=commentController.js.map