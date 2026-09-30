import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prisma } from '../clients/prisma';
import { dynamicConfig } from '../config/dynamicConfig';
import { loadEnvironmentConfig } from '../config/environment';
import { ConfigRepository } from '../services/configRepository';
import { api, FOREIGN, OWNER, startTestServer, tokenFor, TRIP_BODY } from './apiTestApp';
import { cleanupTrips } from './testDatabase';

const ownerToken = tokenFor(OWNER);
const foreignToken = tokenFor(FOREIGN);

let baseUrl = '';
let closeServer: () => Promise<void>;
let tripId = 0;
let dayId = 0;
let imageId = 0;

/**
 * Guard paths of the image endpoints. The upload itself needs the GCS engine
 * (native `sharp`), so the write path is covered by the service-level suite.
 */
describe('image endpoint guards', () => {
    before(async () => {
        const server = await startTestServer();
        baseUrl = server.baseUrl;
        closeServer = server.close;
        await dynamicConfig.init(new ConfigRepository(prisma), loadEnvironmentConfig());

        const trip = await api(baseUrl, 'POST', '/api/v1/trips', { token: ownerToken, body: TRIP_BODY });
        assert.equal(trip.status, 201, JSON.stringify(trip.body));
        tripId = trip.body.id as number;

        const details = await api(baseUrl, 'GET', `/api/v1/trips/${tripId}`);
        assert.equal(details.status, 200, JSON.stringify(details.body));
        dayId = (details.body.days as Array<{ id: number }>)[0].id;

        const image = await prisma.image.create({
            data: { ownerId: OWNER.id, filePath: 'guard.jpg', tripId: dayId },
            select: { id: true },
        });
        imageId = image.id;
    });

    after(async () => {
        await cleanupTrips([tripId]);
        await closeServer();
        await prisma.$disconnect();
    });

    test('uploading without a token is rejected with 401', async () => {
        const response = await api(baseUrl, 'POST', `/api/v1/trips/${tripId}/days/${dayId}/images`);

        assert.equal(response.status, 401, JSON.stringify(response.body));
        assert.equal(response.body.error?.code, 'UNAUTHORIZED');
    });

    test('uploading to a foreign day is rejected with 403 before any file is stored', async () => {
        const response = await api(baseUrl, 'POST', `/api/v1/trips/${tripId}/days/${dayId}/images`, {
            token: foreignToken,
        });

        assert.equal(response.status, 403, JSON.stringify(response.body));
        assert.equal(response.body.error?.code, 'FORBIDDEN');
    });

    test('uploading into an unknown day is rejected with 404', async () => {
        const response = await api(baseUrl, 'POST', `/api/v1/trips/${tripId}/days/99999999/images`, {
            token: ownerToken,
        });

        assert.equal(response.status, 404, JSON.stringify(response.body));
        assert.equal(response.body.error?.code, 'NOT_FOUND');
    });

    test('deleting an unknown image answers 404 and a foreign one answers 403', async () => {
        const missing = await api(baseUrl, 'DELETE', '/api/v1/images/99999999', { token: ownerToken });
        assert.equal(missing.status, 404, JSON.stringify(missing.body));

        const foreign = await api(baseUrl, 'DELETE', `/api/v1/images/${imageId}`, { token: foreignToken });
        assert.equal(foreign.status, 403, JSON.stringify(foreign.body));
        assert.equal(await prisma.image.count({ where: { id: imageId } }), 1);
    });
});
