import { Router, type IRouter } from "express";
import {
  Sale,
  SaleDocument,
  SaleReceipt,
  Unit,
  UnitType,
  Floor,
  Block,
  Party,
  JournalLine,
  JournalTransaction,
  Decimal,
  createSale,
  addSaleReceipt,
  reverseSaleReceipt,
  getSaleBalance,
  PostingError,
} from "@workspace/db-sequelize";
import { Op } from "sequelize";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";
import { moveToTrash } from "../lib/trash";

const router: IRouter = Router();
const MAX_SALE_DOCUMENT_BYTES = 5 * 1024 * 1024;
const SALE_DOCUMENT_MIME_EXTENSIONS: Record<string, "jpg" | "png"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

function decodeFileName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "document";
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

function safeOriginalName(value: string): string {
  const baseName = path.basename(value).replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();
  return baseName || "document";
}

function looksLikeAllowedImage(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  return false;
}

async function readLimitedRequestBody(req: AuthedRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_SALE_DOCUMENT_BYTES) {
      throw new Error("د عکس سایز باید تر ۵MB زیات نه وي");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function readSaleDocumentUpload(req: AuthedRequest): Promise<{ buffer: Buffer; mimeType: string; extension: "jpg" | "png"; originalName: string }> {
  const mimeType = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  const extension = SALE_DOCUMENT_MIME_EXTENSIONS[mimeType];
  if (!extension) {
    throw new Error("یوازې JPG او PNG عکسونه منل کېږي");
  }
  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (contentLength > MAX_SALE_DOCUMENT_BYTES) {
    throw new Error("د عکس سایز باید تر ۵MB زیات نه وي");
  }

  const buffer = await readLimitedRequestBody(req);
  if (buffer.length === 0) {
    throw new Error("عکس ونه لېږل شو");
  }
  if (!looksLikeAllowedImage(buffer, mimeType)) {
    throw new Error("د عکس فایل سم JPG/PNG نه دی");
  }

  return {
    buffer,
    mimeType,
    extension,
    originalName: safeOriginalName(decodeFileName(req.headers["x-file-name"])),
  };
}

async function saveSaleDocumentFile(saleId: number, extension: "jpg" | "png", buffer: Buffer): Promise<string> {
  const uploadDir = path.join(process.cwd(), "uploads", "sales-documents", String(saleId));
  await fs.mkdir(uploadDir, { recursive: true });
  const fileName = `${crypto.randomUUID()}.${extension}`;
  await fs.writeFile(path.join(uploadDir, fileName), buffer, { flag: "wx" });
  return `/uploads/sales-documents/${saleId}/${fileName}`;
}

function saleDocumentPathFromUrl(fileUrl: string): string | null {
  if (!fileUrl.startsWith("/uploads/sales-documents/")) return null;
  const root = path.resolve(process.cwd(), "uploads", "sales-documents");
  const relativePath = fileUrl.replace(/^\/uploads\/sales-documents\//, "");
  const resolved = path.resolve(root, relativePath);
  return resolved.startsWith(root + path.sep) ? resolved : null;
}

async function removeStoredSaleDocumentFile(fileUrl: string): Promise<void> {
  const filePath = saleDocumentPathFromUrl(fileUrl);
  if (!filePath) return;
  try {
    await fs.rm(filePath, { force: true });
  } catch {
    // The database record is authoritative; a missing old file should not block editing.
  }
}

function unitTypeMatches(name: string | undefined, filter: string | undefined): boolean {
  if (!filter) return true;
  const normalizedFilter = filter.trim().toLowerCase();
  const normalizedName = (name ?? "").trim().toLowerCase();
  if (normalizedFilter === "shop") {
    return normalizedName.includes("shop") || normalizedName.includes("دوکان") || normalizedName.includes("دکان");
  }
  return normalizedName === normalizedFilter;
}

function saleMatchesSearch(row: unknown, search: string | undefined): boolean {
  if (!search) return true;
  const sale = row as {
    saleNumber?: string | null;
    contractNumber?: string | null;
    notes?: string | null;
    party?: { name?: string | null; fatherName?: string | null; phone1?: string | null; tazkiraNumber?: string | null };
    unit?: { unitNumber?: string | null; floor?: { name?: string | null; block?: { name?: string | null; code?: string | null } } };
  };
  const needle = search.trim().toLowerCase();
  const haystack = [
    sale.saleNumber,
    sale.contractNumber,
    sale.notes,
    sale.party?.name,
    sale.party?.fatherName,
    sale.party?.phone1,
    sale.party?.tazkiraNumber,
    sale.unit?.unitNumber,
    sale.unit?.floor?.name,
    sale.unit?.floor?.block?.name,
    sale.unit?.floor?.block?.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

const saleIncludes = [
  { model: Party, as: "party" as const },
  {
    model: Unit,
    as: "unit" as const,
    include: [
      { model: UnitType, as: "unitType" as const },
      { model: Floor, as: "floor" as const, include: [{ model: Block, as: "block" as const }] },
    ],
  },
];

const saleListIncludes = [...saleIncludes, { model: SaleReceipt, as: "receipts" as const }];

type SaleResponseRow = {
  id: number;
  partyId: number;
  currencyCode: string;
  finalPrice: string;
  saleDate: string;
  balance?: string;
  ledgerReceived?: string;
  ledgerBalance?: string;
  party?: { type?: string | null };
};

function saleLedgerKey(partyId: number, currencyCode: string): string {
  return `${partyId}::${currencyCode}`;
}

async function applySalesCustomerLedgerTotals<T extends SaleResponseRow>(rows: T[]): Promise<T[]> {
  const targetRows = rows.filter((row) => row.party?.type === "sales_customer");
  if (!targetRows.length) return rows;

  const partyIds = Array.from(new Set(targetRows.map((row) => row.partyId).filter((id) => Number.isFinite(id))));
  if (!partyIds.length) return rows;

  const creditLines = await JournalLine.findAll({
    where: {
      partyType: "customer",
      partyId: { [Op.in]: partyIds },
      direction: "credit",
    },
    include: [{ model: JournalTransaction, as: "transaction", where: { voidedAt: null }, attributes: [] }],
  });

  const creditByPartyCurrency = new Map<string, Decimal>();
  for (const line of creditLines) {
    if (!line.partyId) continue;
    const key = saleLedgerKey(line.partyId, line.currencyCode);
    const current = creditByPartyCurrency.get(key) ?? new Decimal(0);
    creditByPartyCurrency.set(key, current.plus(new Decimal(line.amount)));
  }

  const rowsByPartyCurrency = new Map<string, T[]>();
  for (const row of targetRows) {
    const key = saleLedgerKey(row.partyId, row.currencyCode);
    const bucket = rowsByPartyCurrency.get(key) ?? [];
    bucket.push(row);
    rowsByPartyCurrency.set(key, bucket);
  }

  for (const [key, bucket] of rowsByPartyCurrency) {
    bucket.sort((left, right) => {
      const byDate = left.saleDate.localeCompare(right.saleDate);
      return byDate !== 0 ? byDate : left.id - right.id;
    });

    let remainingCredit = creditByPartyCurrency.get(key) ?? new Decimal(0);
    bucket.forEach((row, index) => {
      const price = new Decimal(row.finalPrice);
      const isLast = index === bucket.length - 1;
      const applied = isLast ? remainingCredit : Decimal.min(Decimal.max(remainingCredit, 0), price);
      row.ledgerReceived = applied.toFixed();
      row.ledgerBalance = price.minus(applied).toFixed();
      row.balance = row.ledgerBalance;
      remainingCredit = remainingCredit.minus(applied);
    });
  }

  return rows;
}

router.get("/", requireAuth, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const unitType = typeof req.query.unitType === "string" ? req.query.unitType : undefined;
  const customerType = typeof req.query.customerType === "string" ? req.query.customerType : undefined;
  const projectId = typeof req.query.projectId === "string" ? Number(req.query.projectId) : null;
  const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const where: Record<string, unknown> = {};
  if (status) where["status"] = status;
  else where["status"] = { [Op.notIn]: ["cancelled", "reversed"] };
  if (startDate || endDate) {
    where["saleDate"] = {
      ...(startDate ? { [Op.gte]: startDate } : {}),
      ...(endDate ? { [Op.lte]: endDate } : {}),
    };
  }
  const sales = await Sale.findAll({ where, order: [["id", "DESC"]], include: saleListIncludes });
  const withBalances = await Promise.all(
    sales.map(async (s) => ({ ...s.toJSON(), balance: await getSaleBalance(s) })),
  );
  const withLedgerTotals = await applySalesCustomerLedgerTotals(withBalances as SaleResponseRow[]);
  res.json(
    withLedgerTotals.filter((s) =>
      unitTypeMatches((s as { unit?: { unitType?: { name?: string } } }).unit?.unitType?.name, unitType) &&
      (!customerType || (s as { party?: { type?: string } }).party?.type === customerType) &&
      (!projectId || !Number.isFinite(projectId) || (s as { unit?: { floor?: { block?: { projectId?: number } } } }).unit?.floor?.block?.projectId === projectId) &&
      saleMatchesSearch(s, q),
    ),
  );
});

router.get("/:id", requireAuth, async (req, res) => {
  const sale = await Sale.findByPk(Number(req.params.id), {
    include: [...saleIncludes, { model: SaleReceipt, as: "receipts" as const }],
  });
  if (!sale) {
    res.status(404).json({ error: "پلورنه ونه موندل شوه" });
    return;
  }
  const balance = await getSaleBalance(sale);
  const [row] = await applySalesCustomerLedgerTotals([{ ...sale.toJSON(), balance } as SaleResponseRow]);
  res.json(row);
});

router.get("/:id/documents", requireAuth, async (req, res) => {
  const sale = await Sale.findByPk(Number(req.params.id));
  if (!sale) {
    res.status(404).json({ error: "پلورنه ونه موندل شوه" });
    return;
  }
  const documents = await SaleDocument.findAll({ where: { saleId: sale.id }, order: [["id", "DESC"]] });
  res.json(documents);
});

router.post("/:id/documents", requireAuth, requirePermission("sales.manage"), async (req: AuthedRequest, res) => {
  const sale = await Sale.findByPk(Number(req.params.id));
  if (!sale) {
    res.status(404).json({ error: "پلورنه ونه موندل شوه" });
    return;
  }

  try {
    const { buffer, mimeType, extension, originalName } = await readSaleDocumentUpload(req);
    const fileUrl = await saveSaleDocumentFile(sale.id, extension, buffer);
    const document = await SaleDocument.create({
      saleId: sale.id,
      fileName: originalName,
      fileUrl,
      mimeType,
      sizeBytes: buffer.length,
      uploadedByUserId: req.auth!.userId,
    });
    await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "SaleDocument", entityId: String(document.id), details: { saleId: sale.id, fileName: document.fileName } });
    res.status(201).json(document);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "د اسنادو ثبت ناکام شو" });
  }
});

