import { Router, type IRouter } from "express";
import {
  Decimal,
  JournalLine,
  JournalTransaction,
  Purchase,
  PurchasePayment,
  PurchaseReturn,
  Party,
  PostingLink,
  findVoidedPostedSourceIds,
  createPurchase,
  updatePurchase,
  voidPurchase,
  addPurchasePayment,
  createPurchaseReturn,
  updatePurchaseReturn,
  deletePurchaseReturn,
  getPurchaseBalance,
  PostingError,
} from "@workspace/db-sequelize";
import { Op } from "sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";
import { moveToTrash } from "../lib/trash";

const router: IRouter = Router();

const purchasePartyIncludes = [{ model: Party, as: "supplier" as const }];
const activeSupplierInclude = { model: Party, as: "supplier" as const, where: { deletedAt: null }, required: true };
const purchaseListIncludes = [
  activeSupplierInclude,
  { model: PurchaseReturn, as: "returns" as const },
];

function supplierCurrencyKey(supplierPartyId: number, currencyCode: string): string {
  return `${supplierPartyId}::${currencyCode}`;
}

async function unlinkedSupplierReceiptTotals(supplierPartyIds: number[], currencyCodes: string[]): Promise<Map<string, Decimal>> {
  if (!supplierPartyIds.length || !currencyCodes.length) return new Map();
  const where: Record<string, unknown> = {
    partyType: "supplier",
    partyId: { [Op.in]: supplierPartyIds },
    currencyCode: { [Op.in]: currencyCodes },
    direction: "debit",
  };
  const lines = await JournalLine.findAll({
    where,
    include: [{ model: JournalTransaction, as: "transaction", where: { voidedAt: null, reversalOfId: null }, required: true }],
  });
  const transactionIds = Array.from(new Set(lines.map((line) => line.transactionId)));
  const links = transactionIds.length
    ? await PostingLink.findAll({ where: { transactionId: { [Op.in]: transactionIds } } })
    : [];
  const linkByTransactionId = new Map(links.map((link) => [link.transactionId, link]));
  const totals = new Map<string, Decimal>();

  for (const line of lines) {
    if (!line.partyId) continue;
    const sourceModule = linkByTransactionId.get(line.transactionId)?.sourceModule ?? null;
    if (sourceModule && sourceModule !== "daily_cash") continue;
    const key = supplierCurrencyKey(line.partyId, line.currencyCode);
    totals.set(key, (totals.get(key) ?? new Decimal(0)).plus(new Decimal(line.amount)));
  }

  return totals;
}

async function purchaseLedgerAdjustedBalances(purchases: Purchase[]): Promise<Map<number, string>> {
  const supplierPartyIds = Array.from(new Set(purchases.map((purchase) => purchase.supplierPartyId)));
  const currencyCodes = Array.from(new Set(purchases.map((purchase) => purchase.currencyCode)));
  if (!supplierPartyIds.length || !currencyCodes.length) return new Map();

  const allocationPurchasesRaw = await Purchase.findAll({
    where: {
      supplierPartyId: { [Op.in]: supplierPartyIds },
      currencyCode: { [Op.in]: currencyCodes },
      status: { [Op.ne]: "cancelled" },
    },
    order: [["purchaseDate", "ASC"], ["id", "ASC"]],
  });
  const voidedPurchaseIds = await findVoidedPostedSourceIds({
    sourceModule: "purchase",
    sourceIds: allocationPurchasesRaw.map((purchase) => purchase.id),
    postingType: "purchase_creation",
  });
  const allocationPurchases = allocationPurchasesRaw.filter((purchase) => !voidedPurchaseIds.has(purchase.id));
  const balanceEntries = await Promise.all(
    allocationPurchases.map(async (purchase) => [purchase.id, new Decimal(await getPurchaseBalance(purchase))] as const),
  );
  const baseBalanceByPurchaseId = new Map(balanceEntries);
  const extraReceiptByGroup = await unlinkedSupplierReceiptTotals(supplierPartyIds, currencyCodes);
  const adjusted = new Map<number, string>();
  const groupedPurchases = new Map<string, Purchase[]>();

  for (const purchase of allocationPurchases) {
    const key = supplierCurrencyKey(purchase.supplierPartyId, purchase.currencyCode);
    const group = groupedPurchases.get(key) ?? [];
    group.push(purchase);
    groupedPurchases.set(key, group);
  }

  for (const [key, group] of groupedPurchases) {
    let remainingExtraReceipt = extraReceiptByGroup.get(key) ?? new Decimal(0);
    for (const [index, purchase] of group.entries()) {
      const baseBalance = baseBalanceByPurchaseId.get(purchase.id) ?? new Decimal(purchase.totalAmount);
      const payableBalance = baseBalance.greaterThan(0) ? baseBalance : new Decimal(0);
      const isLastPurchaseForSupplier = index === group.length - 1;
      const applied = isLastPurchaseForSupplier
        ? remainingExtraReceipt
        : remainingExtraReceipt.lessThan(payableBalance)
          ? remainingExtraReceipt
          : payableBalance;
      adjusted.set(purchase.id, baseBalance.minus(applied).toFixed());
      remainingExtraReceipt = remainingExtraReceipt.minus(applied);
    }
  }

  return adjusted;
}

