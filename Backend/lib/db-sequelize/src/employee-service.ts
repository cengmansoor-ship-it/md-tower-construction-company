import Decimal from "decimal.js";
import type { Transaction } from "sequelize";
import { sequelize } from "./connection";
import { Employee, Attendance, EmployeePayment, EmployeeWorkPeriod, CashAccount, Account, PostingLink } from "./models";
import { postJournal, reverseJournal, PostingError } from "./posting";
import { nextDocumentNumber } from "./numbering";

const SALARY_EXPENSE_ACCOUNT_CODE = "5100";
const PAYABLE_DECIMAL_PLACES = 6;

const INPUT_SEPARATOR_PATTERN = /[,\u060C\u066C'\u00A0\u2009\u202F_ \t]/g;
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function parseDecimalInput(value: string | number, fieldLabel: string): Decimal {
  if (typeof value === "number") {
    const num = new Decimal(value);
    if (num.isFinite()) return num;
    throw new PostingError(`${fieldLabel} سم نه ده`);
  }
  const original = String(value).trim();
  if (!original) throw new PostingError(`${fieldLabel} اړین ده`);
  const cleaned = original
    .replace(/[۰-۹]/g, (ch) => String(PERSIAN_DIGITS.indexOf(ch)))
    .replace(/[٠-٩]/g, (ch) => String(ARABIC_DIGITS.indexOf(ch)))
    .replace(/[٫]/g, ".")
    .replace(INPUT_SEPARATOR_PATTERN, "");
  if (!/^[+-]?\d*\.?\d+$/.test(cleaned) && !/^[+-]?\d+\.?\d*$/.test(cleaned)) {
    throw new PostingError(`${fieldLabel} سم نه ده: "${original}"`);
  }
  return new Decimal(cleaned);
}

export interface CreateEmployeeInput {
  name: string;
  fatherName?: string | null;
  phone?: string | null;
  position: string;
  wageType: "daily" | "monthly";
  wageAmount: string | number;
  currencyCode: string;
  startDate: string;
  endDate?: string | null;
  workerType?: "regular" | "misc";
  notes?: string | null;
  createdByUserId?: number | null;
}

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const wageAmount = parseDecimalInput(input.wageAmount, "معاش");
  if (wageAmount.lessThanOrEqualTo(0)) throw new PostingError("Wage amount must be greater than zero");

  return sequelize.transaction(async (t) => {
    const employeeNumber = await nextDocumentNumber("employee", t);
    return Employee.create(
      {
        employeeNumber,
        name: input.name,
        fatherName: input.fatherName ?? null,
        phone: input.phone ?? null,
        position: input.position,
        wageType: input.wageType,
        wageAmount: wageAmount.toFixed(),
        currencyCode: input.currencyCode,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        workerType: input.workerType ?? "regular",
        status: input.workerType === "misc" && input.endDate ? "inactive" : "active",
        notes: input.notes ?? null,
        createdByUserId: input.createdByUserId ?? null,
      },
      { transaction: t },
    );
  });
}

export interface RecordAttendanceInput {
  employeeId: number;
  date: string;
  status: "present" | "absent" | "leave" | "half_day";
  notes?: string | null;
  createdByUserId?: number | null;
}

function roundedPayable(value: Decimal): string {
  return value.toDecimalPlaces(PAYABLE_DECIMAL_PLACES, Decimal.ROUND_HALF_UP).toFixed();
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10))) return null;
  const datePart = value.slice(0, 10);
  const date = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== datePart) return null;
  return date;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = parseIsoDate(value);
  if (!date) throw new PostingError("Date is invalid");
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function maxIsoDate(a: string, b: string): string {
  return a >= b ? a : b;
}

function minIsoDate(a: string, b: string): string {
  return a <= b ? a : b;
}