router.put("/:id/documents/:documentId", requireAuth, requirePermission("sales.manage"), async (req: AuthedRequest, res) => {
  const sale = await Sale.findByPk(Number(req.params.id));
  if (!sale) {
    res.status(404).json({ error: "پلورنه ونه موندل شوه" });
    return;
  }
  const document = await SaleDocument.findOne({ where: { id: Number(req.params.documentId), saleId: sale.id } });
  if (!document) {
    res.status(404).json({ error: "سند ونه موندل شو" });
    return;
  }

  try {
    const oldFileUrl = document.fileUrl;
    const { buffer, mimeType, extension, originalName } = await readSaleDocumentUpload(req);
    const fileUrl = await saveSaleDocumentFile(sale.id, extension, buffer);
    document.fileName = originalName;
    document.fileUrl = fileUrl;
    document.mimeType = mimeType;
    document.sizeBytes = buffer.length;
    document.uploadedByUserId = req.auth!.userId;
    await document.save();
    await removeStoredSaleDocumentFile(oldFileUrl);
    await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "SaleDocument", entityId: String(document.id), details: { saleId: sale.id, fileName: document.fileName } });
    res.json(document);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "د سند ایډیټ ناکام شو" });
  }
});

router.delete("/:id/documents/:documentId", requireAuth, requirePermission("sales.manage"), async (req: AuthedRequest, res) => {
  const bodyReason = (req.body as { reason?: unknown } | undefined)?.reason;
  const reason = typeof bodyReason === "string" && bodyReason.trim()
    ? bodyReason.trim()
    : typeof req.query.reason === "string"
      ? req.query.reason.trim()
      : "";
  if (!reason) {
    res.status(400).json({ error: "د حذف دلیل اړین دی" });
    return;
  }

  const sale = await Sale.findByPk(Number(req.params.id));
  if (!sale) {
    res.status(404).json({ error: "پلورنه ونه موندل شوه" });
    return;
  }
  const document = await SaleDocument.findOne({ where: { id: Number(req.params.documentId), saleId: sale.id } });
  if (!document) {
    res.status(404).json({ error: "سند ونه موندل شو" });
    return;
  }

  const snapshot = document.toJSON();
  await moveToTrash({
    userId: req.auth!.userId,
    entityType: "SaleDocument",
    entityId: document.id,
    displayName: document.fileName || `سند ${document.id}`,
    sourcePath: `/sales?customerType=sales_customer&salesDetail=1&allDates=1`,
    snapshot,
    reason,
  });
  await document.destroy();
  res.status(204).send();
});

