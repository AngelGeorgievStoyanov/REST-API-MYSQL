import { IRouteNotFoundLogs } from "../model/routeNotFoudLogs";

export interface IRouteNotFoundLogsRepository {
  create(
    reqUrl?: string,
    reqMethod?: string,
    reqHeaders?: any,
    reqQuery?: any,
    reqBody?: string,
    reqParams?: any,
    reqIp?: string,
    reqUserId?: string,
    reqUserEmail?: string
  ): Promise<void>;

  getAllRouteNotFoundLogs(): Promise<IRouteNotFoundLogs[]>;
}
