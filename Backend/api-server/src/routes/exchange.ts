import { Router, type IRouter } from "express";
import { ExchangeTransaction, Party, createExchangeTransaction, PostingError } from "@workspace/db-sequelize";
import { Op } from "sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";

const router: IRouter = Router();

function exchangeMatchesSearch(row: unknown, search: string | undefined): boolean {
  if (!search) return true;
  const exchange = row as {
    exchangeNumber?: string | null;
    currencyGiven?: string | null;
    currencyReceived?: string | null;
    reference?: string | null;
    notes?: string | null;
    party?: { name?: string | null; phone1?: string | null; address?: string | null };
  };
  const needle = search.trim().toLowerCase();
  const haystack = [
    exchange.exchangeNumber,
    exchange.currencyGiven,
    exchange.currencyReceived,
    exchange.reference,
    exchange.notes,
    exchange.party?.name,
    exchange.party?.phone1,
    exchange.party?.address,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

router.get("/", requireAuth, async (req, res) => {
  const partyId = typeof req.query.partyId === "string" ? Number(req.query.partyId) : undefined;
  const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const where: Record<string, unknown> = {};
  if (partyId) where["partyId"] = partyId;
  if (startDate || endDate) {
    where["exchangeDate"] = {
      ...(startDate ? { [Op.gte]: startDate } : {}),
      ...(endDate ? { [Op.lte]: endDate } : {}),
    };
  }
  const exchanges = await ExchangeTransaction.findAll({
    where,
    order: [["id", "DESC"]],
    include: [{ model: Party, as: "party" as const }],
  });
  res.json(exchanges.map((exchange) => exchange.toJSON()).filter((exchange) => exchangeMatchesSearch(exchange, q)));
});

router.get("/:id", requireAuth, async (req, res) => {
  const exchange = await ExchangeTransaction.findByPk(Number(req.params.id), {
    include: [{ model: Party, as: "party" as const }],
  });
  if (!exchange) {
    res.status(404).json({ error: "د صرافي ثبت ونه موندل شو" });
    return;
  }
  res.json(exchange);
});

router.post("/", requireAuth, requirePermission("exchange.manage"), async (req: AuthedRequest, res) => {
  const { partyId, exchangeDate, currencyGiven, amountGiven, currencyReceived, amountReceived, rate, fee, reference, notes } =
    req.body ?? {};
  if (
    typeof partyId !== "number" ||
    typeof exchangeDate !== "string" ||
    typeof currencyGiven !== "string" ||
    amountGiven === undefined ||
    typeof currencyReceived !== "string" ||
    amountReceived === undefined ||
    rate === undefined
  ) {
    res.status(400).json({
      error: "صراف، تاریخ، ورکړل شوي اسعار، ورکړل شوې اندازه، ترلاسه شوي اسعار، ترلاسه شوې اندازه او نرخ اړین دي",
    });
    return;
  }
  try {
    const exchange = await createExchangeTransaction({
      partyId,
      exchangeDate,
      currencyGiven,
      amountGiven,
      currencyReceived,
      amountReceived,
      rate,
      fee: fee ?? 0,
      reference: reference ?? null,
      notes: notes ?? null,
      createdByUserId: req.auth!.userId,
    });
    await recordAudit({
      userId: req.auth!.userId,
      action: "create",
      entityType: "ExchangeTransaction",
      entityId: String(exchange.id),
      details: req.body,
    });
    res.status(201).json(exchange);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
