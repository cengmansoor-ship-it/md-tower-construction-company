import { Router, type Response, type IRouter } from "express";
import { Op, type Transaction } from "sequelize";
import {
  Party,
  PartyRole,
  JournalLine,
  JournalTransaction,
  PostingLink,
  Account,
  Purchase,
  PurchasePayment,
  PurchaseReturn,
  Rental,
  RentalReceipt,
  Sale,
  SaleReceipt,
  ExchangeTransaction,
  Decimal,
  postJournal,
  reverseSale,
  reverseSaleReceipt,
  sequelize,
  voidDailyCashEntry,
  findVoidedPostedSourceIds,
  PostingError,
  type PartyType,
} from "@workspace/db-sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";
import { moveToTrash } from "../lib/trash";
import { cascadePartyRecords } from "../lib/party-cascade";

const router: IRouter = Router();

const PARTY_TYPES: PartyType[] = [
  "individual_customer",
  "market_customer",
  "supplier",
  "sales_customer",
  "tenant",
  "exchange_dealer",
  "employee",
  "partner",
  "other",
];

/** Maps the broader Party master types to the narrower journal_lines.partyType enum for ledger lookups. */
function toJournalPartyType(type: PartyType): string {
  switch (type) {
    case "individual_customer":
    case "market_customer":
    case "sales_customer":
      return "customer";
    case "supplier":
      return "supplier";
    case "tenant":
      return "tenant";
    case "exchange_dealer":
      return "exchange_dealer";
    case "employee":
      return "employee";
    case "partner":
      return "partner";
    default:
      return "customer";
  }
}

function normalizePartyType(type: unknown): PartyType | null {
  if (type === "market_individual") return "market_customer";
  if (typeof type === "string" && PARTY_TYPES.includes(type as PartyType)) return type as PartyType;
  return null;
}

function normalizeOptionalPhone(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{10}$/.test(value.trim())) {
    throw new Error(`${label} باید دقیق ۱۰ عدده وي`);
  }
  return value.trim();
}

function accountCodeForPartyType(type: PartyType): string {
  if (type === "supplier") return "2000";
  if (type === "partner") return "3000";
  return "1100";
}

function ledgerDirectionForEntry(type: PartyType, entryType: "money" | "receipt"): "debit" | "credit" {
  if (type === "supplier") return entryType === "receipt" ? "debit" : "credit";
  return entryType === "money" ? "debit" : "credit";
}

async function marketIndividualBalance(
  partyId: number,
  currencyCode: string,
  transaction: Transaction,
  excludeTransactionId?: number,
): Promise<Decimal> {
  const where: Record<string, unknown> = {
    partyId,
    partyType: "customer",
    currencyCode,
  };
  if (excludeTransactionId) where["transactionId"] = { [Op.ne]: excludeTransactionId };
  const lines = await JournalLine.findAll({
    where,
    include: [{ model: JournalTransaction, as: "transaction", where: { voidedAt: null, reversalOfId: null }, required: true }],
    transaction,
  });
  return lines.reduce((total, line) => {
    const amount = new Decimal(line.amount);
    return line.direction === "debit" ? total.plus(amount) : total.minus(amount);
  }, new Decimal(0));
}

async function ledgerDirectionForPartyEntry(
  party: Party,
  entryType: "money" | "receipt",
  description: string,
  currencyCode: string,
  transaction: Transaction,
  excludeTransactionId?: number,
): Promise<"debit" | "credit"> {
  if (isMarketIndividualType(party.type) && entryType === "receipt" && !isMarketTransactionDescription(description)) {
    const balance = await marketIndividualBalance(party.id, currencyCode, transaction, excludeTransactionId);
    if (balance.lessThan(0)) return "debit";
    if (balance.greaterThan(0)) return "credit";
  }
  return ledgerDirectionForEntry(party.type, entryType);
}

function isMarketIndividualType(type: PartyType): boolean {
  return type === "individual_customer" || type === "market_customer";
}

function isMarketTransactionDescription(description: string | null | undefined): boolean {
  return (description ?? "").trim().startsWith("بازار/انفرادي ");
}

function isMarketBalanceDecreaseDescription(description: string | null | undefined): boolean {
  const text = description ?? "";
  return isMarketTransactionDescription(text) && (text.includes("واپسي") || text.includes("واپس"));
}

function applyMarketSettlementBalance(current: Decimal, amount: Decimal): Decimal {
  return current.lessThan(0) ? current.plus(amount) : current.minus(amount);
}

function extractLabeledBillNumber(description: string | null | undefined, labels: string[]): string | null {
  const text = description ?? "";
  for (const label of labels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`${escapedLabel}\\s*[:：]\\s*(.+?)(?=\\s+-\\s+|$)`, "u"));
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function companyBillNumberFromDescription(description: string | null | undefined): string | null {
  return extractLabeledBillNumber(description, ["د شرکت بیل نمبر", "د شرکت بیل شمېره", "د شرکت بیل شماره"]);
}

function customerBillNumberFromDescription(description: string | null | undefined): string | null {
  return extractLabeledBillNumber(description, ["د مشتری بیل نمبر", "د مشتري بیل نمبر", "د مشتری بیل شمېره", "د مشتري بیل شمېره"]);
}

function userLedgerDetail(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  return value;
}

const RECEIPT_DETAIL_PREFIX = "د پیسو رسید - ";
const RECEIPT_KIND_LABELS = ["تجري", "صراف", "بانک"];
const DAILY_CASH_DETAIL_PREFIX = "د روزنامچې له لارې - ";
const DAILY_CASH_EFFECT_SEPARATOR = " | د روزنامچې اثر";
const DAILY_CASH_EFFECT_PREFIX = "د روزنامچې اثر";
const CUSTOMER_BILL_PREFIX_PATTERN = /^\s*-?\s*د\s+(?:مشتری|مشتري)\s+بیل\s+(?:نمبر|شمېره|شماره)\s*[:：]?\s*[^-]*(?:\s+-\s*)?/u;
const EXCHANGE_LEDGER_PREFIX_PATTERN = /^\s*صرافي\s*-\s*(?:صراف ته جمع|د صرافی له طرفه رسیده ګی دفتر ته)\s*(?:-\s*)?/u;

