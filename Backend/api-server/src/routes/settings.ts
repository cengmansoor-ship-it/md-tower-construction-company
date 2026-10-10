import { Router, type IRouter } from "express";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { CompanySetting, Currency } from "@workspace/db-sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";
import { latestMysqlBackupPath, runManualMysqlBackup } from "../lib/automaticBackup";

const router: IRouter = Router();
const LOGO_CONTENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const WELCOME_TEXT_FIELDS = [
  "welcomeTitlePashto",
  "welcomeSubtitlePashto",
  "welcomeDescriptionPashto",
  "welcomeTitleEnglish",
  "welcomeSubtitleEnglish",
  "welcomeDescriptionEnglish",
] as const;

function canFallbackLogoToDatabase(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "EPERM" || code === "EACCES" || code === "EROFS";
}

async function saveLogoUrlOrDataUrl(dataUrl: string, extension: string): Promise<string> {
  const uploadDir = path.join(process.cwd(), "uploads");
  const fileName = `company-logo-${Date.now()}.${extension}`;
  try {
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, fileName), Buffer.from(dataUrl.split(",")[1] ?? "", "base64"));
    return `/uploads/${fileName}`;
  } catch (error) {
    if (canFallbackLogoToDatabase(error)) {
      return dataUrl;
    }
    throw error;
  }
}

router.get("/public", async (_req, res) => {
  const settings = await CompanySetting.findByPk(1);
  res.json(settings);
});

router.get("/", requireAuth, async (_req, res) => {
  const settings = await CompanySetting.findByPk(1);
  res.json(settings);
});

router.put("/", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  const { companyName, baseCurrencyCode, fiscalYearStartMonth, locale, logoUrl, address, phone, whatsapp, email, website, slogan } = req.body ?? {};
  const settings = await CompanySetting.findByPk(1);
  if (!settings) {
    res.status(404).json({ error: "د شرکت تنظیمات ونه موندل شول." });
    return;
  }
  if (typeof companyName === "string" && companyName.trim()) settings.companyName = companyName.trim();
  if (typeof baseCurrencyCode === "string" && baseCurrencyCode.trim()) settings.baseCurrencyCode = baseCurrencyCode.trim().toUpperCase();
  if (typeof fiscalYearStartMonth === "number" && fiscalYearStartMonth >= 1 && fiscalYearStartMonth <= 12) {
    settings.fiscalYearStartMonth = fiscalYearStartMonth;
  }
  if (typeof locale === "string" && locale.trim()) settings.locale = locale.trim();
  if (typeof logoUrl === "string" || logoUrl === null) settings.logoUrl = logoUrl;
  if (typeof address === "string" || address === null) settings.address = address;
  if (typeof phone === "string" || phone === null) settings.phone = phone;
  if (typeof whatsapp === "string" || whatsapp === null) settings.whatsapp = whatsapp;
  if (typeof email === "string" || email === null) settings.email = email;
  if (typeof website === "string" || website === null) settings.website = website;
  if (typeof slogan === "string" || slogan === null) settings.slogan = slogan;
  for (const field of WELCOME_TEXT_FIELDS) {
    const value = req.body?.[field];
    if (typeof value === "string") {
      settings[field] = value.trim();
    }
  }
  await settings.save();
  await recordAudit({
    userId: req.auth!.userId,
    action: "update",
    entityType: "CompanySetting",
    entityId: "1",
    details: req.body,
  });
  res.json(settings);
});

router.post("/logo", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  const { dataUrl } = req.body ?? {};
  if (typeof dataUrl !== "string") {
    res.status(400).json({ error: "د لوګو فایل اړین دی" });
    return;
  }
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) {
    res.status(400).json({ error: "یوازې PNG، JPG، WEBP یا GIF لوګو منل کیږي" });
    return;
  }
  const contentType = match[1]!;
  const extension = LOGO_CONTENT_TYPES[contentType];
  if (!extension) {
    res.status(400).json({ error: "د لوګو ډول سم نه دی" });
    return;
  }
  const buffer = Buffer.from(match[2]!, "base64");
  if (buffer.length > 2 * 1024 * 1024) {
    res.status(400).json({ error: "لوګو باید له ۲MB څخه کوچنی وي" });
    return;
  }
  const settings = await CompanySetting.findByPk(1);
  if (!settings) {
    res.status(404).json({ error: "د شرکت تنظیمات ونه موندل شول." });
    return;
  }
  settings.logoUrl = await saveLogoUrlOrDataUrl(dataUrl, extension);
  await settings.save();
  await recordAudit({
    userId: req.auth!.userId,
    action: "update",
    entityType: "CompanySetting",
    entityId: "1",
    details: { logoUrl: settings.logoUrl },
  });
  res.json(settings);
});

router.post("/backup/mysql", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  try {
    const result = await runManualMysqlBackup();
    await recordAudit({
      userId: req.auth!.userId,
      action: "backup",
      entityType: "MysqlBackup",
      entityId: path.basename(result.latest),
      details: {
        fileName: path.basename(result.file),
        latestFileName: path.basename(result.latest),
        bytes: result.bytes,
        createdAt: result.createdAt,
      },
    });
    res.json({
      fileName: path.basename(result.file),
      latestFileName: path.basename(result.latest),
      bytes: result.bytes,
      createdAt: result.createdAt,
      message: "د MySQL بیکپ جوړ شو.",
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "د MySQL بیکپ جوړ نه شو." });
  }
});

router.get("/backup/mysql/download", requireAuth, requirePermission("settings.manage"), async (_req, res) => {
  const latest = latestMysqlBackupPath();
  if (!existsSync(latest)) {
    res.status(404).json({ error: "بیکپ فایل ونه موندل شو." });
    return;
  }
  res.download(latest, "latest.sql");
});

router.get("/currencies", requireAuth, async (_req, res) => {
  const currencies = await Currency.findAll({ order: [["id", "ASC"]] });
  res.json(currencies);
});

router.post("/currencies", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  const { code, name } = req.body ?? {};
  if (typeof code !== "string" || !code.trim() || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "code and name are required" });
    return;
  }
  const existing = await Currency.findOne({ where: { code: code.trim().toUpperCase() } });
  if (existing) {
    res.status(409).json({ error: "Currency code already exists" });
    return;
  }
  const currency = await Currency.create({ code: code.trim().toUpperCase(), name: name.trim(), isBase: false });
  await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "Currency", entityId: String(currency.id) });
  res.status(201).json(currency);
});

export default router;
