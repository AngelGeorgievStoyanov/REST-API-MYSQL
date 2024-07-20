import { Request, Response, NextFunction } from 'express';
import { IRouteNotFoundLogsRepository } from '../interface/routeNotFoundLogs-repository';
import { IRouteNotFoundLogs } from '../model/routeNotFoudLogs';
var ip = require('ip');


export const routeNotFoundLogsMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const routeNotFoundLogsRepo: IRouteNotFoundLogsRepository<IRouteNotFoundLogs> = req.app.get('routeNotFoundLogsRepo');

    try {
        const clientIp = [
            req.header('x-real-ip') ? `x-real-ip: ${req.header('x-real-ip')}` : null,
            req.header('x-forwarded-for') ? `x-forwarded-for: ${req.header('x-forwarded-for')}` : null,
            req.socket.remoteAddress ? `remoteAddress: ${req.socket.remoteAddress}` : null,
            req.ip ? `req.ip: ${req.ip}` : null,
            `server-ip: ${ip.address()}`
        ].filter(Boolean).join(', ');
      
        await routeNotFoundLogsRepo.create(
            req.originalUrl,
            req.method,
            req.headers,
            req.query,
            req.body,
            req.params,
            clientIp,
            req['user']?.id,
            req['user']?.email
        );

        console.log(req.originalUrl,'Route not found!');

        res.status(404).json('Route not found!');
    } catch (err) {
        console.log(err.message);
        res.status(404).json('Route not found!');
    }
};