function stripGeneratedLedgerDetail(value: string): string {
  let text = value.trim();
  const dailyCashEffectIndex = text.indexOf(DAILY_CASH_EFFECT_SEPARATOR);
  if (dailyCashEffectIndex >= 0) text = text.slice(0, dailyCashEffectIndex).trim();
  if (text.startsWith(DAILY_CASH_DETAIL_PREFIX)) {
    const parts = text.slice(DAILY_CASH_DETAIL_PREFIX.length).trim().split(/\s+-\s+/u);
    if (parts.length > 1) parts.pop();
    text = parts.join(" - ").trim();
  }
  if (text.startsWith(DAILY_CASH_EFFECT_PREFIX)) return "";
  text = text.replace(/\s+-\s+د شرکت بیل نمبر:\s*.+$/u, "").trim();
  if (text.startsWith(RECEIPT_DETAIL_PREFIX)) text = text.slice(RECEIPT_DETAIL_PREFIX.length).trim();
  for (const label of RECEIPT_KIND_LABELS) {
    if (text === label) return "";
    const prefix = `${label} - `;
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length).trim();
      break;
    }
  }
  text = text.replace(/^\s*بازار\/انفرادي\s+[^-]+(?:\s+-\s+د مشتری بیل نمبر:\s*[^-]*)?(?:\s+-\s*)?/u, "");
  text = text.replace(/^\s*بازار\/انفرادي\s+[^-]+(?:\s+-\s+د مشتري بیل نمبر:\s*[^-]*)?(?:\s+-\s*)?/u, "");
  text = text.replace(EXCHANGE_LEDGER_PREFIX_PATTERN, "");
  text = text.replace(CUSTOMER_BILL_PREFIX_PATTERN, "");
  text = text.replace(/^\s*-\s*/u, "");
  return text.trim();
}

function visibleLedgerDetail(value: string | null | undefined): string {
  if (!value) return "";
  return stripGeneratedLedgerDetail(value);
}

function sourceUrlFor(sourceModule: string | null, sourceId: number | null, partyId: number): string | null {
  if (!sourceModule || !sourceId) return null;
  if (sourceModule === "purchase") return `/purchases/${sourceId}`;
  if (sourceModule === "purchase_payment") return `/parties/${partyId}`;
  if (sourceModule === "purchase_return") return "/purchase-returns";
  if (sourceModule === "sale") return `/sales/${sourceId}`;
  if (sourceModule === "sale_receipt") return `/parties/${partyId}`;
  if (sourceModule === "rental") return `/rentals/${sourceId}`;
  if (sourceModule === "exchange") return "/exchange";
  if (sourceModule === "employee_payment") return `/parties/${partyId}`;
  if (sourceModule === "partner_transaction") return "/partners";
  if (sourceModule === "daily_cash") return "/journal";
  return null;
}

function sourceLabelFor(sourceModule: string | null): string {
  switch (sourceModule) {
    case "purchase":
      return "خریداري";
    case "purchase_payment":
      return "د خرید پیسو رسید";
    case "purchase_return":
      return "واپسي بیل";
    case "sale":
      return "فروش";
    case "sale_receipt":
      return "د فروش رسید";
    case "rental":
      return "کرایه";
    case "rental_receipt":
      return "د کرایې رسید";
    case "exchange":
      return "صرافي";
    case "employee_payment":
      return "د کارکوونکي تادیه";
    case "partner_transaction":
      return "د شریک راکړه/ورکړه";
    case "daily_cash":
      return "روزنامچه";
    default:
      return "اصلاحي ثبت";
  }
}

function positiveDecimal(value: unknown, label: string): Decimal {
  const decimal = new Decimal(value as string | number);
  if (!decimal.isFinite() || decimal.lessThanOrEqualTo(0)) {
    throw new Error(`${label} باید تر صفر زیات وي`);
  }
  return decimal;
}

const PURCHASE_ITEM_FAMILIES = [
  { label: "سیخ", terms: ["سیخ", "سيخ", "rebar", "sikh"] },
  { label: "خښته", terms: ["خښته", "خښتې", "خشت", "brick"] },
  { label: "سمنت", terms: ["سمنت", "سیمنټ", "سیمان", "سيمان", "cement"] },
  { label: "کاشي", terms: ["کاشي", "کاشی", "tile"] },
  { label: "سرېش", terms: ["سرېش", "سریش", "glue"] },
  { label: "ریګ", terms: ["ریګ", "ريګ", "شګه", "sand"] },
  { label: "جغل", terms: ["جغل", "کرش", "crush", "gravel"] },
  { label: "موتر", terms: ["موتر", "موټر"] },
  { label: "پارسل", terms: ["پارسل"] },
  { label: "بندل", terms: ["بندل", "بندلونه"] },
  { label: "پایپ", terms: ["پایپ", "پايپ", "pipe"] },
  { label: "رنګ", terms: ["رنګ", "paint"] },
] as const;

const PURCHASE_ITEM_DETAIL_WORDS = new Set([
  "میلي", "ملي", "مليمتر", "ملی", "mm", "cm", "m", "meter", "متر", "متره",
  "اینچ", "انچ", "inch", "kg", "g", "ton", "tons", "ټن", "کیلو", "کيلو",
  "دانه", "عدد", "بوری", "بوجۍ", "کارتن", "درجه", "نمبر", "سایز", "اندازه",
  "نوع", "ډول", "تور", "سپین", "سور", "غټ", "کوچنی", "کلان", "خورد",
]);

