import Decimal from "decimal.js";
import type { Transaction } from "sequelize";
import { sequelize } from "./connection";
import {
  Account,
  CashAccount,
  DailyCashEntry,
  Employee,
  EmployeePayment,
  JournalTransaction,
  JournalLine,
  Party,
  PostingLink,
  type DailyCashCategory,
  type DailyCashEntryType,
  type DailyCashTargetType,
  type JournalPartyType,
  type PartyType,
} from "./models";
import { postJournal, PostingError, type PostingLineInput } from "./posting";
import { nextDocumentNumber } from "./numbering";

const CASH_ACCOUNT_CODE = "1000";
const EQUITY_ACCOUNT_CODE = "3000";
const EXPENSE_ACCOUNT_CODE = "5000";
const LABOR_ACCOUNT_CODE = "5100";

const DAILY_CASH_CATEGORIES: DailyCashCategory[] = ["cash_in", "labor", "kitchen", "machinery", "company", "customers", "other"];
const DAILY_CASH_TARGET_TYPES: DailyCashTargetType[] = [
  "supplier",
  "sales_customer",
  "exchange_dealer",
  "market_customer",
  "individual_customer",
  "regular_employee",
  "misc_worker",
  "expense",
  "company",
  "other",
];

export interface CreateDailyCashEntryInput {
  entryDate: string;
  description: string;
  category: DailyCashCategory;
  entryType?: DailyCashEntryType;
  targetType?: DailyCashTargetType | null;
  targetId?: number | null;
  amount: string | number;
  currencyCode: string;
  cashAccountId?: number | null;
  createdByUserId?: number | null;
}

export interface UpdateDailyCashEntryInput extends CreateDailyCashEntryInput {
  reason?: string | null;
}

export interface DailyCashSummary {
  entries: DailyCashEntry[];
  totals: Record<DailyCashCategory | "total_expenses", string>;
  previousDate: string;
  previousDayCount: number;
}

export interface DailyCashDaySummary {
  entryDate: string;
  currencyCode: string;
  transactionCount: number;
  totalIn: string;
  totalOut: string;
  netTotal: string;
  lastDescription: string | null;
}

function exactDecimal(value: string | number | Decimal): string {
  return new Decimal(value).toFixed();
}

function addDecimal(a: string, b: string | number): string {
  return exactDecimal(new Decimal(a || 0).plus(new Decimal(b || 0)));
}

function assertCategory(category: string): asserts category is DailyCashCategory {
  if (!DAILY_CASH_CATEGORIES.includes(category as DailyCashCategory)) {
    throw new PostingError("Invalid daily cash category");
  }
}

function assertEntryType(entryType: string): asserts entryType is DailyCashEntryType {
  if (entryType !== "in" && entryType !== "out") throw new PostingError("د داخل/خارج ډول ناسم دی");
}

function normalizeTargetType(value: unknown): DailyCashTargetType | null {
  if (typeof value === "string" && DAILY_CASH_TARGET_TYPES.includes(value as DailyCashTargetType)) return value as DailyCashTargetType;
  return null;
}

function dailyCashPreviousDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function categoryForInput(entryType: DailyCashEntryType, targetType: DailyCashTargetType | null, category: DailyCashCategory): DailyCashCategory {
  if (entryType === "in") return "cash_in";
  if (targetType === "regular_employee" || targetType === "misc_worker") return "labor";
  if (targetType === "company") return "company";
  if (targetType === "expense") return category === "kitchen" || category === "machinery" || category === "labor" || category === "other" ? category : "other";
  if (
    targetType === "supplier" ||
    targetType === "sales_customer" ||
    targetType === "exchange_dealer" ||
    targetType === "market_customer" ||
    targetType === "individual_customer"
  ) {
    return "customers";
  }
  return category === "cash_in" ? "other" : category;
}

