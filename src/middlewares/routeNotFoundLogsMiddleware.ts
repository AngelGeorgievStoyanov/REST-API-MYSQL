import { Request, Response, NextFunction } from 'express';
import { IRouteNotFoundLogsRepository } from '../interface/routeNotFoundLogs-repository';
import { IRouteNotFoundLogs } from '../model/routeNotFoudLogs';
var ip = require('ip');


export const routeNotFoundLogsMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const routeNotFoundLogsRepo: IRouteNotFoundLogsRepository<IRouteNotFoundLogs> = req.app.get('routeNotFoundLogsRepo');

    try {
        await routeNotFoundLogsRepo.create(
            req.originalUrl,
            req.method,
            req.headers,
            req.query,
            req.body,
            req.params,
            ip.address() ||
            req.header('x-forwarded-for') ||
            req.socket.remoteAddress ||
            req.ip,
            req['user']?.id,
            req['user']?.email
        );

        console.log('Route not found!');

        res.status(404).json('Route not found!');
    } catch (err) {
        console.log(err.message);
        res.status(404).json('Route not found!');
    }
};
