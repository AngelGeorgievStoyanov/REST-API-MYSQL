import * as jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import * as dotenv from "dotenv";
dotenv.config();

const secret = process.env.secret;

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log('method: ',req.method,' ',req.originalUrl + " Access denied. No token provided.");
    return res.status(401).json("Access denied. No token provided.");
  }

  const token = authHeader.split(" ")[1];
  jwt.verify(token, secret, (err, user) => {
    if (err) {
      console.log(req.originalUrl + ' ERR: ' + err.message);
      return res.status(403).json("Invalid token.");
    }

    req["user"] = user;
    next();
  });
}
