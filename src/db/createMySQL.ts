export const users = `CREATE TABLE IF NOT EXISTS hack_trip.users (
    _id BIGINT NOT NULL AUTO_INCREMENT,
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
    PRIMARY KEY (_id),
    UNIQUE INDEX _id_UNIQUE (_id ASC) VISIBLE,
    UNIQUE INDEX email_UNIQUE (email ASC) VISIBLE)
  `;

export const trips = `CREATE TABLE IF NOT EXISTS hack_trip.trips (
    _id BIGINT NOT NULL AUTO_INCREMENT,
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
    PRIMARY KEY (_id),
    UNIQUE INDEX _id_UNIQUE (_id ASC) VISIBLE)
  `;


export const points = `CREATE TABLE IF NOT EXISTS hack_trip.points (
    _id BIGINT NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(1050) NULL DEFAULT NULL,
    _ownerTripId VARCHAR(45) NULL DEFAULT NULL,
    lat VARCHAR(45) NULL DEFAULT NULL,
    lng VARCHAR(45) NULL DEFAULT NULL,
    pointNumber VARCHAR(45) NOT NULL,
    imageFile VARCHAR(2000) NULL DEFAULT NULL,
    _ownerId VARCHAR(45) NOT NULL,
    PRIMARY KEY (_id))
  `;

export const comments = `CREATE TABLE IF NOT EXISTS hack_trip.comments (
    _id BIGINT NOT NULL AUTO_INCREMENT,
    nameAuthor VARCHAR(45) NOT NULL,
    comment VARCHAR(1000) NOT NULL,
    _tripId VARCHAR(45) NOT NULL,
    _ownerId VARCHAR(45) NOT NULL,
    reportTrip VARCHAR(45) NULL DEFAULT NULL,
    PRIMARY KEY (_id),
    UNIQUE INDEX _id_UNIQUE (_id ASC) VISIBLE)
  `;