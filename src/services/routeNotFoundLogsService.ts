import { Pool } from "mysql";
import { IRouteNotFoundLogsRepository } from "../interface/routeNotFoundLogs-repository";
import { IRouteNotFoundLogs } from "../model/routeNotFoudLogs";
import { v4 as uuid } from "uuid";

const createSql = `INSERT INTO hack_trip.routenotfoundlogs (
    _id,
    date,
    reqUrl,
    reqMethod,
    reqHeaders,
    reqQuery,
    reqBody,
    reqParams,
    reqIp,
    reqUserId,
    reqUserEmail
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;

export class RouteNotFoudLogsRepository
  implements IRouteNotFoundLogsRepository<IRouteNotFoundLogs>
{
  constructor(protected pool: Pool) {}

  async create(
    reqUrl?: string,
    reqMethod?: string,
    reqHeaders?: any,
    reqQuery?: any,
    reqBody?: any,
    reqParams?: any,
    reqIp?: string,
    reqUserId?: string,
    reqUserEmail?: string
  ): Promise<void> {
    let _id = uuid();
    let date = new Date().toISOString();

    const stringifyIfNeeded = (input: any) => {
      if (input && typeof input !== "string") {
        return JSON.stringify(input, null, 2);
      }
      return input || null;
    };

    reqHeaders = stringifyIfNeeded(reqHeaders);
    reqQuery = stringifyIfNeeded(reqQuery);
    reqBody = stringifyIfNeeded(reqBody);
    reqParams = stringifyIfNeeded(reqParams);

    return new Promise((resolve, reject) => {
      this.pool.query(
        createSql,
        [
          _id,
          date,
          reqUrl || null,
          reqMethod || null,
          reqHeaders,
          reqQuery,
          reqBody,
          reqParams,
          reqIp || null,
          reqUserId || null,
          reqUserEmail || null,
        ],
        (err, result) => {
          if (err) {
            console.log(err);
            reject(err);
            return;
          }

          resolve();
        }
      );
    });
  }


  async getAllRouteNotFoundLogs(): Promise<IRouteNotFoundLogs[]> {

    return new Promise((resolve, reject) => {
        this.pool.query('SELECT * FROM hack_trip.routenotfoundlogs ORDER BY date desc', (err, rows, fields) => {
            if (err) {
                console.log(err);
                reject(err);
                return;
            }

            resolve(rows);
        });
    });
}
}
