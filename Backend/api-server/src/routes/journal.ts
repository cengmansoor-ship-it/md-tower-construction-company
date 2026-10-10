import { Router, type IRouter } from "express";
import { Op } from "sequelize";
import {
  Employee,
  JournalTransaction,
  JournalLine,
  Account,
  Party,
  PostingLink,
  postJournal,
  reverseJournal,
  PostingError,
  listDailyCashEntries,
  listDailyCashDaySummaries,
  createDailyCashEntry,
  updateDailyCashEntry,
  voidDailyCashEntry,
  type DailyCashCategory,
  type DailyCashEntryType,
  type DailyCashTargetType,
  type PartyType,
} from "@workspace/db-sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";
import { moveToTrash } from "../lib/trash";

const router: IRouter = Router();

const DAILY_CASH_PARTY_TARGETS: PartyType[] = ["supplier", "sales_customer", "exchange_dealer", "market_customer", "individual_customer"];

function normalizeTargetId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function readDailyCashPayload(body: unknown) {
  const { entryDate, description, category, entryType, targetType, targetId, amount, currencyCode, cashAccountId } =
    (body ?? {}) as Record<string, unknown>;
  if (
    typeof entryDate !== "string" ||
    typeof description !== "string" ||
    typeof category !== "string" ||
    (typeof amount !== "string" && typeof amount !== "number") ||
    typeof currencyCode !== "string"
  ) {
    return null;
  }
  return {
    entryDate,
    description,
    category: category as DailyCashCategory,
    entryType: typeof entryType === "string" ? (entryType as DailyCashEntryType) : undefined,
    targetType: typeof targetType === "string" ? (targetType as DailyCashTargetType) : null,
    targetId: normalizeTargetId(targetId),
    amount,
    currencyCode,
    cashAccountId: typeof cashAccountId === "number" ? cashAccountId : null,
  };
}

router.get("/daily-cash", requireAuth, async (req, res) => {
  const entryDate = typeof req.query.date === "string" && req.query.date ? req.query.date : new Date().toISOString().slice(0, 10);
  const currencyCode = typeof req.query.currencyCode === "string" && req.query.currencyCode ? req.query.currencyCode : "AFN";
  const summary = await listDailyCashEntries({ entryDate, currencyCode });
  res.json(summary);
});

router.get("/daily-cash-days", requireAuth, async (req, res) => {
  const currencyCode = typeof req.query.currencyCode === "string" && req.query.currencyCode ? req.query.currencyCode : "AFN";
  const summaries = await listDailyCashDaySummaries({ currencyCode });
  res.json(summaries);
});

router.get("/daily-cash-targets", requireAuth, async (_req, res) => {
  const parties = await Party.findAll({
    where: { isActive: true, type: { [Op.in]: DAILY_CASH_PARTY_TARGETS } },
    order: [["type", "ASC"], ["name", "ASC"]],
  });
  const employees = await Employee.findAll({
    where: { deletedAt: null },
    order: [["workerType", "ASC"], ["name", "ASC"]],
  });
  res.json({
    parties: parties.map((party) => ({
      id: party.id,
      type: party.type,
      name: party.name,
      fatherName: party.fatherName,
      phone1: party.phone1,
    })),
    employees: employees.map((employee) => ({
      id: employee.id,
      workerType: employee.workerType,
      name: employee.name,
      fatherName: employee.fatherName,
      employeeNumber: employee.employeeNumber,
      currencyCode: employee.currencyCode,
      status: employee.status,
      endDate: employee.endDate,
    })),
  });
});

