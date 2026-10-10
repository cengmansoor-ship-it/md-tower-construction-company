import type { Request, Response, NextFunction } from "express";

const SEPARATOR_PATTERN = /[,\u060C\u066C'\u00A0\u2009\u202F_ \t]/g;
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const SKIP_KEY_PATTERN = /(?:pass|secret|token|cookie|csrf)/i;
const NUMBER_PATTERN = /^[+-]?\d*\.?\d+$/;

function normalizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return value;
    const cleaned = trimmed
      .replace(/[۰-۹]/g, (ch) => String(PERSIAN_DIGITS.indexOf(ch)))
      .replace(/[٠-٩]/g, (ch) => String(ARABIC_DIGITS.indexOf(ch)))
      .replace(/[٫]/g, ".")
      .replace(SEPARATOR_PATTERN, "");
    return NUMBER_PATTERN.test(cleaned) ? cleaned : value;
  }
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SKIP_KEY_PATTERN.test(key) ? item : normalizeValue(item);
    }
    return result;
  }
  return value;
}

export function normalizeAmountInputs(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === "object") {
    req.body = normalizeValue(req.body);
  }
  next();
}
