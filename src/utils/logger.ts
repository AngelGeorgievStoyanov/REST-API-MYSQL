import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
    level: isProduction ? 'info' : 'debug',
    redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-hacktrip-refresh"]',
        'req.headers["set-cookie"]',
        'res.headers["set-cookie"]',
        'req.body.password',
        'req.body.passwordConfirmation',
        'req.body.token',
        'req.body.refreshToken',
        'req.body.accessToken',
    ],
    transport: isProduction
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
            },
        },
});