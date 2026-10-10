import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken, User, type AuthTokenPayload } from "@workspace/db-sequelize";

export interface AuthedRequest extends Request {
  auth?: AuthTokenPayload;
}

const COOKIE_NAME = "auth_token";

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    const user = await User.findByPk(payload.userId);
    if (!user || !user.isActive) {
      res.status(401).json({ error: "Account is disabled or no longer exists" });
      return;
    }
    req.auth = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