function normalizeItemDigits(value: string): string {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = persian.indexOf(digit);
    if (persianIndex >= 0) return String(persianIndex);
    return String(arabic.indexOf(digit));
  });
}

function isPurchaseItemDetailToken(token: string): boolean {
  const normalized = normalizeItemDigits(token)
    .toLowerCase()
    .replace(/[^\w.\u0600-\u06FF]/g, "");
  if (!normalized) return true;
  if (/[0-9]/.test(normalized)) return true;
  return PURCHASE_ITEM_DETAIL_WORDS.has(normalized);
}

function purchaseItemFamilyName(itemName: string): string {
  const clean = itemName.trim().replace(/[،,\/\\|()[\]{}:_\-–—]+/g, " ").replace(/\s+/g, " ");
  if (!clean) return "نامعلوم جنس";
  return clean;
}

router.get("/", requireAuth, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
  const where: Record<string | symbol, unknown> = { deletedAt: null };
  if (type === "market_individual") {
    where["type"] = { [Op.in]: ["individual_customer", "market_customer"] };
  } else if (type) {
    where["type"] = type;
  }
  if (q) {
    where[Op.or] = [
      { name: { [Op.like]: `%${q}%` } },
      { fatherName: { [Op.like]: `%${q}%` } },
      { grandfatherName: { [Op.like]: `%${q}%` } },
      { tazkiraNumber: { [Op.like]: `%${q}%` } },
      { phone1: { [Op.like]: `%${q}%` } },
      { phone2: { [Op.like]: `%${q}%` } },
      { address: { [Op.like]: `%${q}%` } },
      { notes: { [Op.like]: `%${q}%` } },
    ];
  }
  const parties = await Party.findAll({ where, order: [["name", "ASC"]], limit: 200 });
  const includeBalances = req.query.withBalances === "1" || req.query.withBalances === "true";
  if (!includeBalances || parties.length === 0) {
    res.json(parties);
    return;
  }

  const partyById = new Map(parties.map((party) => [party.id, party]));
  const transactionWhere: Record<string, unknown> = { voidedAt: null, reversalOfId: null };
  if (startDate || endDate) {
    transactionWhere["transactionDate"] = {
      ...(startDate ? { [Op.gte]: startDate } : {}),
      ...(endDate ? { [Op.lte]: endDate } : {}),
    };
  }
  const lines = await JournalLine.findAll({
    where: { partyId: { [Op.in]: parties.map((party) => party.id) } },
    include: [{ model: JournalTransaction, as: "transaction", where: transactionWhere }],
  });
  lines.sort((left, right) => {
    const leftJson = left.toJSON() as { transaction?: { transactionDate?: string | Date | null } };
    const rightJson = right.toJSON() as { transaction?: { transactionDate?: string | Date | null } };
    const leftDate = String(leftJson.transaction?.transactionDate ?? "");
    const rightDate = String(rightJson.transaction?.transactionDate ?? "");
    return leftDate === rightDate ? left.id - right.id : leftDate.localeCompare(rightDate);
  });
  const balances = new Map<number, Record<string, Decimal>>();
  for (const line of lines) {
    const party = line.partyId ? partyById.get(line.partyId) : undefined;
    if (!party || line.partyType !== toJournalPartyType(party.type)) continue;
    const partyBalances = balances.get(party.id) ?? {};
    const current = partyBalances[line.currencyCode] ?? new Decimal(0);
    const amount = new Decimal(line.amount);
    if (isMarketIndividualType(party.type) && !isMarketTransactionDescription(line.description)) {
      partyBalances[line.currencyCode] = applyMarketSettlementBalance(current, amount);
    } else {
      partyBalances[line.currencyCode] = line.direction === "debit"
        ? current.plus(amount)
        : current.minus(amount);
    }
    balances.set(party.id, partyBalances);
  }

  res.json(parties.map((party) => {
    const row = party.toJSON() as Record<string, unknown>;
    const partyBalances = balances.get(party.id) ?? {};
    row.balances = {
      AFN: (partyBalances.AFN ?? new Decimal(0)).toFixed(),
      USD: (partyBalances.USD ?? new Decimal(0)).toFixed(),
      PKR: (partyBalances.PKR ?? new Decimal(0)).toFixed(),
    };
    return row;
  }));
});

router.get("/duplicate-check", requireAuth, async (req, res) => {
  const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
  const tazkiraNumber = typeof req.query.tazkiraNumber === "string" ? req.query.tazkiraNumber.trim() : "";
  if (!name && !tazkiraNumber) {
    res.json([]);
    return;
  }
  const orClauses: Record<string, unknown>[] = [];
  if (name) orClauses.push({ name: { [Op.like]: `%${name}%` } });
  if (tazkiraNumber) orClauses.push({ tazkiraNumber });
  const where: Record<string | symbol, unknown> = { deletedAt: null, [Op.or]: orClauses };
  const matches = await Party.findAll({ where, limit: 10 });
  res.json(matches);
});

router.get("/:id", requireAuth, async (req, res) => {
  const party = await Party.findByPk(Number(req.params.id), { include: [{ model: PartyRole, as: "roles" }] });
  if (!party || party.deletedAt) {
    res.status(404).json({ error: "Party not found" });
    return;
  }
  res.json(party);
});