function purchaseMatchesSearch(row: unknown, search: string | undefined): boolean {
  if (!search) return true;
  const purchase = row as {
    purchaseNumber?: string | null;
    customerBillNumber?: string | null;
    itemName?: string | null;
    unitOfMeasure?: string | null;
    notes?: string | null;
    supplier?: { name?: string | null; phone1?: string | null; address?: string | null };
  };
  const needle = search.trim().toLowerCase();
  const haystack = [
    purchase.purchaseNumber,
    purchase.customerBillNumber,
    purchase.itemName,
    purchase.unitOfMeasure,
    purchase.notes,
    purchase.supplier?.name,
    purchase.supplier?.phone1,
    purchase.supplier?.address,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function returnMatchesSearch(row: unknown, search: string | undefined): boolean {
  if (!search) return true;
  const ret = row as {
    returnNumber?: string | null;
    customerBillNumber?: string | null;
    returnedItemName?: string | null;
    reason?: string | null;
    purchase?: { purchaseNumber?: string | null; itemName?: string | null; supplier?: { name?: string | null; phone1?: string | null } };
  };
  const needle = search.trim().toLowerCase();
  const haystack = [
    ret.returnNumber,
    ret.customerBillNumber,
    ret.returnedItemName,
    ret.reason,
    ret.purchase?.purchaseNumber,
    ret.purchase?.itemName,
    ret.purchase?.supplier?.name,
    ret.purchase?.supplier?.phone1,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

router.get("/", requireAuth, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
  const currencyCode = typeof req.query.currency === "string" ? req.query.currency : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const where: Record<string, unknown> = {};
  if (status === "cancelled") where["status"] = status;
  else where["status"] = { [Op.ne]: "cancelled" };
  if (currencyCode) where["currencyCode"] = currencyCode;
  if (startDate || endDate) {
    where["purchaseDate"] = {
      ...(startDate ? { [Op.gte]: startDate } : {}),
      ...(endDate ? { [Op.lte]: endDate } : {}),
    };
  }
  const purchases = await Purchase.findAll({ where, order: [["id", "DESC"]], include: purchaseListIncludes });
  const serializedPurchases = purchases.map((purchase) => ({
    purchase,
    payload: purchase.toJSON() as ReturnType<Purchase["toJSON"]> & { returns?: Array<{ id: number }> },
  }));
  const voidedPurchaseIds = await findVoidedPostedSourceIds({
    sourceModule: "purchase",
    sourceIds: purchases.map((purchase) => purchase.id),
    postingType: "purchase_creation",
  });
  const voidedReturnIds = await findVoidedPostedSourceIds({
    sourceModule: "purchase_return",
    sourceIds: serializedPurchases.flatMap(({ payload }) => (payload.returns ?? []).map((ret) => ret.id)),
    postingType: "purchase_return",
  });
  const withBalances = await Promise.all(
    serializedPurchases
      .filter(({ purchase }) => !voidedPurchaseIds.has(purchase.id))
      .map(async ({ purchase, payload }) => {
        if (payload.returns) payload.returns = payload.returns.filter((ret) => !voidedReturnIds.has(ret.id));
        return { purchase, payload, balance: await getPurchaseBalance(purchase) };
      }),
  );
  const adjustedBalances = await purchaseLedgerAdjustedBalances(withBalances.map(({ purchase }) => purchase));
  const responsePurchases = withBalances.map(({ purchase, payload, balance }) => {
    const adjustedBalance = adjustedBalances.get(purchase.id) ?? balance;
    const payloadStatus = (payload as { status?: string }).status;
    const effectiveStatus = payloadStatus === "cancelled" ? payloadStatus : new Decimal(adjustedBalance).lessThanOrEqualTo(0) ? "paid" : "open";
    return { ...payload, status: effectiveStatus, balance: adjustedBalance };
  });
  res.json(
    responsePurchases
      .filter((purchase) => !status || status === "cancelled" || purchase.status === status)
      .filter((purchase) => purchaseMatchesSearch(purchase, q)),
  );
});

router.get("/returns", requireAuth, async (req, res) => {
  const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const where: Record<string, unknown> = {};
  if (startDate || endDate) {
    where["returnDate"] = {
      ...(startDate ? { [Op.gte]: startDate } : {}),
      ...(endDate ? { [Op.lte]: endDate } : {}),
    };
  }
  const returns = await PurchaseReturn.findAll({
    where,
    order: [["id", "DESC"]],
    include: [{ model: Purchase, as: "purchase" as const, required: true, include: [activeSupplierInclude] }],
  });
  res.json(returns.map((ret) => ret.toJSON()).filter((ret) => returnMatchesSearch(ret, q)));
});

router.put("/returns/:returnId", requireAuth, requirePermission("purchases.manage"), async (req: AuthedRequest, res) => {
  const { customerBillNumber, returnDate, returnedItemName, quantity, amount, currencyCode, reason } = req.body ?? {};
  if (
    typeof customerBillNumber !== "string" ||
    !customerBillNumber.trim() ||
    typeof returnDate !== "string" ||
    typeof returnedItemName !== "string" ||
    quantity === undefined ||
    amount === undefined ||
    typeof currencyCode !== "string" ||
    typeof reason !== "string"
  ) {
    res.status(400).json({ error: "تاریخ، جنس، مقدار، پیسې، پیسې ډول او دلیل اړین دي" });
    return;
  }
  try {
    const ret = await updatePurchaseReturn({
      returnId: Number(req.params.returnId),
      customerBillNumber: customerBillNumber.trim(),
      returnDate,
      returnedItemName,
      quantity,
      amount,
      currencyCode,
      reason,
    });
    await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "PurchaseReturn", entityId: String(ret.id), details: req.body });
    res.json(ret);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/returns/:returnId/delete", requireAuth, requirePermission("purchases.manage"), async (req: AuthedRequest, res) => {
  const { reason } = req.body ?? {};
  if (typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "د حذف دلیل اړین دی" });
    return;
  }
  const ret = await PurchaseReturn.findByPk(Number(req.params.returnId), {
    include: [{ model: Purchase, as: "purchase" as const, include: purchasePartyIncludes }],
  });
  if (!ret) {
    res.status(404).json({ error: "واپسي بیل ونه موندل شو" });
    return;
  }
  const snapshot = ret.toJSON();
  try {
    const deleted = await deletePurchaseReturn(ret.id, { userId: req.auth!.userId, reason: reason.trim() });
    await moveToTrash({
      userId: req.auth!.userId,
      entityType: "PurchaseReturn",
      entityId: deleted.id,
      displayName: deleted.returnNumber || `واپسي بیل ${deleted.id}`,
      sourcePath: `/purchase-returns`,
      snapshot,
      reason: reason.trim(),
    });
    res.json(deleted);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  const purchase = await Purchase.findByPk(Number(req.params.id), {
    include: [
      ...purchasePartyIncludes,
      { model: PurchasePayment, as: "payments" as const },
      { model: PurchaseReturn, as: "returns" as const },
    ],
  });
  if (!purchase) {
    res.status(404).json({ error: "پیرودنه ونه موندل شوه" });
    return;
  }
  const balance = await getPurchaseBalance(purchase);
  res.json({ ...purchase.toJSON(), balance });
});

router.put("/:id", requireAuth, requirePermission("purchases.manage"), async (req: AuthedRequest, res) => {
  const { customerBillNumber, purchaseNumber, supplierPartyId, purchaseDate, itemName, quantity, unitOfMeasure, unitPrice, currencyCode, notes } = req.body ?? {};
  const manualBillNumber = typeof purchaseNumber === "string" ? purchaseNumber : customerBillNumber;
  if (
    typeof manualBillNumber !== "string" ||
    !manualBillNumber.trim() ||
    typeof supplierPartyId !== "number" ||
    typeof purchaseDate !== "string" ||
    typeof itemName !== "string" ||
    !itemName.trim() ||
    quantity === undefined ||
    typeof unitOfMeasure !== "string" ||
    !unitOfMeasure.trim() ||
    unitPrice === undefined ||
    typeof currencyCode !== "string" ||
    !currencyCode.trim()
  ) {
    res.status(400).json({ error: "بیل نمبر، خرید کونکی، تاریخ، جنس نوم، مقدار، مقدار نوع، قیمت او اسعار اړین دي" });
    return;
  }
  try {
    const purchase = await updatePurchase({
      purchaseId: Number(req.params.id),
      purchaseNumber: manualBillNumber.trim(),
      supplierPartyId,
      purchaseDate,
      itemName,
      quantity,
      unitOfMeasure: unitOfMeasure.trim(),
      unitPrice,
      currencyCode,
      notes: notes ?? null,
    });
    await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "Purchase", entityId: String(purchase.id), details: req.body });
    res.json(purchase);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/", requireAuth, requirePermission("purchases.manage"), async (req: AuthedRequest, res) => {
  const { customerBillNumber, purchaseNumber, supplierPartyId, purchaseDate, itemName, quantity, unitOfMeasure, unitPrice, currencyCode, notes } = req.body ?? {};
  const manualBillNumber = typeof purchaseNumber === "string" ? purchaseNumber : customerBillNumber;
  if (
    typeof manualBillNumber !== "string" ||
    !manualBillNumber.trim() ||
    typeof supplierPartyId !== "number" ||
    typeof purchaseDate !== "string" ||
    typeof itemName !== "string" ||
    !itemName.trim() ||
    quantity === undefined ||
    typeof unitOfMeasure !== "string" ||
    !unitOfMeasure.trim() ||
    unitPrice === undefined ||
    typeof currencyCode !== "string" ||
    !currencyCode.trim()
  ) {
    res.status(400).json({ error: "بیل نمبر، خرید کونکی، تاریخ، جنس نوم، مقدار، مقدار نوع، قیمت او اسعار اړین دي" });
    return;
  }
  try {
    const purchase = await createPurchase({
      purchaseNumber: manualBillNumber.trim(),
      supplierPartyId,
      purchaseDate,
      itemName,
      quantity,
      unitOfMeasure: unitOfMeasure.trim(),
      unitPrice,
      currencyCode,
      notes: notes ?? null,
      createdByUserId: req.auth!.userId,
    });
    await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "Purchase", entityId: String(purchase.id), details: req.body });
    res.status(201).json(purchase);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/:id/delete", requireAuth, requirePermission("purchases.manage"), async (req: AuthedRequest, res) => {
  const { reason } = req.body ?? {};
  if (typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "د حذف دلیل اړین دی" });
    return;
  }
  const purchase = await Purchase.findByPk(Number(req.params.id), { include: purchasePartyIncludes });
  if (!purchase) {
    res.status(404).json({ error: "خریداري ونه موندل شوه" });
    return;
  }
  const snapshot = purchase.toJSON();
  try {
    const deleted = await voidPurchase(purchase.id, { userId: req.auth!.userId, reason: reason.trim() });
    await moveToTrash({
      userId: req.auth!.userId,
      entityType: "Purchase",
      entityId: deleted.id,
      displayName: deleted.purchaseNumber || deleted.itemName || `خرید ${deleted.id}`,
      sourcePath: `/purchases/${deleted.id}`,
      snapshot,
      reason: reason.trim(),
    });
    res.json(deleted);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/:id/payments", requireAuth, requirePermission("purchases.manage"), async (req: AuthedRequest, res) => {
  const { amount, currencyCode, paymentDate, method, cashAccountId, reference, note } = req.body ?? {};
  if (amount === undefined || typeof currencyCode !== "string" || typeof paymentDate !== "string") {
    res.status(400).json({ error: "پیسې، اسعار او تاریخ اړین دي" });
    return;
  }
  try {
    const payment = await addPurchasePayment({
      purchaseId: Number(req.params.id),
      amount,
      currencyCode,
      paymentDate,
      method,
      cashAccountId: cashAccountId ?? null,
      reference: reference ?? null,
      note: note ?? null,
      paidByUserId: req.auth!.userId,
    });
    await recordAudit({
      userId: req.auth!.userId,
      action: "create",
      entityType: "PurchasePayment",
      entityId: String(payment.id),
      details: req.body,
    });
    res.status(201).json(payment);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/:id/returns", requireAuth, requirePermission("purchases.manage"), async (req: AuthedRequest, res) => {
  const { customerBillNumber, returnDate, returnedItemName, quantity, amount, currencyCode, reason } = req.body ?? {};
  if (
    typeof customerBillNumber !== "string" ||
    !customerBillNumber.trim() ||
    typeof returnDate !== "string" ||
    typeof returnedItemName !== "string" ||
    quantity === undefined ||
    amount === undefined ||
    typeof currencyCode !== "string" ||
    typeof reason !== "string"
  ) {
    res.status(400).json({ error: "تاریخ، جنس، مقدار، پیسې، اسعار او دلیل اړین دي" });
    return;
  }
  try {
    const ret = await createPurchaseReturn({
      purchaseId: Number(req.params.id),
      customerBillNumber: customerBillNumber.trim(),
      returnDate,
      returnedItemName,
      quantity,
      amount,
      currencyCode,
      reason,
      createdByUserId: req.auth!.userId,
    });
    await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "PurchaseReturn", entityId: String(ret.id), details: req.body });
    res.status(201).json(ret);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