router.post("/", requireAuth, requirePermission("sales.manage"), async (req: AuthedRequest, res) => {
  const {
    unitId,
    partyId,
    price,
    discount,
    currencyCode,
    saleDate,
    paymentType,
    contractNumber,
    notes,
    status,
    firstReceivedAmount,
    firstReceiptMethod,
    firstReceiptCashAccountId,
    firstReceiptReference,
    firstReceiptNote,
  } = req.body ?? {};
  if (typeof unitId !== "number" || typeof partyId !== "number" || price === undefined || typeof currencyCode !== "string" || typeof saleDate !== "string") {
    res.status(400).json({ error: "ملکیت، مشتری، قیمت، اسعار او تاریخ اړین دي" });
    return;
  }
  try {
    const sale = await createSale({
      unitId,
      partyId,
      price,
      discount,
      currencyCode,
      saleDate,
      paymentType: paymentType ?? null,
      contractNumber: contractNumber ?? null,
      notes: notes ?? null,
      status,
      createdByUserId: req.auth!.userId,
      firstReceivedAmount: firstReceivedAmount ?? null,
      firstReceiptMethod: firstReceiptMethod ?? undefined,
      firstReceiptCashAccountId: firstReceiptCashAccountId ?? null,
      firstReceiptReference: firstReceiptReference ?? null,
      firstReceiptNote: firstReceiptNote ?? null,
    });
    await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "Sale", entityId: String(sale.id), details: req.body });
    res.status(201).json(sale);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/:id/receipts", requireAuth, requirePermission("sales.manage"), async (req: AuthedRequest, res) => {
  const { amount, currencyCode, receiptDate, method, cashAccountId, reference, note, allowOverpayment } = req.body ?? {};
  if (amount === undefined || typeof currencyCode !== "string" || typeof receiptDate !== "string") {
    res.status(400).json({ error: "پیسې، اسعار او تاریخ اړین دي" });
    return;
  }
  try {
    const receipt = await addSaleReceipt({
      saleId: Number(req.params.id),
      amount,
      currencyCode,
      receiptDate,
      method,
      cashAccountId: cashAccountId ?? null,
      reference: reference ?? null,
      note: note ?? null,
      receivedByUserId: req.auth!.userId,
      allowOverpayment: Boolean(allowOverpayment),
    });
    await recordAudit({
      userId: req.auth!.userId,
      action: "create",
      entityType: "SaleReceipt",
      entityId: String(receipt.id),
      details: req.body,
    });
    res.status(201).json(receipt);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/:id/receipts/:receiptId/reverse", requireAuth, requirePermission("sales.manage"), async (req: AuthedRequest, res) => {
  const { reason } = req.body ?? {};
  if (typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "د بېرته کولو دلیل اړین دی" });
    return;
  }
  try {
    const snapshot = await SaleReceipt.findByPk(Number(req.params.receiptId));
    const receipt = await reverseSaleReceipt(Number(req.params.receiptId), { userId: req.auth!.userId, reason: reason.trim() });
    await moveToTrash({
      userId: req.auth!.userId,
      entityType: "SaleReceipt",
      entityId: receipt.id,
      displayName: receipt.receiptNumber || `رسید ${receipt.id}`,
      sourcePath: `/sales/${req.params.id}`,
      snapshot: snapshot?.toJSON() ?? receipt.toJSON(),
      reason: reason.trim(),
    });
    res.status(201).json(receipt);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