router.post("/", requireAuth, requirePermission("parties.manage"), async (req: AuthedRequest, res) => {
  const { type, name, companyName, fatherName, grandfatherName, tazkiraNumber, taxRegNumber, phone1, phone2, address, notes, photoUrl } =
    req.body ?? {};
  const normalizedType = normalizePartyType(type);
  if (!normalizedType || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "type and name are required" });
    return;
  }
  let normalizedPhone1: string | null;
  let normalizedPhone2: string | null;
  try {
    normalizedPhone1 = normalizeOptionalPhone(phone1, "تماس شمېره");
    normalizedPhone2 = normalizeOptionalPhone(phone2, "دوهم تماس");
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "د تماس شمېره ناسمه ده" });
    return;
  }
  const party = await Party.create({
    type: normalizedType,
    name: name.trim(),
    companyName: companyName || null,
    fatherName: fatherName || null,
    grandfatherName: grandfatherName || null,
    tazkiraNumber: tazkiraNumber || null,
    taxRegNumber: taxRegNumber || null,
    phone1: normalizedPhone1,
    phone2: normalizedPhone2,
    address: address || null,
    notes: notes || null,
    photoUrl: photoUrl || null,
  });
  await PartyRole.findOrCreate({ where: { partyId: party.id, role: normalizedType }, defaults: { partyId: party.id, role: normalizedType } });
  await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "Party", entityId: String(party.id), details: req.body });
  res.status(201).json(party);
});

router.put("/:id", requireAuth, requirePermission("parties.manage"), async (req: AuthedRequest, res) => {
  const party = await Party.findByPk(Number(req.params.id));
  if (!party || party.deletedAt) {
    res.status(404).json({ error: "Party not found" });
    return;
  }
  const { type, name, companyName, fatherName, grandfatherName, tazkiraNumber, taxRegNumber, phone1, phone2, address, notes, photoUrl, isActive } =
    req.body ?? {};
  const normalizedType = normalizePartyType(type);
  if (normalizedType) {
    party.type = normalizedType;
    await PartyRole.findOrCreate({ where: { partyId: party.id, role: normalizedType }, defaults: { partyId: party.id, role: normalizedType } });
  }
  if (typeof name === "string" && name.trim()) party.name = name.trim();
  if (companyName !== undefined) party.companyName = companyName || null;
  if (fatherName !== undefined) party.fatherName = fatherName || null;
  if (grandfatherName !== undefined) party.grandfatherName = grandfatherName || null;
  if (tazkiraNumber !== undefined) party.tazkiraNumber = tazkiraNumber || null;
  if (taxRegNumber !== undefined) party.taxRegNumber = taxRegNumber || null;
  try {
    if (phone1 !== undefined) party.phone1 = normalizeOptionalPhone(phone1, "تماس شمېره");
    if (phone2 !== undefined) party.phone2 = normalizeOptionalPhone(phone2, "دوهم تماس");
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "د تماس شمېره ناسمه ده" });
    return;
  }
  if (address !== undefined) party.address = address || null;
  if (notes !== undefined) party.notes = notes || null;
  if (photoUrl !== undefined) party.photoUrl = photoUrl || null;
  if (typeof isActive === "boolean") party.isActive = isActive;
  await party.save();
  await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "Party", entityId: String(party.id), details: req.body });
  res.json(party);
});

