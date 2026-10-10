import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";
import { apiLimiter, loginLimiter } from "./middlewares/rateLimits";
import { csrfProtection } from "./middlewares/csrf";
import { normalizeAmountInputs } from "./middlewares/normalizeAmounts";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";

const app: Express = express();

app.use((_req, res, next) => {
  res.charset = "utf-8";
  next();
});

app.use(
  helmet({
    // Same-origin API served behind a proxy; CSP is enforced by the frontend app itself.
    contentSecurityPolicy: false,
  }),
);
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(normalizeAmountInputs);
app.use(apiLimiter);
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/recover-credentials", loginLimiter);
app.use(csrfProtection);

app.use("/api", router);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
