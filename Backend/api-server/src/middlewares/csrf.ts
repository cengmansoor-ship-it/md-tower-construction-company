import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Double-submit-cookie CSRF protection.
 *
 * Every response ensures a readable (non-httpOnly) `csrf_token` cookie exists.
 * Every state-changing request (POST/PUT/PATCH/DELETE) must echo that same
 * value back in the `X-CSRF-Token` header. A cross-site page cannot read the
 * cookie (browsers block cross-origin cookie reads) or set a custom header on
 * a simple form submission, so this blocks classic CSRF while requiring no
 * server-side session store.
 */
const COOKIE_NAME = "csrf_token";
const HEADER_NAME = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const isProduction = process.env["NODE_ENV"] === "production";

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  let token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    res.cookie(COOKIE_NAME, token, {
      httpOnly: false,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const header = req.header(HEADER_NAME);
  if (!header || header !== token) {
    res.status(403).json({ error: "Invalid or missing CSRF token" });
    return;
  }
  next();
}
