import express from 'express';
import jwt from 'jsonwebtoken';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import apiRouter from '../routes/apiRouter';

/** Seeded users of the test database. */
export const OWNER = { id: 'd325d9ff-7658-452b-a00a-82463a662c12', role: 'user' };
export const FOREIGN = { id: '191ff979-5438-4ea8-865e-5724257a8fd6', role: 'user' };

export interface Actor {
    id: string;
    role: string;
}

export interface ApiResponse {
    status: number;
    body: {
        error?: { code: string; message: string };
        [key: string]: unknown;
    };
}

export function tokenFor(actor: Actor): string {
    return jwt.sign({ _id: actor.id, role: actor.role }, process.env.secret as string);
}

export async function startTestServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/api', apiRouter);

    const server = await new Promise<Server>((resolve) => {
        const started = app.listen(0, () => resolve(started));
    });
    const { port } = server.address() as AddressInfo;

    return {
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((resolve) => server.close(() => resolve())),
    };
}

export async function api(
    baseUrl: string,
    method: string,
    path: string,
    options: { token?: string; body?: unknown } = {},
): Promise<ApiResponse> {
    const headers: Record<string, string> = {};
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();

    let parsed: unknown = null;
    try {
        parsed = text.length > 0 ? JSON.parse(text) : null;
    } catch {
        parsed = text;
    }
    return { status: response.status, body: parsed as ApiResponse['body'] };
}

export const TRIP_BODY = {
    title: 'Contract test trip',
    description: 'Created by the API contract tests.',
    group: 'friends',
    transport: 'car',
};
