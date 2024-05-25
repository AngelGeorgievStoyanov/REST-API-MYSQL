export interface IRouteNotFoundLogs {
  _id?: string;
  date?: string;
  reqUrl?: string;
  reqMethod?: string;
  reqHeaders?: any;
  reqQuery?: any;
  reqBody?: string;
  reqParams?: string;
  reqIp?: string;
  reqUserId?: string;
  reqUserEmail?: string;
}
