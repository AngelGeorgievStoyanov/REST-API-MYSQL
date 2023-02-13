export const database='CREATE DATABASE IF NOT EXISTS hack_trip'


export const users = `CREATE TABLE IF NOT EXISTS hack_trip.users (
    _id VARCHAR(36) NOT NULL,
    email VARCHAR(45) NOT NULL,
    firstName VARCHAR(45) NOT NULL,
    lastName VARCHAR(45) NOT NULL,
    hashedPassword VARCHAR(85) NOT NULL,
    timeCreated DATE NULL DEFAULT NULL,
    timeEdited DATE NULL DEFAULT NULL,
    lastTimeLogin DATE NULL DEFAULT NULL,
    countOfLogs BIGINT DEFAULT NULL,
    imageFile VARCHAR(2000) NULL DEFAULT NULL,
    role VARCHAR(8) NOT NULL DEFAULT 'user',
    status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
    PRIMARY KEY (_id))`;

export const trips = `CREATE TABLE IF NOT EXISTS hack_trip.trips (
    _id VARCHAR(36) NOT NULL,
    title VARCHAR(60) NOT NULL,
    description VARCHAR(2000) NULL,
    price DOUBLE NULL,
    transport VARCHAR(45) NULL DEFAULT NULL,
    countPeoples INT NOT NULL,
    typeOfPeople VARCHAR(45) NULL DEFAULT NULL,
    destination VARCHAR(60) NULL DEFAULT NULL,
    coments VARCHAR(45) NULL DEFAULT NULL,
    likes VARCHAR(45) NULL DEFAULT NULL,
    _ownerId VARCHAR(45) NULL DEFAULT NULL,
    lat DOUBLE NULL DEFAULT NULL,
    lng DOUBLE NULL DEFAULT NULL,
    timeCreated DATE NULL DEFAULT NULL,
    timeEdited DATE NULL DEFAULT NULL,
    reportTrip VARCHAR(45) NULL DEFAULT NULL,
    imageFile VARCHAR(2000) NULL DEFAULT NULL,
    favorites VARCHAR(45) NULL DEFAULT NULL,
    PRIMARY KEY (_id));`


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
    PRIMARY KEY (_id));`

export const comments = `CREATE TABLE IF NOT EXISTS hack_trip.comments (
    _id VARCHAR(36) NOT NULL,
    nameAuthor VARCHAR(45) NOT NULL,
    comment VARCHAR(1000) NOT NULL,
    _tripId VARCHAR(45) NOT NULL,
    _ownerId VARCHAR(45) NOT NULL,
    reportComment VARCHAR(45) NULL DEFAULT NULL,
    PRIMARY KEY (_id));`