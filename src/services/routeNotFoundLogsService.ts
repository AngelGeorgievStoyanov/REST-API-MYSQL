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

    const trimString = (str: string, maxLength: number) => {
      return str.length > maxLength ? str.substring(0, maxLength) : str;
    };

    const stringifyIfNeeded = (input: any, maxLength: number) => {
      if (input && typeof input !== "string") {
        return trimString(JSON.stringify(input, null, 2), maxLength);
      }
      return trimString(input || "", maxLength);
    };

    reqUrl = trimString(reqUrl || "", 145);
    reqMethod = trimString(reqMethod || "", 15);
    reqHeaders = stringifyIfNeeded(reqHeaders, 500);
    reqQuery = stringifyIfNeeded(reqQuery, 145);
    reqBody = stringifyIfNeeded(reqBody, 1000);
    reqParams = stringifyIfNeeded(reqParams, 145);
    reqIp = trimString(reqIp || "", 45);
    reqUserId = trimString(reqUserId || "", 36);
    reqUserEmail = trimString(reqUserEmail || "", 245);

    return new Promise((resolve, reject) => {
      this.pool.query(
        createSql,
        [
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
          reqUserEmail,
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
      this.pool.query(
        "SELECT * FROM hack_trip.routenotfoundlogs ORDER BY date desc",
        (err, rows, fields) => {
          if (err) {
            console.log(err);
            reject(err);
            return;
          }

          resolve(rows);
        }
      );
    });
  }
}