router.post("/daily-cash", requireAuth, requirePermission("accounting.manage"), async (req: AuthedRequest, res) => {
  const payload = readDailyCashPayload(req.body);
  if (!payload) {
    res.status(400).json({ error: "entryDate, description, category, amount, and currencyCode are required" });
    return;
  }
  try {
    const entry = await createDailyCashEntry({
      ...payload,
      createdByUserId: req.auth!.userId,
    });
    await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "DailyCashEntry", entityId: String(entry.id) });
    res.status(201).json(entry);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.put("/daily-cash/:id", requireAuth, requirePermission("accounting.manage"), async (req: AuthedRequest, res) => {
  const payload = readDailyCashPayload(req.body);
  if (!payload) {
    res.status(400).json({ error: "entryDate, description, category, amount, and currencyCode are required" });
    return;
  }
  try {
    const entry = await updateDailyCashEntry(Number(req.params.id), {
      ...payload,
      reason: typeof req.body?.reason === "string" ? req.body.reason : "د روزنامچې اصلاح",
      createdByUserId: req.auth!.userId,
    });
    await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "DailyCashEntry", entityId: String(entry.id) });
    res.json(entry);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/daily-cash/:id/void", requireAuth, requirePermission("accounting.manage"), async (req: AuthedRequest, res) => {
  const { reason } = req.body ?? {};
  if (typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "reason is required" });
    return;
  }
  try {
    const entry = await voidDailyCashEntry(Number(req.params.id), { userId: req.auth!.userId, reason: reason.trim() });
    await moveToTrash({
      userId: req.auth!.userId,
      entityType: "DailyCashEntry",
      entityId: entry.id,
      displayName: entry.description || `روزنامچه ${entry.id}`,
      sourcePath: "/journal",
      snapshot: entry.toJSON(),
      reason: reason.trim(),
    });
    res.json(entry);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.get("/", requireAuth, async (req, res) => {
  const direction = typeof req.query.direction === "string" ? req.query.direction : undefined;
  const transactions = await JournalTransaction.findAll({
    order: [["id", "DESC"]],
    limit: 200,
    include: [{ model: JournalLine, as: "lines", include: [{ model: Account, as: "account" }] }],
  });
  const filtered =
    direction === "in" || direction === "out"
      ? transactions.filter((t) =>
          (t.lines ?? []).some((l) =>
            direction === "in"
              ? l.account?.code === "1000" && l.direction === "debit"
              : l.account?.code === "1000" && l.direction === "credit",
          ),
        )
      : transactions;
  res.json(filtered);
});

router.get("/accounts", requireAuth, async (_req, res) => {
  const accounts = await Account.findAll({ where: { isActive: true }, order: [["code", "ASC"]] });
  res.json(accounts);
});

router.post("/manual", requireAuth, requirePermission("accounting.manage"), async (req: AuthedRequest, res) => {
  const { transactionDate, memo, lines } = req.body ?? {};
  if (typeof transactionDate !== "string" || !Array.isArray(lines) || lines.length < 2) {
    res.status(400).json({ error: "transactionDate and at least two lines are required" });
    return;
  }
  try {
    const transaction = await postJournal({
      transactionDate,
      memo: memo ?? null,
      isManual: true,
      createdByUserId: req.auth!.userId,
      lines,
    });
    await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "JournalTransaction", entityId: String(transaction.id) });
    res.status(201).json(transaction);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/:id/reverse", requireAuth, requirePermission("accounting.manage"), async (req: AuthedRequest, res) => {
  const { reason } = req.body ?? {};
  if (typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "reason is required" });
    return;
  }
  try {
    const transaction = await JournalTransaction.findByPk(Number(req.params.id), {
      include: [{ model: JournalLine, as: "lines", include: [{ model: Account, as: "account" }] }],
    });
    const source = await PostingLink.findOne({ where: { transactionId: Number(req.params.id) } });
    if (source?.sourceModule === "daily_cash") {
      const entry = await voidDailyCashEntry(source.sourceId, { userId: req.auth!.userId, reason: reason.trim() });
      await moveToTrash({
        userId: req.auth!.userId,
        entityType: "DailyCashEntry",
        entityId: entry.id,
        displayName: entry.description || `روزنامچه ${entry.id}`,
        sourcePath: "/journal",
        snapshot: entry.toJSON(),
        reason: reason.trim(),
      });
      res.status(201).json(entry);
      return;
    }
    const reversal = await reverseJournal(Number(req.params.id), { userId: req.auth!.userId, reason: reason.trim() });
    await moveToTrash({
      userId: req.auth!.userId,
      entityType: "JournalTransaction",
      entityId: String(req.params.id),
      displayName: transaction?.memo || `Journal ${req.params.id}`,
      sourcePath: "/journal",
      snapshot: transaction?.toJSON() ?? { reversalId: reversal.id },
      reason: reason.trim(),
    });
    res.status(201).json(reversal);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
