import { IRouteNotFoundLogs } from "../model/routeNotFoudLogs";
import { Identifiable } from "./user-repository";

export interface IRouteNotFoundLogsRepository<T extends Identifiable> {
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
