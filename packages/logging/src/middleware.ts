import { randomUUID } from "crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createLogger } from "./logger";
import "./express";

const CORRELATION_HEADER = "x-correlation-id";

export function correlationMiddleware(service: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header(CORRELATION_HEADER);
    const correlationId = incoming && incoming.length > 0 ? incoming : randomUUID();

    req.correlationId = correlationId;
    req.log = createLogger(service, correlationId);
    res.setHeader(CORRELATION_HEADER, correlationId);

    next();
  };
}
