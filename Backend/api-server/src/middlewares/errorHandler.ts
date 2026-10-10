import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";

export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Global error handler. Must be registered last, after all routes.
 * Logs the full error (with stack) server-side, and returns only a safe,
 * generic message to the client — never a raw stack trace or internal detail.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const statusCode = err instanceof HttpError ? err.statusCode : 500;
  const message = err instanceof HttpError ? err.message : "Internal server error";

  logger.error({ err, path: req.path, method: req.method }, "Unhandled request error");

  if (res.headersSent) {
    return;
  }
  res.status(statusCode).json({ error: message });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}