async function softDeleteParty(req: AuthedRequest, res: Response): Promise<void> {
  const reason =
    typeof req.body?.reason === "string" && req.body.reason.trim()
      ? req.body.reason.trim()
      : typeof req.query.reason === "string" && req.query.reason.trim()
      ? req.query.reason.trim()
      : "";
  if (!reason) {
    res.status(400).json({ error: "د حذف دلیل اړین دی" });
    return;
  }
  const party = await Party.findByPk(Number(req.params.id), { include: [{ model: PartyRole, as: "roles" }] });
  if (!party || party.deletedAt) {
    res.status(404).json({ error: "Party not found" });
    return;
  }

  const snapshot = party.toJSON();

  // Reverse/void every related record (sales, rentals, purchases, exchange transactions,
  // partner transactions, daily cash entries, direct ledger entries, credits, roles) so no
  // stale entries survive in the dashboard or reports; each row is trashed with a snapshot.
  try {
    await cascadePartyRecords(party, { userId: req.auth!.userId, reason });
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  party.deletedAt = new Date();
  party.deletedByUserId = req.auth!.userId;
  party.deleteReason = reason;
  party.isActive = false;
  await party.save();
  await moveToTrash({
    userId: req.auth!.userId,
    entityType: "Party",
    entityId: party.id,
    displayName: party.name,
    sourcePath: "/parties",
    snapshot,
    reason,
  });
  res.json(party);
}

router.post("/:id/delete", requireAuth, requirePermission("parties.manage"), softDeleteParty);
router.delete("/:id", requireAuth, requirePermission("parties.manage"), softDeleteParty);

router.get("/:id/ledger", requireAuth, async (req, res) => {
  const party = await Party.findByPk(Number(req.params.id));
  if (!party || party.deletedAt) {
    res.status(404).json({ error: "Party not found" });
    return;
  }
  const currencyCode = typeof req.query.currency === "string" ? req.query.currency : undefined;
  const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
  const journalPartyType = toJournalPartyType(party.type);
  const where: Record<string, unknown> = { partyType: journalPartyType, partyId: party.id };
  if (currencyCode) where["currencyCode"] = currencyCode;
  const transactionWhere: Record<string, unknown> = { voidedAt: null, reversalOfId: null };
  if (startDate || endDate) {
    transactionWhere["transactionDate"] = {
      ...(startDate ? { [Op.gte]: startDate } : {}),
      ...(endDate ? { [Op.lte]: endDate } : {}),
    };
  }

  const lines = await JournalLine.findAll({
    where,
    include: [
      { model: JournalTransaction, as: "transaction", where: transactionWhere },
      { model: Account, as: "account" },
    ],
    order: [[{ model: JournalTransaction, as: "transaction" }, "transactionDate", "ASC"]],
  });

  const transactionIds = Array.from(new Set(lines.map((line) => line.transactionId)));
  const links = transactionIds.length > 0
    ? await PostingLink.findAll({ where: { transactionId: { [Op.in]: transactionIds } } })
    : [];
  const linkByTransactionId = new Map(links.map((link) => [link.transactionId, link]));
  const purchaseIds = links.filter((link) => link.sourceModule === "purchase").map((link) => link.sourceId);
  const paymentIds = links.filter((link) => link.sourceModule === "purchase_payment").map((link) => link.sourceId);
  const returnIds = links.filter((link) => link.sourceModule === "purchase_return").map((link) => link.sourceId);
  const saleIds = links.filter((link) => link.sourceModule === "sale").map((link) => link.sourceId);
  const saleReceiptIds = links.filter((link) => link.sourceModule === "sale_receipt").map((link) => link.sourceId);
  const rentalIds = links.filter((link) => link.sourceModule === "rental").map((link) => link.sourceId);
  const rentalReceiptIds = links.filter((link) => link.sourceModule === "rental_receipt").map((link) => link.sourceId);
  const exchangeIds = links.filter((link) => link.sourceModule === "exchange").map((link) => link.sourceId);
  const purchases = purchaseIds.length ? await Purchase.findAll({ where: { id: { [Op.in]: purchaseIds } } }) : [];
  const payments = paymentIds.length ? await PurchasePayment.findAll({ where: { id: { [Op.in]: paymentIds } } }) : [];
  const returns = returnIds.length
    ? await PurchaseReturn.findAll({
        where: { id: { [Op.in]: returnIds } },
        include: [{ model: Purchase, as: "purchase" }],
      })
    : [];
  const sales = saleIds.length ? await Sale.findAll({ where: { id: { [Op.in]: saleIds } } }) : [];
  const saleReceipts = saleReceiptIds.length ? await SaleReceipt.findAll({ where: { id: { [Op.in]: saleReceiptIds } } }) : [];
  const rentals = rentalIds.length ? await Rental.findAll({ where: { id: { [Op.in]: rentalIds } } }) : [];
  const rentalReceipts = rentalReceiptIds.length ? await RentalReceipt.findAll({ where: { id: { [Op.in]: rentalReceiptIds } } }) : [];
  const exchanges = exchangeIds.length ? await ExchangeTransaction.findAll({ where: { id: { [Op.in]: exchangeIds } } }) : [];
  const purchaseById = new Map(purchases.map((purchase) => [purchase.id, purchase]));
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const returnById = new Map(returns.map((ret) => [ret.id, ret]));
  const saleById = new Map(sales.map((sale) => [sale.id, sale]));
  const saleReceiptById = new Map(saleReceipts.map((receipt) => [receipt.id, receipt]));
  const rentalById = new Map(rentals.map((rental) => [rental.id, rental]));
  const rentalReceiptById = new Map(rentalReceipts.map((receipt) => [receipt.id, receipt]));
  const exchangeById = new Map(exchanges.map((exchange) => [exchange.id, exchange]));
  const purchaseWhere: Record<string, unknown> = {
    supplierPartyId: party.id,
    status: { [Op.ne]: "cancelled" },
  };
  if (currencyCode) purchaseWhere["currencyCode"] = currencyCode;
  if (startDate || endDate) {
    purchaseWhere["purchaseDate"] = {
      ...(startDate ? { [Op.gte]: startDate } : {}),
      ...(endDate ? { [Op.lte]: endDate } : {}),
    };
  }
  const supplierPurchasesRaw = party.type === "supplier"
    ? await Purchase.findAll({ where: purchaseWhere, order: [["purchaseDate", "ASC"], ["id", "ASC"]] })
    : [];
  const supplierReturnWhere: Record<string, unknown> = {};
  if (currencyCode) supplierReturnWhere["currencyCode"] = currencyCode;
  if (startDate || endDate) {
    supplierReturnWhere["returnDate"] = {
      ...(startDate ? { [Op.gte]: startDate } : {}),
      ...(endDate ? { [Op.lte]: endDate } : {}),
    };
  }
  const supplierReturnsRaw = party.type === "supplier"
    ? await PurchaseReturn.findAll({
        where: supplierReturnWhere,
        include: [
          {
            model: Purchase,
            as: "purchase",
            required: true,
            where: {
              supplierPartyId: party.id,
              status: { [Op.ne]: "cancelled" },
              ...(currencyCode ? { currencyCode } : {}),
            },
          },
        ],
        order: [["returnDate", "ASC"], ["id", "ASC"]],
      })
    : [];
  const voidedSupplierPurchaseIds = await findVoidedPostedSourceIds({
    sourceModule: "purchase",
    sourceIds: supplierPurchasesRaw.map((purchase) => purchase.id),
    postingType: "purchase_creation",
  });
  const voidedSupplierReturnIds = await findVoidedPostedSourceIds({
    sourceModule: "purchase_return",
    sourceIds: supplierReturnsRaw.map((ret) => ret.id),
    postingType: "purchase_return",
  });
  const supplierPurchases = supplierPurchasesRaw.filter((purchase) => !voidedSupplierPurchaseIds.has(purchase.id));
  const supplierReturns = supplierReturnsRaw.filter((ret) => !voidedSupplierReturnIds.has(ret.id));
  const itemTotalMap = new Map<string, { itemName: string; quantity: Decimal }>();
  function applyItemQuantity(itemNameValue: string, quantityDelta: Decimal) {
    const itemName = purchaseItemFamilyName(itemNameValue);
    const key = itemName.toLowerCase();
    const previous = itemTotalMap.get(key) ?? { itemName, quantity: new Decimal(0) };
    previous.quantity = previous.quantity.plus(quantityDelta);
    itemTotalMap.set(key, previous);
  }
  for (const purchase of supplierPurchases) {
    applyItemQuantity(purchase.itemName, new Decimal(purchase.quantity));
  }
  for (const ret of supplierReturns) {
    applyItemQuantity(ret.returnedItemName, new Decimal(ret.quantity).negated());
  }
  const balances = new Map<string, { debit: Decimal; credit: Decimal }>();
  const running = new Map<string, Decimal>();
  const rows = lines.map((line, index) => {
    const joined = line.toJSON() as {
      transaction?: { transactionDate?: string; memo?: string | null };
      account?: { name?: string | null };
    };
    const amount = new Decimal(line.amount);
    const current = running.get(line.currencyCode) ?? new Decimal(0);
    const next = line.direction === "debit" ? current.plus(amount) : current.minus(amount);
    running.set(line.currencyCode, next);
    const source = linkByTransactionId.get(line.transactionId);
    let sourceReference: string | null = null;
    let sourceQuantity: string | null = null;
    let sourceUnitOfMeasure: string | null = null;
    let sourceUnitPrice: string | null = null;
    let sourceTotalAmount: string | null = null;
    let sourceItemName: string | null = null;
    let sourceCustomerBillNumber: string | null = null;
    let sourceNote: string | null = null;
    let sourceUrl = sourceUrlFor(source?.sourceModule ?? null, source?.sourceId ?? null, party.id);
    if (source?.sourceModule === "purchase") {
      const purchase = purchaseById.get(source.sourceId);
      sourceReference = purchase?.customerBillNumber || purchase?.purchaseNumber || null;
      sourceCustomerBillNumber = null;
      sourceItemName = purchase?.itemName ?? null;
      sourceQuantity = purchase?.quantity ?? null;
      sourceUnitOfMeasure = purchase?.unitOfMeasure ?? null;
      sourceUnitPrice = purchase?.unitPrice ?? null;
      sourceTotalAmount = purchase?.totalAmount ?? null;
      sourceNote = userLedgerDetail(purchase?.notes);
    } else if (source?.sourceModule === "purchase_payment") {
      const payment = paymentById.get(source.sourceId);
      sourceReference = payment?.paymentNumber ?? null;
      sourceNote = userLedgerDetail(payment?.note);
      sourceUrl = payment ? `/purchases/${payment.purchaseId}` : sourceUrl;
    } else if (source?.sourceModule === "purchase_return") {
      const ret = returnById.get(source.sourceId);
      const purchase = (ret as unknown as { purchase?: Purchase } | undefined)?.purchase;
      sourceReference = ret?.returnNumber ?? null;
      sourceCustomerBillNumber = ret?.customerBillNumber ?? null;
      sourceItemName = ret?.returnedItemName ?? null;
      sourceQuantity = ret ? new Decimal(ret.quantity).negated().toFixed() : null;
      sourceUnitOfMeasure = purchase?.unitOfMeasure ?? null;
      sourceUnitPrice = purchase?.unitPrice ?? null;
      sourceNote = userLedgerDetail(ret?.reason);
      sourceUrl = ret ? `/purchases/${ret.purchaseId}` : sourceUrl;
    } else if (source?.sourceModule === "sale") {
      const sale = saleById.get(source.sourceId);
      sourceReference = sale?.contractNumber || sale?.saleNumber || null;
      sourceNote = userLedgerDetail(sale?.notes);
    } else if (source?.sourceModule === "sale_receipt") {
      const receipt = saleReceiptById.get(source.sourceId);
      sourceReference = receipt?.receiptNumber ?? null;
      sourceNote = userLedgerDetail(receipt?.note);
      sourceUrl = receipt ? `/sales/${receipt.saleId}` : sourceUrl;
    } else if (source?.sourceModule === "rental") {
      const rental = rentalById.get(source.sourceId);
      sourceReference = rental?.rentalNumber ?? null;
      sourceNote = userLedgerDetail(rental?.notes);
    } else if (source?.sourceModule === "rental_receipt") {
      const receipt = rentalReceiptById.get(source.sourceId);
      sourceReference = receipt?.receiptNumber ?? null;
      sourceNote = userLedgerDetail(receipt?.note);
      sourceUrl = receipt ? `/rentals/${receipt.rentalId}` : sourceUrl;
    } else if (source?.sourceModule === "exchange") {
      const exchange = exchangeById.get(source.sourceId);
      sourceReference = exchange?.reference || exchange?.exchangeNumber || null;
      sourceNote = userLedgerDetail(exchange?.notes);
    }
    const baseDescription = line.description ?? joined.transaction?.memo ?? "";
    const sourceReferenceText = source ? (sourceNote ?? baseDescription) : baseDescription;
    const rowDescription = visibleLedgerDetail(source ? (sourceNote ?? baseDescription) : baseDescription);
    const isMarketTransaction = isMarketIndividualType(party.type) && isMarketTransactionDescription(baseDescription);
    const isMarketSettlement = isMarketIndividualType(party.type) && !isMarketTransaction;
    const isMarketBalanceDecrease = isMarketTransaction && isMarketBalanceDecreaseDescription(baseDescription);
    sourceReference = sourceReference ?? companyBillNumberFromDescription(sourceReferenceText);
    sourceCustomerBillNumber = sourceCustomerBillNumber ?? customerBillNumberFromDescription(sourceReferenceText);

    return {
      id: line.id,
      lineId: line.id,
      transactionId: line.transactionId,
      number: index + 1,
      date: joined.transaction?.transactionDate ?? "",
      description: rowDescription,
      accountName: joined.account?.name ?? null,
      money: line.direction === "debit" ? line.amount : "0",
      receipt: line.direction === "credit" ? line.amount : "0",
      balance: next.toFixed(),
      currencyCode: line.currencyCode,
      direction: line.direction,
      sourceModule: source?.sourceModule ?? null,
      sourceId: source?.sourceId ?? null,
      sourceLabel: sourceLabelFor(source?.sourceModule ?? null),
      sourceUrl,
      sourceReference,
      sourceCustomerBillNumber,
      sourceItemName,
      sourceQuantity,
      sourceUnitOfMeasure,
      sourceUnitPrice,
      sourceTotalAmount,
      isMarketTransaction,
      isMarketSettlement,
      isMarketBalanceDecrease,
      canEdit: !source,
      canDelete: true,
    };
  });
  for (const line of lines) {
    const bucket = balances.get(line.currencyCode) ?? { debit: new Decimal(0), credit: new Decimal(0) };
    if (line.direction === "debit") bucket.debit = bucket.debit.plus(new Decimal(line.amount));
    else bucket.credit = bucket.credit.plus(new Decimal(line.amount));
    balances.set(line.currencyCode, bucket);
  }

  res.json({
    party,
    lines,
    rows,
    purchaseItemTotals: Array.from(itemTotalMap.values()).map((item) => ({
      itemName: item.itemName,
      unitOfMeasure: null,
      quantity: item.quantity.toFixed(),
    })),
    balances: Object.fromEntries(
      Array.from(balances.entries()).map(([code, b]) => [
        code,
        { debit: b.debit.toFixed(), credit: b.credit.toFixed(), net: b.debit.minus(b.credit).toFixed() },
      ]),
    ),
  });
});

router.post("/:id/ledger", requireAuth, requirePermission("accounting.manage"), async (req: AuthedRequest, res) => {
  const party = await Party.findByPk(Number(req.params.id));
  if (!party) {
    res.status(404).json({ error: "Party not found" });
    return;
  }
  const { date, description, currencyCode, entryType, amount } = req.body ?? {};
  if (typeof date !== "string" || typeof currencyCode !== "string" || typeof entryType !== "string" || amount === undefined) {
    res.status(400).json({ error: "تاریخ، پیسې ډول، د ثبت ډول او اندازه اړین دي" });
    return;
  }
  if (entryType !== "money" && entryType !== "receipt") {
    res.status(400).json({ error: "د ثبت ډول باید money یا receipt وي" });
    return;
  }
  try {
    const value = positiveDecimal(amount, "اندازه");
    const partyAccount = await Account.findOne({ where: { code: accountCodeForPartyType(party.type) } });
    const cashAccount = await Account.findOne({ where: { code: "1000" } });
    if (!partyAccount || !cashAccount) {
      res.status(400).json({ error: "اصلي حسابونه ونه موندل شول" });
      return;
    }
    const journalPartyType = toJournalPartyType(party.type) as "customer" | "supplier" | "tenant" | "employee" | "partner" | "exchange_dealer";
    const descriptionText = typeof description === "string" ? description.trim() : "";
    const journal = await sequelize.transaction(async (t) => {
      const partyDirection = await ledgerDirectionForPartyEntry(party, entryType, descriptionText, currencyCode, t);
      const cashDirection = partyDirection === "debit" ? "credit" : "debit";
      return postJournal(
        {
          transactionDate: date,
          memo: descriptionText,
          isManual: true,
          createdByUserId: req.auth!.userId,
          lines: [
            {
              accountId: partyAccount.id,
              currencyCode,
              direction: partyDirection,
              amount: value.toFixed(),
              partyType: journalPartyType,
              partyId: party.id,
              description: descriptionText,
            },
            {
              accountId: cashAccount.id,
              currencyCode,
              direction: cashDirection,
              amount: value.toFixed(),
              description: descriptionText,
            },
          ],
        },
        t,
      );
    });
    await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "PartyLedgerEntry", entityId: String(journal.id), details: req.body });
    res.status(201).json(journal);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "ثبت ناکام شو" });
  }
});

