"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Trip = exports.TypeOfPeople = exports.Transport = void 0;
var Transport;
(function (Transport) {
    Transport[Transport["Car"] = 0] = "Car";
    Transport[Transport["Bus"] = 1] = "Bus";
    Transport[Transport["Aircraft"] = 2] = "Aircraft";
    Transport[Transport["Another type"] = 3] = "Another type";
})(Transport = exports.Transport || (exports.Transport = {}));
var TypeOfPeople;
(function (TypeOfPeople) {
    TypeOfPeople[TypeOfPeople["Family"] = 0] = "Family";
    TypeOfPeople[TypeOfPeople["Family with children"] = 1] = "Family with children";
    TypeOfPeople[TypeOfPeople["Friends"] = 2] = "Friends";
    TypeOfPeople[TypeOfPeople["Another type"] = 3] = "Another type";
})(TypeOfPeople = exports.TypeOfPeople || (exports.TypeOfPeople = {}));
class Trip {
    constructor(title, description, price, transport = Transport.Car, countPeoples, typeOfPeople = TypeOfPeople.Family, destination, coments, likes, _ownerId, lat, lng, timeCreated, timeEdited, reportTrip, imageFile, favorites) {
        this.title = title;
        this.description = description;
        this.price = price;
        this.transport = transport;
        this.countPeoples = countPeoples;
        this.typeOfPeople = typeOfPeople;
        this.destination = destination;
        this.coments = coments;
        this.likes = likes;
        this._ownerId = _ownerId;
        this.lat = lat;
        this.lng = lng;
        this.timeCreated = timeCreated;
        this.timeEdited = timeEdited;
        this.reportTrip = reportTrip;
        this.imageFile = imageFile;
        this.favorites = favorites;
    }
}
exports.Trip = Trip;
//# sourceMappingURL=trip.js.map