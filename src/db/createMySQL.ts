export const createuser = `CREATE USER IF NOT EXISTS 'hack_trip'@'localhost' IDENTIFIED WITH mysql_native_password BY 'angel.stoyanov';`;
export const grantuser = `GRANT ALL PRIVILEGES ON *.* TO 'hack_trip'@'localhost';`;
export const flush = "FLUSH PRIVILEGES;";
export const database = `CREATE DATABASE IF NOT EXISTS hack_trip;`;
export const usedb = "USE hack_trip;";

export const users = `CREATE TABLE IF NOT EXISTS hack_trip.users (
    _id VARCHAR(36) NOT NULL,
    email VARCHAR(45) NOT NULL,
    firstName VARCHAR(45) NOT NULL,
    lastName VARCHAR(45) NOT NULL,
    hashedPassword VARCHAR(85) NOT NULL,
    timeCreated VARCHAR(24) NULL DEFAULT 'CURRENT_TIMESTAMP',
    timeEdited VARCHAR(24) NULL DEFAULT 'CURRENT_TIMESTAMP',
    lastTimeLogin VARCHAR(24) NULL DEFAULT NULL,
    countOfLogs BIGINT DEFAULT NULL,
    imageFile VARCHAR(2000) NULL DEFAULT NULL,
    role VARCHAR(8) NOT NULL DEFAULT 'user',
    status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
    verifyEmail TINYINT NULL DEFAULT 0,
    PRIMARY KEY (_id)
    );`;

export const trips = `CREATE TABLE IF NOT EXISTS hack_trip.trips (
    _id VARCHAR(36) NOT NULL,
    title VARCHAR(60) NOT NULL,
    description VARCHAR(2000) NULL,
    price DOUBLE NULL,
    transport VARCHAR(45) NULL DEFAULT NULL,
    countPeoples INT NOT NULL,
    typeOfPeople VARCHAR(45) NULL DEFAULT NULL,
    destination VARCHAR(60) NULL DEFAULT NULL,
    coments VARCHAR(3600) NULL DEFAULT NULL,
    likes VARCHAR(3600) NULL DEFAULT NULL,
    _ownerId VARCHAR(45) NULL DEFAULT NULL,
    lat DOUBLE NULL DEFAULT NULL,
    lng DOUBLE NULL DEFAULT NULL,
    timeCreated VARCHAR(24) NULL DEFAULT NULL,
    timeEdited VARCHAR(24) NULL DEFAULT NULL,
    reportTrip VARCHAR(360) NULL DEFAULT NULL,
    imageFile VARCHAR(2000) NULL DEFAULT NULL,
    favorites VARCHAR(3600) NULL DEFAULT NULL,
    currency VARCHAR(3) NULL DEFAULT 'EUR',
    dayNumber INT NOT NULL DEFAULT 1,
    tripGroupId VARCHAR(36) NOT NULL,
    PRIMARY KEY (_id)
    );`;

export const points = `CREATE TABLE IF NOT EXISTS hack_trip.points (
    _id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(1050) NULL DEFAULT NULL,
    _ownerTripId VARCHAR(45) NULL DEFAULT NULL,
    lat VARCHAR(45) NULL DEFAULT NULL,
    lng VARCHAR(45) NULL DEFAULT NULL,
    pointNumber VARCHAR(45) NOT NULL,
    imageFile VARCHAR(2000) NULL DEFAULT NULL,
    _ownerId VARCHAR(45) NOT NULL,
    timeCreated VARCHAR(24) NULL DEFAULT NULL,
    timeEdited VARCHAR(24) NULL DEFAULT NULL,
    countEdited INT NULL DEFAULT 0,
    PRIMARY KEY (_id)
    );`;

export const comments = `CREATE TABLE IF NOT EXISTS hack_trip.comments (
    _id VARCHAR(36) NOT NULL,
    nameAuthor VARCHAR(45) NOT NULL,
    comment VARCHAR(1000) NOT NULL,
    _tripId VARCHAR(45) NOT NULL,
    _ownerId VARCHAR(45) NOT NULL,
    reportComment VARCHAR(3600) NULL DEFAULT NULL,
    timeCreated VARCHAR(24) NULL DEFAULT NULL,
    timeEdited VARCHAR(24) NULL DEFAULT NULL,
    countEdited INT NULL DEFAULT 0,
    PRIMARY KEY (_id));`;

export const verify = `CREATE TABLE IF NOT EXISTS hack_trip.verify (
    _id INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    verifyToken VARCHAR(36) NOT NULL,
    userId VARCHAR(36) NOT NULL,
    verifyTokenForgotPassword VARCHAR(36) NULL,
    timeVerifyToken VARCHAR(24) NULL DEFAULT NULL,
    timeVerifyTokenForgotPassword VARCHAR(24) NULL DEFAULT NULL,
    countForgotPassword INT NULL DEFAULT 0
    );`;

export const logFailed = `CREATE TABLE IF NOT EXISTS hack_trip.failedlogs (
    _id VARCHAR(36) NOT NULL,
    date VARCHAR(45) NULL,
    email VARCHAR(45) NOT NULL,
    userAgent VARCHAR(145) NOT NULL,
    ip VARCHAR(45) NULL,
    country_code VARCHAR(45) NULL,
    country_name VARCHAR(145) NULL,
    city VARCHAR(145) NULL,
    postal VARCHAR(145) NULL,
    latitude DOUBLE(30,27) NULL,
    longitude DOUBLE(30,27) NULL,
    state VARCHAR(45) NULL,
    PRIMARY KEY (_id));`;

export const routeNotFoundLogs = `CREATE TABLE IF NOT EXISTS hack_trip.routenotfoundlogs (
        _id VARCHAR(36) NOT NULL,
        date VARCHAR(45) NULL DEFAULT NULL,
        reqUrl VARCHAR(145) NULL DEFAULT NULL,
        reqMethod VARCHAR(15) NULL DEFAULT NULL,
        reqHeaders VARCHAR(1000) NULL DEFAULT NULL,
        reqQuery VARCHAR(145) NULL DEFAULT NULL,
        reqBody VARCHAR(1000) NULL DEFAULT NULL,
        reqParams VARCHAR(145) NULL DEFAULT NULL,
        reqIp VARCHAR(1000) NULL DEFAULT NULL,
        reqUserId VARCHAR(36) NULL DEFAULT NULL,
        reqUserEmail VARCHAR(245) NULL DEFAULT NULL,
        PRIMARY KEY (_id));`;