router.put("/:id/ledger/rows/:lineId", requireAuth, requirePermission("accounting.manage"), async (req: AuthedRequest, res) => {
  const party = await Party.findByPk(Number(req.params.id));
  if (!party) {
    res.status(404).json({ error: "Party not found" });
    return;
  }
  const { date, description, currencyCode, entryType, amount } = req.body ?? {};
  if (typeof date !== "string" || typeof currencyCode !== "string" || typeof entryType !== "string" || amount === undefined) {
    res.status(400).json({ error: "تاریخ، پیسې ډول، د ثبت ډول او اندازه اړین دي" });
    return;
  }
  if (entryType !== "money" && entryType !== "receipt") {
    res.status(400).json({ error: "د ثبت ډول باید money یا receipt وي" });
    return;
  }
  try {
    const value = positiveDecimal(amount, "اندازه");
    const journalPartyType = toJournalPartyType(party.type);
    await sequelize.transaction(async (t) => {
      const partyLine = await JournalLine.findByPk(Number(req.params.lineId), { transaction: t });
      if (!partyLine || partyLine.partyId !== party.id || partyLine.partyType !== journalPartyType) {
        throw new Error("د کهاته ریکارډ ونه موندل شو");
      }
      const journal = await JournalTransaction.findByPk(partyLine.transactionId, { transaction: t });
      if (!journal || journal.voidedAt) throw new Error("دا ریکارډ لغوه شوی یا نشته");
      const lines = await JournalLine.findAll({ where: { transactionId: partyLine.transactionId }, transaction: t });
      const counterpartLines = lines.filter((line) => line.id !== partyLine.id);
      if (counterpartLines.length !== 1) {
        throw new Error("دا transaction څو کرښې لري؛ مهرباني وکړئ د اصلي سرچینې له لارې یې اصلاح کړئ");
      }
      const counterpart = counterpartLines[0]!;
      const descriptionText = typeof description === "string" ? description.trim() : "";
      const partyDirection = await ledgerDirectionForPartyEntry(party, entryType, descriptionText, currencyCode, t, partyLine.transactionId);
      journal.transactionDate = date;
      journal.memo = descriptionText;
      await journal.save({ transaction: t });

      partyLine.amount = value.toFixed();
      partyLine.currencyCode = currencyCode;
      partyLine.direction = partyDirection;
      partyLine.description = descriptionText;
      await partyLine.save({ transaction: t });

      counterpart.amount = value.toFixed();
      counterpart.currencyCode = currencyCode;
      counterpart.direction = partyDirection === "debit" ? "credit" : "debit";
      counterpart.description = descriptionText;
      await counterpart.save({ transaction: t });
    });
    await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "PartyLedgerLine", entityId: String(req.params.lineId), details: req.body });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "اصلاح ناکامه شوه" });
  }
});

