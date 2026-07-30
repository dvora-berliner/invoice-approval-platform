import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "./jwt";
import type { Role } from "./types";

declare module "express-serve-static-core" {
  interface Request {
    user?: { username: string; role: Role };
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }
  try {
    const payload = await verifyToken(token);
    req.user = { username: payload.username, role: payload.role };
    next();
  } catch (err) {
    req.log.warn("rejected invalid or expired token", { error: String(err) });
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// authenticate() must run first so req.user is populated.
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient role for this action" });
      return;
    }
    next();
  };
}
