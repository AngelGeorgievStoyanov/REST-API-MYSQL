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

async function daysOf(tripId: number): Promise<Array<{ id: number; day: number; title: string | null }>> {
    const response = await api(baseUrl, 'GET', `/api/v1/trips/${tripId}`);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body.days as Array<{ id: number; day: number; title: string | null }>;
}

async function createDay(tripId: number, body: unknown = {}): Promise<ApiResponse> {
    return api(baseUrl, 'POST', `/api/v1/trips/${tripId}/days`, { token: ownerToken, body });
}

describe('days', () => {
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

    test('a new trip owns exactly one day, numbered 1', async () => {
        const tripId = await createTrip();

        const days = await daysOf(tripId);
        assert.deepEqual(days.map((day) => day.day), [1]);
    });

    test('create without dayNumber assigns max + 1', async () => {
        const tripId = await createTrip();
        await createDay(tripId, { title: 'Second' });

        const days = await daysOf(tripId);
        assert.deepEqual(days.map((day) => day.day), [1, 2]);
    });

    test('explicit free dayNumber is used and gaps are allowed', async () => {
        const tripId = await createTrip();

        const first = await createDay(tripId, { dayNumber: 5, title: 'Fifth' });
        assert.equal(first.status, 201, JSON.stringify(first.body));
        assert.equal(first.body.day, 5);

        const second = await createDay(tripId, { dayNumber: 9 });
        assert.equal(second.status, 201);

        const days = await daysOf(tripId);
        assert.deepEqual(days.map((day) => day.day), [1, 5, 9]);
    });

    test('duplicate dayNumber answers 409 CONFLICT', async () => {
        const tripId = await createTrip();

        const duplicate = await createDay(tripId, { dayNumber: 1 });
        assert.equal(duplicate.status, 409, JSON.stringify(duplicate.body));
        assert.equal(duplicate.body.error?.code, 'CONFLICT');
    });

    test('client-controlled ownership and parent ids are rejected', async () => {
        const tripId = await createTrip();

        const response = await createDay(tripId, { ownerId: FOREIGN.id });
        assert.equal(response.status, 400, JSON.stringify(response.body));
        assert.equal(response.body.error?.code, 'VALIDATION_ERROR');
    });

    test('update cannot change dayNumber', async () => {
        const tripId = await createTrip();
        const dayId = (await daysOf(tripId))[0].id;

        const response = await api(baseUrl, 'PUT', `/api/v1/trips/${tripId}/days/${dayId}`, {
            token: ownerToken,
            body: { title: 'Edited', dayNumber: 7 },
        });

        assert.equal(response.status, 400, JSON.stringify(response.body));
        assert.equal(response.body.error?.code, 'VALIDATION_ERROR');
    });

    test('update changes day title and description', async () => {
        const tripId = await createTrip();
        const dayId = (await daysOf(tripId))[0].id;

        const response = await api(baseUrl, 'PUT', `/api/v1/trips/${tripId}/days/${dayId}`, {
            token: ownerToken,
            body: { title: 'Renamed day', description: 'Day description' },
        });

        assert.equal(response.status, 200, JSON.stringify(response.body));
        assert.equal(response.body.title, 'Renamed day');
    });

    test('reorder accepts the full ordered list and renumbers 1..n', async () => {
        const tripId = await createTrip();
        const second = await createDay(tripId, { title: 'Second' });
        const third = await createDay(tripId, { title: 'Third' });

        const ids = (await daysOf(tripId)).map((day) => day.id);
        const reorderedIds = [third.body.id as number, ids[0], second.body.id as number];
        const response = await api(baseUrl, 'PUT', `/api/v1/trips/${tripId}/days/reorder`, {
            token: ownerToken,
            body: { dayIds: reorderedIds },
        });

        assert.equal(response.status, 200, JSON.stringify(response.body));
        const days = response.body as unknown as Array<{ id: number; day: number }>;
        assert.deepEqual(days.map((day) => day.id), reorderedIds);
        assert.deepEqual(days.map((day) => day.day), [1, 2, 3]);
    });

    test('reorder rejects a foreign day, duplicates and an incomplete list', async () => {
        const tripId = await createTrip();
        const otherTripId = await createTrip();
        const otherDayId = (await daysOf(otherTripId))[0].id;
        const dayId = (await daysOf(tripId))[0].id;

        const reorder = (body: unknown) =>
            api(baseUrl, 'PUT', `/api/v1/trips/${tripId}/days/reorder`, { token: ownerToken, body });

        assert.equal((await reorder({ dayIds: [dayId, otherDayId] })).status, 400);
        assert.equal((await reorder({ dayIds: [dayId, dayId] })).status, 400);

        await createDay(tripId, { title: 'Second' });
        const incomplete = await reorder({ dayIds: [dayId] });
        assert.equal(incomplete.status, 400, JSON.stringify(incomplete.body));
        assert.equal(incomplete.body.error?.code, 'VALIDATION_ERROR');
    });

    test('reorder is atomic: a rejected list leaves the order untouched', async () => {
        const tripId = await createTrip();
        await createDay(tripId, { dayNumber: 4 });
        const before = await daysOf(tripId);

        const rejected = await api(baseUrl, 'PUT', `/api/v1/trips/${tripId}/days/reorder`, {
            token: ownerToken,
            body: { dayIds: [...before.map((day) => day.id), 99999999] },
        });
        assert.equal(rejected.status, 400, JSON.stringify(rejected.body));

        const after = await daysOf(tripId);
        assert.deepEqual(after.map((day) => day.id), before.map((day) => day.id));
        assert.deepEqual(after.map((day) => day.day), before.map((day) => day.day));
    });


    test('cross-trip day access answers 404 NOT_FOUND', async () => {
        const tripId = await createTrip();
        const otherTripId = await createTrip();
        const otherDayId = (await daysOf(otherTripId))[0].id;

        const response = await api(baseUrl, 'PUT', `/api/v1/trips/${tripId}/days/${otherDayId}`, {
            token: ownerToken,
            body: { title: 'Nope' },
        });

        assert.equal(response.status, 404, JSON.stringify(response.body));
        assert.equal(response.body.error?.code, 'NOT_FOUND');
    });

    test('another user cannot touch the days of a foreign trip', async () => {
        const tripId = await createTrip();
        const dayId = (await daysOf(tripId))[0].id;

        const response = await api(baseUrl, 'PUT', `/api/v1/trips/${tripId}/days/${dayId}`, {
            token: foreignToken,
            body: { title: 'Nope' },
        });

        assert.equal(response.status, 403, JSON.stringify(response.body));
        assert.equal(response.body.error?.code, 'FORBIDDEN');
    });

    test('an anonymous request is rejected with 401', async () => {
        const tripId = await createTrip();

        const response = await api(baseUrl, 'POST', `/api/v1/trips/${tripId}/days`, { body: { title: 'Anonymous' } });

        assert.equal(response.status, 401, JSON.stringify(response.body));
        assert.equal(response.body.error?.code, 'UNAUTHORIZED');
    });

    test('deleting a day clears its polymorphic targets and points', async () => {
        const tripId = await createTrip();
        const dayId = (await daysOf(tripId))[0].id;
        await createDay(tripId, { title: 'Keep this day' });

        const point = await api(baseUrl, 'POST', `/api/v1/trips/${tripId}/days/${dayId}/points`, {
            token: ownerToken,
            body: { title: 'Doomed point', latitude: 42.1, longitude: 23.3 },
        });
        assert.equal(point.status, 201, JSON.stringify(point.body));

        const dayType = await prisma.targetType.findFirst({ where: { name: 'trip' }, select: { id: true } });
        await prisma.comment.create({
            data: {
                nameAuthor: 'Tester',
                comment: 'should be removed with the day',
                ownerId: OWNER.id,
                targetTypeId: dayType!.id,
                targetId: dayId,
            },
        });

        const response = await api(baseUrl, 'DELETE', `/api/v1/trips/${tripId}/days/${dayId}`, { token: ownerToken });
        assert.equal(response.status, 204, JSON.stringify(response.body));

        assert.equal(await prisma.comment.count({ where: { targetTypeId: dayType!.id, targetId: dayId } }), 0);
        assert.equal(await prisma.point.count({ where: { tripId: dayId } }), 0);
        assert.equal(await prisma.trip.count({ where: { id: dayId } }), 0);
    });

    test('deleting the last day answers 409 CONFLICT', async () => {
        const tripId = await createTrip();
        const dayId = (await daysOf(tripId))[0].id;

        const response = await api(baseUrl, 'DELETE', `/api/v1/trips/${tripId}/days/${dayId}`, { token: ownerToken });

        assert.equal(response.status, 409, JSON.stringify(response.body));
        assert.equal(response.body.error?.code, 'CONFLICT');
        assert.equal((await daysOf(tripId)).length, 1);
    });
});