function exclusiveDays(startValue: string, endValue: string): number {
  const start = parseIsoDate(startValue);
  const end = parseIsoDate(endValue);
  if (!start || !end || start.getTime() >= end.getTime()) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

function dateInRange(date: string, range?: EmployeeLedgerRange): boolean {
  if (range?.startDate && date < range.startDate) return false;
  if (range?.endDate && date > range.endDate) return false;
  return true;
}

function earnedForPeriod(startDate: string, exclusiveEndDate: string, wageAmount: string, range?: EmployeeLedgerRange): Decimal {
  const from = range?.startDate ? maxIsoDate(startDate, range.startDate) : startDate;
  const rangeExclusiveEnd = range?.endDate ? addDays(range.endDate, 1) : undefined;
  const to = rangeExclusiveEnd ? minIsoDate(exclusiveEndDate, rangeExclusiveEnd) : exclusiveEndDate;
  const days = exclusiveDays(from, to);
  if (days <= 0) return new Decimal(0);
  return new Decimal(wageAmount).times(days);
}

function inclusiveIsoDateRange(startValue: string, endValue: string): string[] {
  const start = parseIsoDate(startValue);
  const end = parseIsoDate(endValue);
  if (!start || !end || start.getTime() > end.getTime()) return [];

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(isoDate(cursor));
    if (dates.length > 3700) throw new PostingError("د حاضري د پخواني حساب موده ډېره اوږده ده");
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function attendancePayableAmount(employee: Employee, date: string, status: RecordAttendanceInput["status"]): string {
  const wage = new Decimal(employee.wageAmount);
  const dailyWage = employee.wageType === "monthly" ? wage.dividedBy(30) : wage;
  let payable = new Decimal(0);
  if (status === "present" || status === "leave") payable = dailyWage;
  else if (status === "half_day") payable = dailyWage.dividedBy(2);
  return roundedPayable(payable);
}

async function upsertAttendance(
  employee: Employee,
  input: RecordAttendanceInput,
  status: RecordAttendanceInput["status"],
  notes: string | null,
  t?: Transaction,
): Promise<Attendance> {
  const payableAmount = attendancePayableAmount(employee, input.date, status);
  const existing = await Attendance.findOne({ where: { employeeId: input.employeeId, date: input.date }, transaction: t });
  if (existing) {
    existing.status = status;
    existing.payableAmount = payableAmount;
    existing.currencyCode = employee.currencyCode;
    existing.notes = notes;
    if (!existing.createdByUserId && input.createdByUserId) existing.createdByUserId = input.createdByUserId;
    await existing.save({ transaction: t });
    return existing;
  }

  return Attendance.create(
    {
      employeeId: input.employeeId,
      date: input.date,
      status,
      payableAmount,
      currencyCode: employee.currencyCode,
      notes,
      createdByUserId: input.createdByUserId ?? null,
    },
    { transaction: t },
  );
}

function miscEarnedForRange(employee: Employee, range?: EmployeeLedgerRange): Decimal {
  const exclusiveEndDate = employee.endDate ?? addDays(range?.endDate ?? todayIsoDate(), 1);
  return earnedForPeriod(employee.startDate, exclusiveEndDate, employee.wageAmount, range);
}

function workPeriodEarnedForRange(period: EmployeeWorkPeriod, range?: EmployeeLedgerRange): Decimal {
  if (period.workerType !== "misc") return new Decimal(0);
  return earnedForPeriod(period.startDate, period.endDate, period.wageAmount, range);
}

/**
 * Records one attendance entry for an employee/date. Monthly wages always use a fixed
 * 30-day divisor; present/leave earn one day, half_day earns half, and absent earns zero.
 * No journal entry is posted here; payout is handled by EmployeePayment.
 */
export async function recordAttendance(input: RecordAttendanceInput): Promise<Attendance> {
  const employee = await Employee.findByPk(input.employeeId);
  if (!employee) throw new PostingError("Employee not found");
  if (employee.workerType === "misc") throw new PostingError("متفرقه کاریګر د حاضري له لارې نه حسابېږي");
  if (employee.endDate && input.date >= employee.endDate) {
    throw new PostingError("ددې کارکوونکي کهاته بنده ده، نور حاضري نشي ثبتېدای");
  }

  return sequelize.transaction(async (t) => {
    const existingAttendanceCount = await Attendance.count({ where: { employeeId: input.employeeId }, transaction: t });
    const shouldBringPreviousDays = existingAttendanceCount === 0 && employee.startDate < input.date;

    if (shouldBringPreviousDays) {
      const previousDates = inclusiveIsoDateRange(employee.startDate, addDays(input.date, -1));
      for (const date of previousDates) {
        await upsertAttendance(
          employee,
          { ...input, date },
          "present",
          "پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو",
          t,
        );
      }
    }

    return upsertAttendance(employee, input, input.status, input.notes ?? null, t);
  });
}

export interface EmployeeLedgerRange {
  startDate?: string;
  endDate?: string;
}

async function computeLedgerTotals(
  employee: Employee,
  t?: Transaction,
  range?: EmployeeLedgerRange,
): Promise<{ previousBalance: Decimal; earned: Decimal; paid: Decimal; repaid: Decimal; balance: Decimal }> {
  const attendances = await Attendance.findAll({ where: { employeeId: employee.id }, transaction: t });
  const payments = await EmployeePayment.findAll({ where: { employeeId: employee.id, voidedAt: null }, transaction: t });
  const workPeriods = await EmployeeWorkPeriod.findAll({ where: { employeeId: employee.id }, transaction: t });
  const isMisc = employee.workerType === "misc";
  const previousRange = range?.startDate ? { endDate: addDays(range.startDate, -1) } : undefined;
  const previousPeriodEarned = previousRange
    ? workPeriods.reduce((sum, period) => sum.plus(workPeriodEarnedForRange(period, previousRange)), new Decimal(0))
    : new Decimal(0);
  const periodEarned = workPeriods.reduce((sum, period) => sum.plus(workPeriodEarnedForRange(period, range)), new Decimal(0));
  const previousEarned = isMisc
    ? previousRange
      ? previousPeriodEarned.plus(miscEarnedForRange(employee, previousRange))
      : new Decimal(0)
    : attendances
        .filter((a) => (range?.startDate ? a.date < range.startDate : false))
        .reduce((sum, a) => sum.plus(new Decimal(a.payableAmount)), new Decimal(0));
  const previousPaid = payments
    .filter((p) => p.type !== "debt_repayment")
    .filter((p) => (range?.startDate ? p.paymentDate < range.startDate : false))
    .reduce((sum, p) => sum.plus(new Decimal(p.amount)), new Decimal(0));
  const previousRepaid = payments
    .filter((p) => p.type === "debt_repayment")
    .filter((p) => (range?.startDate ? p.paymentDate < range.startDate : false))
    .reduce((sum, p) => sum.plus(new Decimal(p.amount)), new Decimal(0));
  const earned = isMisc
    ? periodEarned.plus(miscEarnedForRange(employee, range))
    : attendances.filter((a) => dateInRange(a.date, range)).reduce((sum, a) => sum.plus(new Decimal(a.payableAmount)), new Decimal(0));
  const paid = payments
    .filter((p) => p.type !== "debt_repayment")
    .filter((p) => dateInRange(p.paymentDate, range))
    .reduce((sum, p) => sum.plus(new Decimal(p.amount)), new Decimal(0));
  const repaid = payments
    .filter((p) => p.type === "debt_repayment")
    .filter((p) => dateInRange(p.paymentDate, range))
    .reduce((sum, p) => sum.plus(new Decimal(p.amount)), new Decimal(0));
  const previousBalance = previousEarned.minus(previousPaid).plus(previousRepaid);
  return { previousBalance, earned, paid, repaid, balance: previousBalance.plus(earned).minus(paid).plus(repaid) };
}

/** Balance owed to the employee = total earned from attendance - total non-voided payments made. */
async function computeBalance(employee: Employee, t?: Transaction): Promise<Decimal> {
  return (await computeLedgerTotals(employee, t)).balance;
}

export async function getEmployeeBalance(employee: Employee): Promise<string> {
  const balance = await computeBalance(employee);
  return balance.toFixed();
}

export async function getEmployeeLedgerTotals(
  employee: Employee,
  range?: EmployeeLedgerRange,
): Promise<{ previousBalance: string; earnedTotal: string; paidTotal: string; repaidTotal: string; balance: string }> {
  const totals = await computeLedgerTotals(employee, undefined, range);
  return {
    previousBalance: totals.previousBalance.toFixed(),
    earnedTotal: totals.earned.toFixed(),
    paidTotal: totals.paid.toFixed(),
    repaidTotal: totals.repaid.toFixed(),
    balance: totals.balance.toFixed(),
  };
}

export interface AddEmployeePaymentInput {
  employeeId: number;
  amount: string | number;
  type: "salary" | "advance" | "debt_repayment";
  currencyCode: string;
  paymentDate: string;
  method?: string;
  cashAccountId?: number | null;
  note?: string | null;
  paidByUserId?: number | null;
}

async function applyEmployeePayment(employee: Employee, input: AddEmployeePaymentInput, t: Transaction): Promise<EmployeePayment> {
  if (employee.currencyCode !== input.currencyCode) {
    throw new PostingError(`Employee is paid in ${employee.currencyCode}; payment must use the same currency`);
  }
  const amount = parseDecimalInput(input.amount, "د تادیې اندازه");
  if (amount.lessThanOrEqualTo(0)) throw new PostingError("Payment amount must be greater than zero");

  const balance = await computeBalance(employee, t);

  const isDebtRepayment = input.type === "debt_repayment";
  if (isDebtRepayment) {
    if (balance.greaterThanOrEqualTo(0)) {
      throw new PostingError("کارمند اوس قرضدار نه دی؛ د قرضداري تادیه اړتیا نه لري");
    }
    if (amount.greaterThan(balance.abs())) {
      throw new PostingError(`د قرضداري تادیه له الباقي قرضدارۍ (${balance.abs().toFixed()}) نه زیاته نه شي کېدای`);
    }
  }

  let cashAccount: CashAccount | null = null;
  if (input.cashAccountId) {
    cashAccount = await CashAccount.findByPk(input.cashAccountId, { transaction: t });
    if (!cashAccount) throw new PostingError("Cash account not found");
    if (cashAccount.currencyCode !== input.currencyCode) {
      throw new PostingError("Cash account currency does not match payment currency");
    }
  }

  const paymentNumber = await nextDocumentNumber("employee_payment", t);
  const payment = await EmployeePayment.create(
    {
      paymentNumber,
      employeeId: employee.id,
      paymentDate: input.paymentDate,
      type: input.type,
      amount: amount.toFixed(),
      previousBalance: balance.toFixed(),
      newBalance: isDebtRepayment ? balance.plus(amount).toFixed() : balance.minus(amount).toFixed(),
      currencyCode: input.currencyCode,
      method: input.method ?? "cash",
      cashAccountId: input.cashAccountId ?? null,
      note: input.note ?? null,
      paidByUserId: input.paidByUserId ?? null,
    },
    { transaction: t },
  );

  await postEmployeePaymentJournal(employee, payment, cashAccount, t);

  return payment;
}

async function postEmployeePaymentJournal(
  employee: Employee,
  payment: EmployeePayment,
  cashAccount: CashAccount | null,
  t: Transaction,
): Promise<void> {
  const isDebtRepayment = payment.type === "debt_repayment";
  const amount = new Decimal(payment.amount);
  const paymentNumber = payment.paymentNumber;
  const salaryAccount = await Account.findOne({ where: { code: SALARY_EXPENSE_ACCOUNT_CODE }, transaction: t });
  const cashLedgerAccount =
    cashAccount != null
      ? await Account.findByPk(cashAccount.accountId, { transaction: t })
      : await Account.findOne({ where: { code: "1000" }, transaction: t });
  if (!salaryAccount || !cashLedgerAccount) throw new PostingError("Core accounts are missing");

  if (isDebtRepayment) {
    await postJournal(
      {
        transactionDate: payment.paymentDate,
        memo: `د قرضداري تادیه ${paymentNumber} د ${employee.name} لخوا`,
        isManual: false,
        createdByUserId: payment.paidByUserId ?? null,
        source: { module: "employee_payment", sourceId: payment.id, postingType: "employee_payment" },
        lines: [
          {
            accountId: cashLedgerAccount.id,
            currencyCode: payment.currencyCode,
            direction: "debit",
            amount: amount.toFixed(),
            description: `د قرضداري تادیه ${paymentNumber} نغدي اخیستل`,
          },
          {
            accountId: salaryAccount.id,
            currencyCode: payment.currencyCode,
            direction: "credit",
            amount: amount.toFixed(),
            partyType: "employee",
            partyId: employee.id,
            description: `د قرضداري تادیه ${paymentNumber} د ${employee.name} لخوا`,
          },
        ],
      },
      t,
    );
  } else {
    await postJournal(
      {
        transactionDate: payment.paymentDate,
        memo: `${payment.type === "advance" ? "پیشکي" : "معاش"} تادیه ${paymentNumber} ${employee.name} ته`,
        isManual: false,
        createdByUserId: payment.paidByUserId ?? null,
        source: { module: "employee_payment", sourceId: payment.id, postingType: "employee_payment" },
        lines: [
          {
            accountId: salaryAccount.id,
            currencyCode: payment.currencyCode,
            direction: "debit",
            amount: amount.toFixed(),
            partyType: "employee",
            partyId: employee.id,
            description: `تادیه ${paymentNumber} ${employee.name} ته`,
          },
          {
            accountId: cashLedgerAccount.id,
            currencyCode: payment.currencyCode,
            direction: "credit",
            amount: amount.toFixed(),
            description: `تادیه ${paymentNumber} نغدي ورکړه`,
          },
        ],
      },
      t,
    );
  }
}

async function recomputePaymentChain(employee: Employee, t: Transaction): Promise<void> {
  const totals = await computeLedgerTotals(employee, t);
  const earned = totals.balance.plus(totals.paid).minus(totals.repaid);
  const payments = await EmployeePayment.findAll({
    where: { employeeId: employee.id, voidedAt: null },
    order: [
      ["paymentDate", "ASC"],
      ["id", "ASC"],
    ],
    transaction: t,
  });
  let runningPaid = new Decimal(0);
  let runningRepaid = new Decimal(0);
  for (const p of payments) {
    const amt = new Decimal(p.amount);
    const prev = earned.minus(runningPaid).plus(runningRepaid);
    p.previousBalance = prev.toFixed();
    p.newBalance = p.type === "debt_repayment" ? prev.plus(amt).toFixed() : prev.minus(amt).toFixed();
    if (p.type === "debt_repayment") runningRepaid = runningRepaid.plus(amt);
    else runningPaid = runningPaid.plus(amt);
    await p.save({ transaction: t });
  }
}

export async function addEmployeePayment(input: AddEmployeePaymentInput): Promise<EmployeePayment> {
  const employee = await Employee.findByPk(input.employeeId);
  if (!employee) throw new PostingError("Employee not found");

  return sequelize.transaction((t) => applyEmployeePayment(employee, input, t));
}

export interface EditEmployeePaymentInput {
  employeeId: number;
  amount: string | number;
  type: "salary" | "advance" | "debt_repayment";
  paymentDate: string;
  note?: string | null;
  userId: number;
}

/**
 * Edits a posted payment in place: the original journal entry is reversed, the same
 * payment row is updated with the corrected values, and a fresh journal entry is
 * posted against the same payment id. Running balances of this employee's payments
 * are recomputed so the ledger stays consistent.
 */
export async function editEmployeePayment(paymentId: number, input: EditEmployeePaymentInput): Promise<EmployeePayment> {
  const payment = await EmployeePayment.findByPk(paymentId);
  if (!payment) throw new PostingError("Payment not found");
  if (payment.voidedAt) throw new PostingError("دا رسیدګي مخکې لغوه شوې ده");
  if (payment.employeeId !== input.employeeId) throw new PostingError("Payment does not belong to this employee");

  const employee = await Employee.findByPk(payment.employeeId);
  if (!employee) throw new PostingError("Employee not found");

  const amount = parseDecimalInput(input.amount, "د تادیې اندازه");
  if (amount.lessThanOrEqualTo(0)) throw new PostingError("Payment amount must be greater than zero");

  const unchanged =
    amount.equals(new Decimal(payment.amount)) &&
    input.type === payment.type &&
    input.paymentDate === payment.paymentDate &&
    (input.note ?? null) === (payment.note ?? null);
  if (unchanged) return payment;

  return sequelize.transaction(async (t) => {
    const currentBalance = await computeBalance(employee, t);
    const balanceWithoutThis = payment.type === "debt_repayment"
      ? currentBalance.minus(new Decimal(payment.amount))
      : currentBalance.plus(new Decimal(payment.amount));

    if (input.type === "debt_repayment") {
      if (balanceWithoutThis.greaterThanOrEqualTo(0)) {
        throw new PostingError("کارمند اوس قرضدار نه دی؛ د قرضداري تادیه اړتیا نه لري");
      }
      if (amount.greaterThan(balanceWithoutThis.abs())) {
        throw new PostingError(`د قرضداري تادیه له الباقي قرضدارۍ (${balanceWithoutThis.abs().toFixed()}) نه زیاته نه شي کېدای`);
      }
    }

    const link = await PostingLink.findOne({
      where: { sourceModule: "employee_payment", sourceId: payment.id, postingType: "employee_payment" },
      transaction: t,
    });
    if (!link) throw new PostingError("د دې رسیدګي لپاره هیڅ ریکارډ ونه موندل شو");

    await reverseJournal(link.transactionId, { userId: input.userId, reason: "د رسیدګي تصحیح" }, t);
    await link.destroy({ transaction: t });

    let cashAccount: CashAccount | null = null;
    if (payment.cashAccountId) {
      cashAccount = await CashAccount.findByPk(payment.cashAccountId, { transaction: t });
    }

    payment.amount = amount.toFixed();
    payment.type = input.type;
    payment.paymentDate = input.paymentDate;
    payment.note = input.note ?? null;
    await payment.save({ transaction: t });

    await postEmployeePaymentJournal(employee, payment, cashAccount, t);
    await recomputePaymentChain(employee, t);

    return payment;
  });
}

export async function voidEmployeePayment(
  paymentId: number,
  params: { employeeId: number; userId: number; reason: string },
): Promise<EmployeePayment> {
  const payment = await EmployeePayment.findByPk(paymentId);
  if (!payment) throw new PostingError("Payment not found");
  if (payment.voidedAt) throw new PostingError("دا رسیدګي مخکې لغوه شوې ده");
  if (payment.employeeId !== params.employeeId) throw new PostingError("Payment does not belong to this employee");

  const link = await PostingLink.findOne({ where: { sourceModule: "employee_payment", sourceId: payment.id, postingType: "employee_payment" } });
  if (!link) throw new PostingError("د دې رسیدګي لپاره هیڅ ریکارډ ونه موندل شو");

  return sequelize.transaction(async (t) => {
    await reverseJournal(link.transactionId, { userId: params.userId, reason: params.reason }, t);
    payment.voidedAt = new Date();
    payment.voidReason = params.reason;
    await payment.save({ transaction: t });
    return payment;
  });
}