function toJournalPartyType(type: PartyType): JournalPartyType {
  switch (type) {
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

function accountCodeForPartyType(type: PartyType): string {
  if (type === "supplier") return "2000";
  if (type === "partner") return "3000";
  return "1100";
}

function partyTypeForTarget(targetType: DailyCashTargetType): PartyType | null {
  if (targetType === "supplier") return "supplier";
  if (targetType === "sales_customer") return "sales_customer";
  if (targetType === "exchange_dealer") return "exchange_dealer";
  if (targetType === "market_customer") return "market_customer";
  if (targetType === "individual_customer") return "individual_customer";
  return null;
}

async function computePartyLedgerBalance(
  partyType: JournalPartyType,
  partyId: number,
  currencyCode: string,
  transaction: Transaction,
): Promise<Decimal> {
  const lines = await JournalLine.findAll({
    where: { partyType, partyId, currencyCode },
    include: [{ model: JournalTransaction, as: "transaction", where: { voidedAt: null }, required: true }],
    transaction,
  });
  return lines.reduce((balance, line) => {
    const amount = new Decimal(line.amount);
    return line.direction === "debit" ? balance.plus(amount) : balance.minus(amount);
  }, new Decimal(0));
}

function partyBalanceDelta(direction: "debit" | "credit", amount: Decimal): Decimal {
  return direction === "debit" ? amount : amount.negated();
}

function settleOldBalanceFirst(
  previousBalance: Decimal,
  requestedDirection: "debit" | "credit",
  amount: Decimal,
): "debit" | "credit" {
  const requestedNextBalance = previousBalance.plus(partyBalanceDelta(requestedDirection, amount));
  if (previousBalance.lessThan(0) && requestedNextBalance.lessThan(previousBalance)) return "debit";
  if (previousBalance.greaterThan(0) && requestedNextBalance.greaterThan(previousBalance)) return "credit";
  return requestedDirection;
}

async function resolveAccount(code: string, transaction: Transaction): Promise<Account> {
  const account = await Account.findOne({ where: { code }, transaction });
  if (!account) throw new PostingError(`Core account ${code} is missing`);
  return account;
}

function debitAccountForCategory(category: DailyCashCategory): string {
  return category === "labor" ? LABOR_ACCOUNT_CODE : EXPENSE_ACCOUNT_CODE;
}

async function resolveCashAccount(
  currencyCode: string,
  cashAccountId: number | null | undefined,
  transaction: Transaction,
): Promise<Account> {
  if (cashAccountId) {
    const cashAccount = await CashAccount.findByPk(cashAccountId, { transaction });
    if (!cashAccount) throw new PostingError("Cash account not found");
    if (cashAccount.currencyCode !== currencyCode) throw new PostingError("Cash account currency does not match entry currency");
    const linkedAccount = await Account.findByPk(cashAccount.accountId, { transaction });
    if (!linkedAccount) throw new PostingError("Linked cash ledger account not found");
    return linkedAccount;
  }

  const sameCurrencyCash = await CashAccount.findOne({ where: { currencyCode, isActive: true }, transaction });
  if (sameCurrencyCash) {
    const linkedAccount = await Account.findByPk(sameCurrencyCash.accountId, { transaction });
    if (linkedAccount) return linkedAccount;
  }

  return resolveAccount(CASH_ACCOUNT_CODE, transaction);
}

async function resolveTarget(
  targetType: DailyCashTargetType | null,
  targetId: number | null | undefined,
  currencyCode: string,
  transaction: Transaction,
): Promise<
  | { kind: "party"; party: Party; account: Account; journalPartyType: JournalPartyType; targetName: string }
  | { kind: "employee"; employee: Employee; account: Account; targetName: string }
  | { kind: "none"; account: Account; targetName: string | null }
> {
  if (targetType === "regular_employee" || targetType === "misc_worker") {
    if (!targetId) throw new PostingError("کارکوونکی باید انتخاب شي");
    const employee = await Employee.findByPk(targetId, { transaction });
    if (!employee || employee.deletedAt) throw new PostingError("کارکوونکی ونه موندل شو");
    if (targetType === "regular_employee" && employee.workerType !== "regular") throw new PostingError("دا رسمي کارکوونکی نه دی");
    if (targetType === "misc_worker" && employee.workerType !== "misc") throw new PostingError("دا متفرقه کاریګر نه دی");
    if (employee.currencyCode !== currencyCode) {
      throw new PostingError(`د کارکوونکي اسعار ${employee.currencyCode} دي؛ روزنامچه باید هماغه اسعار ولري`);
    }
    return { kind: "employee", employee, account: await resolveAccount(LABOR_ACCOUNT_CODE, transaction), targetName: employee.name };
  }

  const partyType = targetType ? partyTypeForTarget(targetType) : null;
  if (partyType) {
    if (!targetId) throw new PostingError("مشتري/حساب باید انتخاب شي");
    const party = await Party.findByPk(targetId, { transaction });
    if (!party || party.type !== partyType || !party.isActive) throw new PostingError("انتخاب شوی حساب ونه موندل شو");
    return {
      kind: "party",
      party,
      account: await resolveAccount(accountCodeForPartyType(party.type), transaction),
      journalPartyType: toJournalPartyType(party.type),
      targetName: party.name,
    };
  }

  if (targetType === "company") return { kind: "none", account: await resolveAccount(EQUITY_ACCOUNT_CODE, transaction), targetName: "شرکت" };
  return { kind: "none", account: await resolveAccount(debitAccountForCategory(targetType === "expense" ? "other" : "other"), transaction), targetName: null };
}

function dailyCashDescription(input: Pick<CreateDailyCashEntryInput, "description">, targetName: string | null): string {
  return ["د روزنامچې له لارې", input.description.trim(), targetName].filter(Boolean).join(" - ");
}

async function createLinkedEmployeePayment(
  entry: DailyCashEntry,
  employee: Employee,
  amount: Decimal,
  userId: number | null | undefined,
  transaction: Transaction,
): Promise<EmployeePayment> {
  const paymentNumber = await nextDocumentNumber("employee_payment", transaction);
  return EmployeePayment.create(
    {
      paymentNumber,
      employeeId: employee.id,
      paymentDate: entry.entryDate,
      type: "salary",
      amount: exactDecimal(amount),
      previousBalance: null,
      newBalance: null,
      currencyCode: entry.currencyCode,
      method: "cash",
      cashAccountId: null,
      note: dailyCashDescription(entry, entry.targetName ?? employee.name),
      paidByUserId: userId ?? null,
    },
    { transaction },
  );
}

async function voidLinkedEmployeePayment(entry: DailyCashEntry, userId: number, reason: string, transaction: Transaction): Promise<void> {
  if (!entry.linkedEmployeePaymentId) return;
  const payment = await EmployeePayment.findByPk(entry.linkedEmployeePaymentId, { transaction });
  if (!payment || payment.voidedAt) return;
  payment.voidedAt = new Date();
  payment.voidReason = reason;
  await payment.save({ transaction });
}

async function postDailyCashEntry(entry: DailyCashEntry, input: CreateDailyCashEntryInput, amount: Decimal, transaction: Transaction): Promise<void> {
  const requestedEntryType = input.entryType ?? (input.category === "cash_in" ? "in" : "out");
  assertEntryType(requestedEntryType);
  const targetType = normalizeTargetType(input.targetType);
  const target = await resolveTarget(targetType, input.targetId, input.currencyCode, transaction);
  const cashAccount = await resolveCashAccount(input.currencyCode, input.cashAccountId, transaction);
  const amountString = exactDecimal(amount);
  const userDescription = input.description.trim();
  const lineDescription = dailyCashDescription(input, target.targetName);
  let targetDirection: "debit" | "credit" = requestedEntryType === "in" ? "credit" : "debit";
  let partyPreviousBalance: Decimal | null = null;
  if (target.kind === "party") {
    partyPreviousBalance = await computePartyLedgerBalance(target.journalPartyType, target.party.id, input.currencyCode, transaction);
    targetDirection = settleOldBalanceFirst(partyPreviousBalance, targetDirection, amount);
  }
  const cashDirection: "debit" | "credit" = targetDirection === "debit" ? "credit" : "debit";
  const entryType: DailyCashEntryType = cashDirection === "debit" ? "in" : "out";
  const category = categoryForInput(entryType, targetType, input.category);
  const targetLineDescription = target.kind === "party" ? userDescription : lineDescription;

  entry.entryDate = input.entryDate;
  entry.description = userDescription;
  entry.category = category;
  entry.entryType = entryType;
  entry.targetType = targetType;
  entry.targetId = target.kind === "none" ? null : input.targetId ?? null;
  entry.targetName = target.targetName;
  entry.amount = amountString;
  entry.currencyCode = input.currencyCode;
  entry.createdByUserId = input.createdByUserId ?? null;
  entry.linkedEmployeePaymentId = null;

  if (target.kind === "employee" && entryType === "out") {
    const payment = await createLinkedEmployeePayment(entry, target.employee, amount, input.createdByUserId, transaction);
    entry.linkedEmployeePaymentId = payment.id;
  }
  await entry.save({ transaction });

  const targetLine: PostingLineInput = {
    accountId: target.account.id,
    currencyCode: input.currencyCode,
    direction: targetDirection,
    amount: amountString,
    description: targetLineDescription,
  };
  const cashLine: PostingLineInput = {
    accountId: cashAccount.id,
    currencyCode: input.currencyCode,
    direction: cashDirection,
    amount: amountString,
    description: lineDescription,
  };

  const lines: PostingLineInput[] =
    target.kind === "party"
      ? [{ ...targetLine, partyType: target.journalPartyType, partyId: target.party.id }, cashLine]
      : target.kind === "employee"
        ? [{ ...targetLine, partyType: "employee" as const, partyId: target.employee.id }, cashLine]
        : [targetLine, cashLine];

  const journal = await postJournal(
    {
      transactionDate: input.entryDate,
      memo: lineDescription,
      isManual: true,
      createdByUserId: input.createdByUserId ?? null,
      source: { module: "daily_cash", sourceId: entry.id, postingType: "daily_cash" },
      lines,
    },
    transaction,
  );

  entry.journalTransactionId = journal.id;
  await entry.save({ transaction });
}

async function reverseDailyCashEntryPosting(
  entry: DailyCashEntry,
  params: { userId: number; reason: string },
  transaction: Transaction,
): Promise<PostingLink> {
  const link = await PostingLink.findOne({
    where: { sourceModule: "daily_cash", sourceId: entry.id, postingType: "daily_cash" },
    transaction,
  });
  if (!link) throw new PostingError("No posting found for this daily cash entry");
  const journal = await JournalTransaction.findByPk(link.transactionId, { transaction });
  if (!journal) throw new PostingError("Daily cash journal transaction not found");
  if (!journal.voidedAt) {
    journal.voidedAt = new Date();
    journal.voidedByUserId = params.userId;
    journal.voidReason = params.reason;
    await journal.save({ transaction });
  }
  return link;
}

export async function listDailyCashEntries(params: { entryDate: string; currencyCode: string }): Promise<DailyCashSummary> {
  const entries = await DailyCashEntry.findAll({
    where: { entryDate: params.entryDate, currencyCode: params.currencyCode, voidedAt: null },
    include: [{ model: JournalTransaction, as: "journalTransaction", where: { voidedAt: null }, required: true, attributes: [] }],
    order: [["id", "ASC"]],
  });
  const previousDate = dailyCashPreviousDate(params.entryDate);
  const previousDayCount = await DailyCashEntry.count({
    where: { entryDate: previousDate, voidedAt: null },
    include: [{ model: JournalTransaction, as: "journalTransaction", where: { voidedAt: null }, required: true, attributes: [] }],
  });

  const totals: Record<DailyCashCategory | "total_expenses", string> = {
    cash_in: "0",
    labor: "0",
    kitchen: "0",
    machinery: "0",
    company: "0",
    customers: "0",
    other: "0",
    total_expenses: "0",
  };

  for (const entry of entries) {
    totals[entry.category] = addDecimal(totals[entry.category], entry.amount);
    if ((entry.entryType ?? (entry.category === "cash_in" ? "in" : "out")) === "out") {
      totals.total_expenses = addDecimal(totals.total_expenses, entry.amount);
    }
  }

  return { entries, totals, previousDate, previousDayCount };
}

export async function listDailyCashDaySummaries(params: { currencyCode: string; limit?: number }): Promise<DailyCashDaySummary[]> {
  const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100000) : undefined;
  const entries = await DailyCashEntry.findAll({
    where: { currencyCode: params.currencyCode, voidedAt: null },
    include: [{ model: JournalTransaction, as: "journalTransaction", where: { voidedAt: null }, required: true, attributes: [] }],
    order: [["entryDate", "DESC"], ["id", "DESC"]],
    ...(limit ? { limit } : {}),
  });
  const byDate = new Map<string, DailyCashDaySummary>();
  for (const entry of entries) {
    const summary = byDate.get(entry.entryDate) ?? {
      entryDate: entry.entryDate,
      currencyCode: entry.currencyCode,
      transactionCount: 0,
      totalIn: "0",
      totalOut: "0",
      netTotal: "0",
      lastDescription: null,
    };
    const entryType = entry.entryType ?? (entry.category === "cash_in" ? "in" : "out");
    summary.transactionCount += 1;
    if (!summary.lastDescription) summary.lastDescription = entry.description;
    if (entryType === "in") summary.totalIn = addDecimal(summary.totalIn, entry.amount);
    else summary.totalOut = addDecimal(summary.totalOut, entry.amount);
    summary.netTotal = exactDecimal(new Decimal(summary.totalIn).minus(summary.totalOut));
    byDate.set(entry.entryDate, summary);
  }
  return Array.from(byDate.values()).sort((a, b) => b.entryDate.localeCompare(a.entryDate));
}

export async function createDailyCashEntry(input: CreateDailyCashEntryInput): Promise<DailyCashEntry> {
  assertCategory(input.category);
  const amount = new Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) throw new PostingError("Amount must be greater than zero");
  if (!input.description.trim()) throw new PostingError("Description is required");

  return sequelize.transaction(async (t) => {
    const entryType = input.entryType ?? (input.category === "cash_in" ? "in" : "out");
    assertEntryType(entryType);
    const entry = await DailyCashEntry.create(
      {
        entryDate: input.entryDate,
        description: input.description.trim(),
        category: categoryForInput(entryType, normalizeTargetType(input.targetType), input.category),
        entryType,
        targetType: normalizeTargetType(input.targetType),
        targetId: null,
        targetName: null,
        amount: exactDecimal(amount),
        currencyCode: input.currencyCode,
        journalTransactionId: null,
        linkedEmployeePaymentId: null,
        createdByUserId: input.createdByUserId ?? null,
      },
      { transaction: t },
    );

    await postDailyCashEntry(entry, input, amount, t);
    return entry;
  });
}

