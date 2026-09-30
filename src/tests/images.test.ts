import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prisma } from '../clients/prisma';
import { dynamicConfig } from '../services/dynamicConfig';
import { loadEnvironmentConfig } from '../config/environment';
import { ConfigRepository } from '../repositories/configRepository';
import { PointRepository } from '../repositories/pointRepository';
import { PointService } from '../services/pointService';
import { TripRepository } from '../repositories/tripRepository';
import { TripService } from '../services/tripService';
import { ImageFileStorage } from '../storage/imageFileStorage';
import { cleanupTrips } from './testDatabase';

const OWNER = { id: 'd325d9ff-7658-452b-a00a-82463a662c12', role: 'user' };
const FOREIGN = { id: '191ff979-5438-4ea8-865e-5724257a8fd6', role: 'user' };

/** Storage double: records removals and can be told to fail. */
class FakeStorage implements ImageFileStorage {
    public removed: string[] = [];
    public failure: Error | null = null;

    async remove(filePath: string): Promise<void> {
        if (this.failure) throw this.failure;
        this.removed.push(filePath);
    }

    async removeMany(filePaths: string[]): Promise<void> {
        for (const filePath of filePaths) await this.remove(filePath);
    }

    async list(): Promise<string[]> {
        return [];
    }
}

const storage = new FakeStorage();
const repository = new TripRepository(prisma);
const tripService = new TripService(repository, storage);
const pointService = new PointService(new PointRepository(prisma), storage);

const createdTrips: number[] = [];
let tripId = 0;
let dayId = 0;
let pointId = 0;

describe('images', () => {
    before(async () => {
        await dynamicConfig.init(new ConfigRepository(prisma), loadEnvironmentConfig());

        const group = await prisma.tripGroup.create({
            data: {
                ownerId: OWNER.id,
                createdAt: new Date(),
                trips: { create: [{ title: 'Image test trip', dayNumber: 1, countPeoples: 1, ownerId: OWNER.id }] },
            },
            include: { trips: true },
        });
        tripId = group.id;
        dayId = group.trips[0].id;
        createdTrips.push(tripId);

        const point = await prisma.point.create({
            data: { name: 'Point', pointNumber: '1', ownerId: OWNER.id, tripId: dayId, createdAt: new Date() },
            select: { id: true },
        });
        pointId = point.id;
    });

    after(async () => {
        await cleanupTrips([tripId]);
        await prisma.$disconnect();
    });

    test('day image upload creates exactly one parent image row and returns the resource', async () => {
        const resource = await tripService.addDayImage(OWNER, String(tripId), String(dayId), 'day-photo.jpg');

        assert.equal(typeof resource.id, 'number');
        assert.equal(resource.filePath, 'day-photo.jpg');
        assert.ok(resource.url.endsWith('/day-photo.jpg'), resource.url);
        assert.ok(resource.thumbnailUrl.endsWith('/day-photo_thumb.webp'), resource.thumbnailUrl);

        const row = await prisma.image.findUnique({ where: { id: resource.id } });
        assert.equal(row?.tripId, dayId);
        assert.equal(row?.pointId, null);
        assert.equal(row?.ownerId, OWNER.id);
    });

    test('point image upload attaches the image to the point only', async () => {
        const resource = await pointService.addPointImage(OWNER, String(pointId), 'point-photo.png');

        const row = await prisma.image.findUnique({ where: { id: resource.id } });
        assert.equal(row?.pointId, pointId);
        assert.equal(row?.tripId, null);
    });

    test('delete removes the stored file and the row, keyed by image id', async () => {
        const resource = await tripService.addDayImage(OWNER, String(tripId), String(dayId), 'to-delete.jpg');
        storage.removed = [];

        await tripService.deleteImage(OWNER, String(resource.id));

        assert.deepEqual(storage.removed, ['to-delete.jpg']);
        assert.equal(await prisma.image.count({ where: { id: resource.id } }), 0);
    });

    test('another user cannot delete the image of a foreign trip', async () => {
        const resource = await tripService.addDayImage(OWNER, String(tripId), String(dayId), 'foreign-guard.jpg');

        await assert.rejects(() => tripService.deleteImage(FOREIGN, String(resource.id)), /Only the trip owner/);
        assert.equal(await prisma.image.count({ where: { id: resource.id } }), 1);
    });

    test('an unknown image answers 404 and a storage failure is not swallowed', async () => {
        await assert.rejects(() => tripService.deleteImage(OWNER, '99999999'), /not found/i);

        const resource = await tripService.addDayImage(OWNER, String(tripId), String(dayId), 'failing.jpg');
        storage.failure = new Error('GCS unavailable');
        await assert.rejects(() => tripService.deleteImage(OWNER, String(resource.id)), /GCS unavailable/);
        storage.failure = null;

        assert.equal(await prisma.image.count({ where: { id: resource.id } }), 1);
    });

    test('day delete clears day and point image files through storage', async () => {
        const secondDay = await prisma.trip.create({
            data: { title: 'Day 2', dayNumber: 2, countPeoples: 1, ownerId: OWNER.id, tripGroupId: tripId },
            select: { id: true },
        });
        await tripService.addDayImage(OWNER, String(tripId), String(secondDay.id), 'day2.jpg');
        storage.removed = [];

        await tripService.deleteDay(OWNER, String(tripId), String(secondDay.id));

        assert.deepEqual(storage.removed, ['day2.jpg']);
        assert.equal(await prisma.trip.count({ where: { id: secondDay.id } }), 0);
    });
});
