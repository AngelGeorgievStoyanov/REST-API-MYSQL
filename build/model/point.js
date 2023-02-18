"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Point = void 0;
class Point {
    constructor(name, description, _ownerTripId, lat, lng, pointNumber, imageFile, _ownerId) {
        this.name = name;
        this.description = description;
        this._ownerTripId = _ownerTripId;
        this.lat = lat;
        this.lng = lng;
        this.pointNumber = pointNumber;
        this.imageFile = imageFile;
        this._ownerId = _ownerId;
    }
}
exports.Point = Point;
//# sourceMappingURL=point.js.map