router.delete("/:id/ledger/rows/:lineId", requireAuth, requirePermission("accounting.manage"), async (req: AuthedRequest, res) => {
  const party = await Party.findByPk(Number(req.params.id));
  if (!party) {
    res.status(404).json({ error: "Party not found" });
    return;
  }
  const reason = typeof req.query.reason === "string" && req.query.reason.trim() ? req.query.reason.trim() : "د کهاته غلط ریکارډ حذف شو";
  try {
    const journalPartyType = toJournalPartyType(party.type);
    let snapshot: unknown = null;
    let displayName = `کهاته ریکارډ ${req.params.lineId}`;
    type LinkedTrashSource =
      | {
          module: "sale";
          sourceId: number;
          snapshot: unknown;
          displayName: string;
          sourcePath: string;
        }
      | {
          module: "sale_receipt";
          sourceId: number;
          saleId: number | null;
          snapshot: unknown;
          displayName: string;
          sourcePath: string;
        };
    let linkedSource: LinkedTrashSource | null = null;
    const linkedDailyCashEntryId = await sequelize.transaction(async (t) => {
      const partyLine = await JournalLine.findByPk(Number(req.params.lineId), { transaction: t });
      if (!partyLine || partyLine.partyId !== party.id || partyLine.partyType !== journalPartyType) {
        throw new Error("د کهاته ریکارډ ونه موندل شو");
      }
      const journal = await JournalTransaction.findByPk(partyLine.transactionId, { transaction: t });
      const source = await PostingLink.findOne({ where: { transactionId: partyLine.transactionId }, transaction: t });
      if (!journal || journal.voidedAt) throw new Error("دا ریکارډ مخکې لغوه شوی یا نشته");
      snapshot = { party: party.toJSON(), line: partyLine.toJSON(), journal: journal.toJSON() };
      displayName = partyLine.description || journal.memo || displayName;
      if (source?.sourceModule === "daily_cash") return source.sourceId;
      if (source?.sourceModule === "sale_receipt") {
        const receipt = await SaleReceipt.findByPk(source.sourceId, { transaction: t });
        linkedSource = {
          module: "sale_receipt",
          sourceId: source.sourceId,
          saleId: receipt?.saleId ?? null,
          snapshot: receipt?.toJSON() ?? null,
          displayName: receipt?.receiptNumber || displayName,
          sourcePath: receipt ? `/sales/${receipt.saleId}` : `/parties/${party.id}`,
        };
        return null;
      }
      if (source?.sourceModule === "sale") {
        const sale = await Sale.findByPk(source.sourceId, { transaction: t });
        linkedSource = {
          module: "sale",
          sourceId: source.sourceId,
          snapshot: sale?.toJSON() ?? null,
          displayName: sale?.saleNumber || sale?.contractNumber || displayName,
          sourcePath: "/sales?customerType=sales_customer&salesDetail=1&allDates=1",
        };
        return null;
      }
      journal.voidedAt = new Date();
      journal.voidedByUserId = req.auth!.userId;
      journal.voidReason = reason;
      await journal.save({ transaction: t });
      return null;
    });
    const sourceToTrash = linkedSource as LinkedTrashSource | null;
    if (sourceToTrash?.module === "sale_receipt") {
      const receipt = await reverseSaleReceipt(sourceToTrash.sourceId, { userId: req.auth!.userId, reason });
      await moveToTrash({
        userId: req.auth!.userId,
        entityType: "SaleReceipt",
        entityId: receipt.id,
        displayName: receipt.receiptNumber || sourceToTrash.displayName,
        sourcePath: sourceToTrash.sourcePath,
        snapshot: sourceToTrash.snapshot ?? receipt.toJSON(),
        reason,
      });
    } else if (sourceToTrash?.module === "sale") {
      const sale = await reverseSale(sourceToTrash.sourceId, { userId: req.auth!.userId, reason });
      await moveToTrash({
        userId: req.auth!.userId,
        entityType: "Sale",
        entityId: sale.id,
        displayName: sale.saleNumber || sourceToTrash.displayName,
        sourcePath: sourceToTrash.sourcePath,
        snapshot: sourceToTrash.snapshot ?? sale.toJSON(),
        reason,
      });
    }
    if (linkedDailyCashEntryId) {
      const entry = await voidDailyCashEntry(linkedDailyCashEntryId, { userId: req.auth!.userId, reason });
      if (!entry.description) entry.description = `DailyCashEntry ${entry.id}`;
      await moveToTrash({
        userId: req.auth!.userId,
        entityType: "DailyCashEntry",
        entityId: entry.id,
        displayName: entry.description || `روزنامچه ${entry.id}`,
        sourcePath: "/journal",
        snapshot: entry.toJSON(),
        reason,
      });
    }
    await moveToTrash({
      userId: req.auth!.userId,
      entityType: "PartyLedgerLine",
      entityId: String(req.params.lineId),
      displayName,
      sourcePath: `/parties/${party.id}`,
      snapshot,
      reason,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "حذف ناکام شو" });
  }
});

export default router;
