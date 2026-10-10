import { Router, type IRouter } from "express";
import { getProfitAndLoss, getDashboardSummary, getGeneralReport } from "@workspace/db-sequelize";
import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";

const router: IRouter = Router();

function localIsoDate(date = new Date(), timeZone = process.env["APP_TIMEZONE"] || "Asia/Kabul"): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fall through to the server date if the configured timezone is unavailable.
  }
  return date.toISOString().slice(0, 10);
}

router.get("/profit-loss", requireAuth, requirePermission("reports.view"), async (req, res) => {
  const { currencyCode, startDate, endDate } = req.query;
  if (typeof currencyCode !== "string" || typeof startDate !== "string" || typeof endDate !== "string") {
    res.status(400).json({ error: "currencyCode, startDate and endDate query parameters are required" });
    return;
  }
  const report = await getProfitAndLoss({ currencyCode, startDate, endDate });
  res.json(report);
});

router.get("/dashboard", requireAuth, async (_req, res) => {
  const today = localIsoDate();
  const summary = await getDashboardSummary(today);
  res.json(summary);
});

router.get("/general", requireAuth, requirePermission("reports.view"), async (req, res) => {
  const { currencyCode } = req.query;
  const allDates = req.query.allDates === "1" || req.query.allDates === "true";
  const startDate = allDates ? "0001-01-01" : typeof req.query.startDate === "string" && req.query.startDate.trim() ? req.query.startDate : "0001-01-01";
  const endDate = allDates ? "9999-12-31" : typeof req.query.endDate === "string" && req.query.endDate.trim() ? req.query.endDate : "9999-12-31";
  const requestedCurrency = typeof currencyCode === "string" && currencyCode.trim() ? currencyCode.trim() : undefined;
  const report = await getGeneralReport({ currencyCode: requestedCurrency, startDate, endDate });
  res.json(report);
});

export default router;
