import rateLimit from "express-rate-limit";

const isTest = process.env["NODE_ENV"] === "test";

/** Applies to every /api request. Generous — protects against blunt flooding, not normal use. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

/** Applies to /api/auth/login only. Tight — login already self-locks accounts after 3 failures, this limits brute force across usernames/IPs. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts from this network. Please try again later." },
});
