import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prisma } from '../clients/prisma';
import { dynamicConfig } from '../config/dynamicConfig';
import { loadEnvironmentConfig } from '../config/environment';
import { ConfigRepository } from '../services/configRepository';
import { api, OWNER, startTestServer, tokenFor, TRIP_BODY } from './apiTestApp';
import { cleanupTrips } from './testDatabase';

const ownerToken = tokenFor(OWNER);

let baseUrl = '';
let closeServer: () => Promise<void>;
const createdTrips: number[] = [];

async function createTrip(body: unknown = TRIP_BODY): Promise<number> {
    const response = await api(baseUrl, 'POST', '/api/v1/trips', { token: ownerToken, body });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    const tripId = response.body.id as number;
    createdTrips.push(tripId);
    return tripId;
}

describe('trip endpoints own trip-level data only', () => {
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

    test('trip create makes the group plus its first day and no points', async () => {
        const tripId = await createTrip();

        const response = await api(baseUrl, 'GET', `/api/v1/trips/${tripId}`);
        assert.equal(response.status, 200, JSON.stringify(response.body));
        assert.deepEqual((response.body.days as Array<{ day: number; points: unknown[] }>).map((day) => day.day), [1]);
        assert.equal((response.body.days as Array<{ points: unknown[] }>)[0].points.length, 0);
        assert.equal(await prisma.point.count({ where: { trip: { tripGroupId: tripId } } }), 0);
    });

    test('nested days and points in the trip body are rejected', async () => {
        const created = await api(baseUrl, 'POST', '/api/v1/trips', {
            token: ownerToken,
            body: { ...TRIP_BODY, days: [{ day: 1, points: [] }] },
        });
        assert.equal(created.status, 400, JSON.stringify(created.body));
        assert.equal(created.body.error?.code, 'VALIDATION_ERROR');

        const tripId = await createTrip();
        const updated = await api(baseUrl, 'PUT', `/api/v1/trips/${tripId}`, {
            token: ownerToken,
            body: { ...TRIP_BODY, title: 'Nope', days: [] },
        });
        assert.equal(updated.status, 400, JSON.stringify(updated.body));
        assert.equal(updated.body.error?.code, 'VALIDATION_ERROR');

        const withPoints = await api(baseUrl, 'PUT', `/api/v1/trips/${tripId}`, {
            token: ownerToken,
            body: { ...TRIP_BODY, title: 'Nope', points: [] },
        });
        assert.equal(withPoints.status, 400, JSON.stringify(withPoints.body));
    });

    test('trip update writes the metadata of the canonical day', async () => {
        const tripId = await createTrip();

        const response = await api(baseUrl, 'PUT', `/api/v1/trips/${tripId}`, {
            token: ownerToken,
            body: { title: 'Renamed trip', description: 'Updated', group: 'family', transport: 'bus' },
        });
        assert.equal(response.status, 200, JSON.stringify(response.body));

        const day = await prisma.trip.findFirstOrThrow({ where: { tripGroupId: tripId, dayNumber: 1 } });
        assert.equal(day.title, 'Renamed trip');
        assert.equal(day.description, 'Updated');
        assert.equal(day.typeOfPeople, 'family');
        assert.equal(day.transport, 'bus');
        const body = response.body as { group: { key: string }; transport: { key: string } };
        assert.equal(body.group.key, 'family');
        assert.equal(body.transport.key, 'bus');
    });

    test('transport and group accept the stored display value as well as the key', async () => {
        const tripId = await createTrip({ ...TRIP_BODY, group: 'Friends', transport: 'Car' });

        const response = await api(baseUrl, 'GET', `/api/v1/trips/${tripId}`);
        assert.equal(response.status, 200, JSON.stringify(response.body));
        const body = response.body as { group: unknown; transport: unknown };
        assert.deepEqual(body.group, { id: tripId, key: 'friends', name: 'Friends' });
        assert.deepEqual(body.transport, { key: 'car', name: 'Car' });
    });
});
