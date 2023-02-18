"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
class User {
    constructor(_id, email, firstName, lastName, hashedPassword, timeCreated, timeEdited, lastTimeLogin, countOfLogs, imageFile, role, status) {
        this._id = _id;
        this.email = email;
        this.firstName = firstName;
        this.lastName = lastName;
        this.hashedPassword = hashedPassword;
        this.timeCreated = timeCreated;
        this.timeEdited = timeEdited;
        this.lastTimeLogin = lastTimeLogin;
        this.countOfLogs = countOfLogs;
        this.imageFile = imageFile;
        this.role = role;
        this.status = status;
    }
}
exports.User = User;
//# sourceMappingURL=user.js.map