import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prisma } from '../clients/prisma';
import { dynamicConfig } from '../config/dynamicConfig';
import { loadEnvironmentConfig } from '../config/environment';
import { ConfigRepository } from '../services/configRepository';
import { api, ApiResponse, FOREIGN, OWNER, startTestServer, tokenFor, TRIP_BODY } from './apiTestApp';
import { cleanupTrips } from './testDatabase';

const ownerToken = tokenFor(OWNER);
const foreignToken = tokenFor(FOREIGN);

let baseUrl = '';
let closeServer: () => Promise<void>;
const createdTrips: number[] = [];

async function createTrip(): Promise<number> {
    const response = await api(baseUrl, 'POST', '/api/v1/trips', { token: ownerToken, body: TRIP_BODY });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    const tripId = response.body.id as number;
    createdTrips.push(tripId);
    return tripId;
}

async function firstDayId(tripId: number): Promise<number> {
    const response = await api(baseUrl, 'GET', `/api/v1/trips/${tripId}`);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return (response.body.days as Array<{ id: number }>)[0].id;
}

async function createPoint(tripId: number, dayId: number, title: string): Promise<ApiResponse> {
    return api(baseUrl, 'POST', `/api/v1/trips/${tripId}/days/${dayId}/points`, {
        token: ownerToken,
        body: { title, latitude: 42.1, longitude: 23.3 },
    });
}

async function pointNumbers(dayId: number): Promise<string[]> {
    const points = await prisma.point.findMany({ where: { tripId: dayId }, select: { pointNumber: true } });
    return points.map((point) => point.pointNumber).sort((left, right) => Number(left) - Number(right));
}