export async function updateDailyCashEntry(entryId: number, input: UpdateDailyCashEntryInput): Promise<DailyCashEntry> {
  assertCategory(input.category);
  const amount = new Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) throw new PostingError("Amount must be greater than zero");
  if (!input.description.trim()) throw new PostingError("Description is required");

  const entry = await DailyCashEntry.findByPk(entryId);
  if (!entry) throw new PostingError("Daily cash entry not found");
  if (entry.voidedAt) throw new PostingError("Daily cash entry is voided");

  return sequelize.transaction(async (t) => {
    const reason = input.reason?.trim() || "د روزنامچې اصلاح";
    const link = await reverseDailyCashEntryPosting(entry, { userId: input.createdByUserId ?? 0, reason }, t);
    await link.destroy({ transaction: t });
    await voidLinkedEmployeePayment(entry, input.createdByUserId ?? 0, reason, t);
    await postDailyCashEntry(entry, input, amount, t);
    return entry;
  });
}

export async function voidDailyCashEntry(entryId: number, params: { userId: number; reason: string }): Promise<DailyCashEntry> {
  const entry = await DailyCashEntry.findByPk(entryId);
  if (!entry) throw new PostingError("Daily cash entry not found");
  if (entry.voidedAt) throw new PostingError("Daily cash entry is already voided");

  return sequelize.transaction(async (t) => {
    await reverseDailyCashEntryPosting(entry, params, t);
    await voidLinkedEmployeePayment(entry, params.userId, params.reason, t);
    entry.voidedAt = new Date();
    entry.voidedByUserId = params.userId;
    entry.voidReason = params.reason;
    await entry.save({ transaction: t });
    return entry;
  });
}
