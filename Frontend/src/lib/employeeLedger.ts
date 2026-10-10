import { gregorianToJalali, jalaliToGregorian, daysInJalaliMonth } from "./jalali";
import type { Attendance, EmployeePayment } from "./api";

export function decimalToScaled(value: string | number | null | undefined): { amount: bigint; scale: number } {
  const clean = String(value ?? "0").trim() || "0";
  const negative = clean.startsWith("-");
  const unsigned = negative ? clean.slice(1) : clean;
  const [wholeRaw, fractionRaw = ""] = unsigned.split(".");
  const fraction = fractionRaw.replace(/[^0-9]/g, "");
  const digits = `${wholeRaw || "0"}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  return { amount: (negative ? -1n : 1n) * BigInt(digits), scale: fraction.length };
}

export function scaledToDecimal(value: bigint, scale: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  if (scale === 0) return `${negative ? "-" : ""}${absolute.toString()}`;
  const padded = absolute.toString().padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale) || "0";
  const fraction = padded.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function addDecimal(a: string | number | null | undefined, b: string | number | null | undefined): string {
  const left = decimalToScaled(a);
  const right = decimalToScaled(b);
  const scale = Math.max(left.scale, right.scale);
  const value = left.amount * 10n ** BigInt(scale - left.scale) + right.amount * 10n ** BigInt(scale - right.scale);
  return scaledToDecimal(value, scale);
}

export function subtractDecimal(a: string | number | null | undefined, b: string | number | null | undefined): string {
  return addDecimal(a, negateDecimal(b));
}

export function negateDecimal(value: string | number | null | undefined): string {
  const scaled = decimalToScaled(value);
  return scaledToDecimal(-scaled.amount, scaled.scale);
}

export function compareDecimal(a: string | number | null | undefined, b: string | number | null | undefined): number {
  const left = decimalToScaled(a);
  const right = decimalToScaled(b);
  const scale = Math.max(left.scale, right.scale);
  const leftAmount = left.amount * 10n ** BigInt(scale - left.scale);
  const rightAmount = right.amount * 10n ** BigInt(scale - right.scale);
  return leftAmount === rightAmount ? 0 : leftAmount > rightAmount ? 1 : -1;
}

export function decimalSign(value: string | number | null | undefined): -1 | 0 | 1 {
  const comparison = compareDecimal(value, "0");
  return comparison > 0 ? 1 : comparison < 0 ? -1 : 0;
}

export function absDecimal(value: string | number | null | undefined): string {
  const scaled = decimalToScaled(value);
  return scaledToDecimal(scaled.amount < 0n ? -scaled.amount : scaled.amount, scaled.scale);
}

export interface JalaliMonth {
  jy: number;
  jm: number;
}

export function isoToJalaliMonth(iso: string | null | undefined): JalaliMonth {
  const datePart = (iso ?? "").slice(0, 10);
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return { jy: 0, jm: 0 };
  const { jy, jm } = gregorianToJalali(y, m, d);
  return { jy, jm };
}

export function monthKey(jy: number, jm: number): string {
  return `${jy}-${String(jm).padStart(2, "0")}`;
}

export function compareMonthKey(a: string, b: string): number {
  return a === b ? 0 : a > b ? 1 : -1;
}

export function shiftMonth(jy: number, jm: number, delta: number): JalaliMonth {
  const total = jy * 12 + (jm - 1) + delta;
  const year = Math.floor(total / 12);
  return { jy: year, jm: total - year * 12 + 1 };
}

export function currentJalaliMonth(): JalaliMonth {
  const now = new Date();
  const { jy, jm } = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return { jy, jm };
}

export function jalaliMonthStartIso(jy: number, jm: number): string {
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, 1);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

export function jalaliMonthEndIso(jy: number, jm: number): string {
  const days = daysInJalaliMonth(jy, jm);
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, days);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

export function jalaliDateToIso(jy: number, jm: number, jd: number): string {
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

export function addIsoDays(iso: string, days: number): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function jalaliWeekStart(iso: string): string {
  const datePart = iso.slice(0, 10);
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return datePart;
  const { jy, jm, jd } = gregorianToJalali(y, m, d);
  const offset = (jd - 1) % 7;
  return jalaliDateToIso(jy, jm, jd - offset);
}

export interface MonthlyLedgerRow {
  jy: number;
  jm: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  halfDays: number;
  earned: string;
  paid: string;
  repaid: string;
  net: string;
  running: string;
}

function latestDataMonth(attendances: Attendance[] | undefined, payments: EmployeePayment[] | undefined): JalaliMonth | null {
  let latest: JalaliMonth | null = null;
  const consider = (iso: string | null | undefined) => {
    const month = isoToJalaliMonth(iso);
    if (month.jy === 0) return;
    if (!latest || compareMonthKey(monthKey(month.jy, month.jm), monthKey(latest.jy, latest.jm)) > 0) latest = month;
  };
  for (const a of attendances ?? []) consider(a.date);
  for (const p of payments ?? []) consider(p.paymentDate);
  return latest;
}

/**
 * Builds the fixed monthly (کهاته) rows for an employee. Rows are derived only from
 * stored attendance/payment records grouped by Jalali month, so the accounts stay
 * stable even when the computer date is moved forward.
 */
export function buildMonthlyLedger(
  attendances: Attendance[] | undefined,
  payments: EmployeePayment[] | undefined,
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  todayIso: string,
): MonthlyLedgerRow[] {
  const start = isoToJalaliMonth(startIso);
  if (start.jy === 0) return [];

  const endCandidate = endIso ? isoToJalaliMonth(endIso) : isoToJalaliMonth(todayIso);
  const latest = latestDataMonth(attendances, payments);
  let end = endCandidate;
  if (latest && compareMonthKey(monthKey(latest.jy, latest.jm), monthKey(end.jy, end.jm)) > 0) end = latest;
  if (end.jy === 0) return [];

  const rows: MonthlyLedgerRow[] = [];
  const byKey = new Map<string, MonthlyLedgerRow>();
  let cursor: JalaliMonth = { ...start };
  while (compareMonthKey(monthKey(cursor.jy, cursor.jm), monthKey(end.jy, end.jm)) <= 0) {
    const row: MonthlyLedgerRow = {
      jy: cursor.jy,
      jm: cursor.jm,
      presentDays: 0,
      absentDays: 0,
      leaveDays: 0,
      halfDays: 0,
      earned: "0",
      paid: "0",
      repaid: "0",
      net: "0",
      running: "0",
    };
    rows.push(row);
    byKey.set(monthKey(cursor.jy, cursor.jm), row);
    cursor = shiftMonth(cursor.jy, cursor.jm, 1);
    if (rows.length > 600) break;
  }

  for (const a of attendances ?? []) {
    const month = isoToJalaliMonth(a.date);
    const target = byKey.get(monthKey(month.jy, month.jm));
    if (!target) continue;
    if (a.status === "present") target.presentDays += 1;
    else if (a.status === "absent") target.absentDays += 1;
    else if (a.status === "leave") target.leaveDays += 1;
    else if (a.status === "half_day") target.halfDays += 1;
    target.earned = addDecimal(target.earned, a.payableAmount);
  }

  for (const p of payments ?? []) {
    const month = isoToJalaliMonth(p.paymentDate);
    const target = byKey.get(monthKey(month.jy, month.jm));
    if (!target) continue;
    if (p.type === "debt_repayment") target.repaid = addDecimal(target.repaid, p.amount);
    else target.paid = addDecimal(target.paid, p.amount);
  }

  let running = "0";
  for (const row of rows) {
    const net = addDecimal(addDecimal(row.earned, negateDecimal(row.paid)), row.repaid);
    row.net = net;
    running = addDecimal(running, net);
    row.running = running;
  }

  return rows;
}

export function buildMonthlySummary(rows: MonthlyLedgerRow[]): {
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  halfDays: number;
  earned: string;
  paid: string;
  repaid: string;
  running: string;
} {
  let presentDays = 0;
  let absentDays = 0;
  let leaveDays = 0;
  let halfDays = 0;
  let earned = "0";
  let paid = "0";
  let repaid = "0";
  for (const row of rows) {
    presentDays += row.presentDays;
    absentDays += row.absentDays;
    leaveDays += row.leaveDays;
    halfDays += row.halfDays;
    earned = addDecimal(earned, row.earned);
    paid = addDecimal(paid, row.paid);
    repaid = addDecimal(repaid, row.repaid);
  }
  return { presentDays, absentDays, leaveDays, halfDays, earned, paid, repaid, running: rows.length ? rows[rows.length - 1]!.running : "0" };
}