describe('points', () => {
    before(async () => {
        const server = await startTestServer();
        baseUrl = server.baseUrl;
        closeServer = server.close;
        await dynamicConfig.init(new ConfigRepository(prisma), loadEnvironmentConfig());
    });

    after(async () => {
        await cleanupTrips(createdTrips);
        await closeServer();
        await prisma.$disconnect();
    });

    test('pointNumber is assigned by the server, starting at 1', async () => {
        const tripId = await createTrip();
        const dayId = await firstDayId(tripId);

        const first = await createPoint(tripId, dayId, 'First');
        const second = await createPoint(tripId, dayId, 'Second');

        assert.equal(first.status, 201, JSON.stringify(first.body));
        assert.equal(second.status, 201, JSON.stringify(second.body));
        assert.deepEqual(await pointNumbers(dayId), ['1', '2']);
        assert.equal((await prisma.point.findUnique({ where: { id: first.body.id as number } }))?.ownerId, OWNER.id);
    });

    test('a client-sent pointNumber or ownerId is rejected', async () => {
        const tripId = await createTrip();
        const dayId = await firstDayId(tripId);

        const pointNumber = await api(baseUrl, 'POST', `/api/v1/trips/${tripId}/days/${dayId}/points`, {
            token: ownerToken,
            body: { title: 'Sneaky', latitude: 42.1, longitude: 23.3, pointNumber: 7 },
        });
        const ownerId = await api(baseUrl, 'POST', `/api/v1/trips/${tripId}/days/${dayId}/points`, {
            token: ownerToken,
            body: { title: 'Sneaky', latitude: 42.1, longitude: 23.3, ownerId: FOREIGN.id },
        });

        assert.equal(pointNumber.status, 400, JSON.stringify(pointNumber.body));
        assert.equal(pointNumber.body.error?.code, 'VALIDATION_ERROR');
        assert.equal(ownerId.status, 400, JSON.stringify(ownerId.body));
        assert.equal(ownerId.body.error?.code, 'VALIDATION_ERROR');
    });

    test('updating pointNumber is rejected', async () => {
        const tripId = await createTrip();
        const dayId = await firstDayId(tripId);
        const point = await createPoint(tripId, dayId, 'Point');

        const response = await api(
            baseUrl,
            'PUT',
            `/api/v1/trips/${tripId}/days/${dayId}/points/${point.body.id as number}`,
            { token: ownerToken, body: { pointNumber: 5 } },
        );

        assert.equal(response.status, 400, JSON.stringify(response.body));
        assert.equal(response.body.error?.code, 'VALIDATION_ERROR');
    });

    test('point data can be updated', async () => {
        const tripId = await createTrip();
        const dayId = await firstDayId(tripId);
        const point = await createPoint(tripId, dayId, 'Point');

        const response = await api(
            baseUrl,
            'PUT',
            `/api/v1/trips/${tripId}/days/${dayId}/points/${point.body.id as number}`,
            { token: ownerToken, body: { title: 'Renamed', description: 'New', latitude: 41.5, longitude: 24.75 } },
        );

        assert.equal(response.status, 200, JSON.stringify(response.body));
        assert.equal(response.body.title, 'Renamed');
        assert.equal(response.body.latitude, 41.5);
        assert.equal(response.body.longitude, 24.75);
    });

    test('deleting a point compacts the sequence without holes', async () => {
        const tripId = await createTrip();
        const dayId = await firstDayId(tripId);
        const first = await createPoint(tripId, dayId, 'First');
        const second = await createPoint(tripId, dayId, 'Second');
        await createPoint(tripId, dayId, 'Third');

        const response = await api(
            baseUrl,
            'DELETE',
            `/api/v1/trips/${tripId}/days/${dayId}/points/${second.body.id as number}`,
            { token: ownerToken },
        );
        assert.equal(response.status, 204, JSON.stringify(response.body));

        assert.deepEqual(await pointNumbers(dayId), ['1', '2']);
        const remaining = await prisma.point.findMany({
            where: { tripId: dayId },
            orderBy: { id: 'asc' },
            select: { name: true, pointNumber: true },
        });
        assert.deepEqual(remaining.map((point) => `${point.pointNumber}:${point.name}`), ['1:First', '2:Third']);
        assert.equal((await prisma.point.findUnique({ where: { id: first.body.id as number } }))?.pointNumber, '1');
    });

    test('deleting a point clears its polymorphic targets', async () => {
        const tripId = await createTrip();
        const dayId = await firstDayId(tripId);
        const point = await createPoint(tripId, dayId, 'Doomed');
        const pointId = point.body.id as number;

        const pointType = await prisma.targetType.findFirst({ where: { name: 'point' }, select: { id: true } });
        await prisma.comment.create({
            data: {
                nameAuthor: 'Tester',
                comment: 'removed with the point',
                ownerId: OWNER.id,
                targetTypeId: pointType!.id,
                targetId: pointId,
            },
        });

        const response = await api(baseUrl, 'DELETE', `/api/v1/trips/${tripId}/days/${dayId}/points/${pointId}`, {
            token: ownerToken,
        });
        assert.equal(response.status, 204, JSON.stringify(response.body));

        assert.equal(await prisma.comment.count({ where: { targetTypeId: pointType!.id, targetId: pointId } }), 0);
    });

    test('reorder renumbers the full list 1..n in the given order', async () => {
        const tripId = await createTrip();
        const dayId = await firstDayId(tripId);
        const first = await createPoint(tripId, dayId, 'First');
        const second = await createPoint(tripId, dayId, 'Second');
        const third = await createPoint(tripId, dayId, 'Third');

        const pointIds = [third.body.id as number, first.body.id as number, second.body.id as number];
        const response = await api(baseUrl, 'PUT', `/api/v1/trips/${tripId}/days/${dayId}/points/reorder`, {
            token: ownerToken,
            body: { pointIds },
        });

        assert.equal(response.status, 200, JSON.stringify(response.body));
        assert.deepEqual((response.body as unknown as Array<{ id: number }>).map((point) => point.id), pointIds);

        const stored = await prisma.point.findMany({
            where: { tripId: dayId },
            orderBy: { id: 'asc' },
            select: { name: true, pointNumber: true },
        });
        assert.deepEqual(stored.map((point) => `${point.pointNumber}:${point.name}`), ['2:First', '3:Second', '1:Third']);
    });

    test('reorder rejects a foreign point, duplicates and an incomplete list', async () => {
        const tripId = await createTrip();
        const dayId = await firstDayId(tripId);
        const otherTripId = await createTrip();
        const otherDayId = await firstDayId(otherTripId);

        const own = await createPoint(tripId, dayId, 'Own');
        const foreign = await createPoint(otherTripId, otherDayId, 'Foreign');

        const reorder = (body: unknown) =>
            api(baseUrl, 'PUT', `/api/v1/trips/${tripId}/days/${dayId}/points/reorder`, { token: ownerToken, body });

        assert.equal((await reorder({ pointIds: [own.body.id, foreign.body.id] })).status, 400);
        assert.equal((await reorder({ pointIds: [own.body.id, own.body.id] })).status, 400);

        await createPoint(tripId, dayId, 'Second');
        const incomplete = await reorder({ pointIds: [own.body.id] });
        assert.equal(incomplete.status, 400, JSON.stringify(incomplete.body));
        assert.equal(incomplete.body.error?.code, 'VALIDATION_ERROR');
    });

    test('cross-day and cross-trip point access answers 404', async () => {
        const tripId = await createTrip();
        const otherTripId = await createTrip();
        const dayId = await firstDayId(tripId);
        const otherDayId = await firstDayId(otherTripId);

        const own = await createPoint(tripId, dayId, 'Own');
        const foreign = await createPoint(otherTripId, otherDayId, 'Foreign');

        const wrongDay = await api(
            baseUrl,
            'PUT',
            `/api/v1/trips/${tripId}/days/${otherDayId}/points/${own.body.id as number}`,
            { token: ownerToken, body: { title: 'Nope' } },
        );
        const wrongTrip = await api(
            baseUrl,
            'PUT',
            `/api/v1/trips/${tripId}/days/${dayId}/points/${foreign.body.id as number}`,
            { token: ownerToken, body: { title: 'Nope' } },
        );

        assert.equal(wrongDay.status, 404, JSON.stringify(wrongDay.body));
        assert.equal(wrongTrip.status, 404, JSON.stringify(wrongTrip.body));
    });

    test('another user cannot touch the points of a foreign trip', async () => {
        const tripId = await createTrip();
        const dayId = await firstDayId(tripId);
        const point = await createPoint(tripId, dayId, 'Own');

        const response = await api(
            baseUrl,
            'PUT',
            `/api/v1/trips/${tripId}/days/${dayId}/points/${point.body.id as number}`,
            { token: foreignToken, body: { title: 'Nope' } },
        );

        assert.equal(response.status, 403, JSON.stringify(response.body));
        assert.equal(response.body.error?.code, 'FORBIDDEN');
    });
});
