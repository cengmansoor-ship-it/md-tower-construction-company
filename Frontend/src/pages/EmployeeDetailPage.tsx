import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { api, type Employee, type Attendance, type EmployeePayment, type AttendanceStatus, type EmployeePaymentType, type EmployeeDocument } from "../lib/api";
import {
  addDecimal,
  negateDecimal,
  decimalSign,
  absDecimal,
  isoToJalaliMonth,
  monthKey,
  shiftMonth,
  jalaliDateToIso,
  addIsoDays,
  jalaliWeekStart,
  buildMonthlyLedger,
  buildMonthlySummary,
} from "../lib/employeeLedger";
import { daysInJalaliMonth, isoToJalaliString } from "../lib/jalali";
import LedgerIdentityBar from "../components/LedgerIdentityBar";
import JalaliDate from "../components/JalaliDate";
import ShamsiDateInput from "../components/ShamsiDateInput";
import { currencyLabel, visibleText } from "../lib/labels";

const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = { present: "حاضر", absent: "غیرحاضر", leave: "رخصتي", half_day: "نیم ورځ" };
const JALALI_MONTH_NAMES = ["حمل", "ثور", "جوزا", "سرطان", "اسد", "سنبله", "میزان", "عقرب", "قوس", "جدي", "دلو", "حوت"];

type PeriodKind = "daily" | "weekly" | "monthly" | "yearly";

const PERIOD_OPTIONS: Array<{ value: PeriodKind; label: string }> = [
  { value: "daily", label: "ورځنی" },
  { value: "weekly", label: "هفتنی" },
  { value: "monthly", label: "میاشتنی" },
  { value: "yearly", label: "کلنی" },
];

interface PeriodCursor {
  daily: string;
  weekly: string;
  monthly: { jy: number; jm: number };
  yearly: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

function isoDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildIsoDateRange(startValue: string, endValue: string): string[] {
  const start = parseIsoDate(startValue);
  const end = parseIsoDate(endValue);
  if (!start || !end) throw new Error("نېټه ناسمه ده");
  if (start.getTime() > end.getTime()) throw new Error("د پای نېټه باید د شروع نېټې څخه وروسته وي");

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(isoDateString(cursor));
    if (dates.length > 370) throw new Error("د حاضري موده ډېره اوږده ده");
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function shortPaymentNumber(payment: EmployeePayment, index: number): string {
  return visibleText(payment.paymentNumber, `رسید ${index + 1}`).replace(/^معاش[-\s]*/u, "").replace(/^employee[_-]?payment[-\s]*/iu, "");
}

function paymentTypeLabel(type: EmployeePaymentType): string {
  if (type === "salary") return "معاش";
  if (type === "advance") return "پیشکي";
  return "د قرضداري تادیه";
}

function defaultPeriodCursor(anchor: string): PeriodCursor {
  const week = jalaliWeekStart(anchor);
  const month = isoToJalaliMonth(anchor);
  return { daily: anchor, weekly: week, monthly: { jy: month.jy, jm: month.jm }, yearly: month.jy };
}

function shiftCursor(kind: PeriodKind, cursor: PeriodCursor, delta: number): PeriodCursor {
  if (kind === "daily") return { ...cursor, daily: addIsoDays(cursor.daily, delta) };
  if (kind === "weekly") return { ...cursor, weekly: addIsoDays(cursor.weekly, delta * 7) };
  if (kind === "monthly") return { ...cursor, monthly: shiftMonth(cursor.monthly.jy, cursor.monthly.jm, delta) };
  return { ...cursor, yearly: cursor.yearly + delta };
}

function cursorLabel(kind: PeriodKind, cursor: PeriodCursor): string {
  if (kind === "daily") return isoToJalaliString(cursor.daily);
  if (kind === "weekly") return `${isoToJalaliString(cursor.weekly)} - ${isoToJalaliString(addIsoDays(cursor.weekly, 6))}`;
  if (kind === "monthly") return `${cursor.monthly.jy} ${JALALI_MONTH_NAMES[cursor.monthly.jm - 1] ?? ""} (${cursor.monthly.jm})`;
  return `کال ${cursor.yearly}`;
}

function jalaliMonthLabel(jy: number, jm: number): string {
  return `${JALALI_MONTH_NAMES[jm - 1] ?? jm} ${jy} (${jm})`;
}

function PeriodPicker({ kind, label, onPrev, onNext, onToday, onKindChange }: {
  kind: PeriodKind;
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onKindChange: (kind: PeriodKind) => void;
}) {
  return (
    <div className="no-print" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
      <div style={{ display: "inline-flex", gap: 6 }}>
        {PERIOD_OPTIONS.map((option) => (
          <button key={option.value} className={`btn btn-sm ${kind === option.value ? "btn-primary" : "btn-outline"}`} onClick={() => onKindChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
      <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <button className="btn btn-outline btn-sm" onClick={onPrev}><ChevronRight size={14} /></button>
        <span style={{ fontWeight: 800, minWidth: 170, textAlign: "center", fontSize: 13 }}>{label}</span>
        <button className="btn btn-outline btn-sm" onClick={onNext}><ChevronLeft size={14} /></button>
        <button className="btn btn-outline btn-sm" onClick={onToday}>نن</button>
      </div>
    </div>
  );
}

function balanceLineClass(amount: string): string {
  const sign = decimalSign(amount);
  if (sign > 0) return "balance-positive";
  if (sign < 0) return "balance-negative";
  return "balance-zero";
}

function balanceAlertMessage(name: string, balance: string | undefined, currency: string): { color: string; text: string } {
  const sign = decimalSign(balance);
  const abs = absDecimal(balance ?? "0");
  if (sign > 0) return { color: "var(--success)", text: `پور: دفتر د ${name} قرضداره دی ${abs} ${currency}` };
  if (sign < 0) return { color: "var(--danger)", text: `طلب: ${name} د دفتر قرضداره دی ${abs} ${currency}` };
  return { color: "var(--text)", text: "حساب برابر دی؛ نه طلب پاته دی، نه پور." };
}

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [showAttendanceForm, setShowAttendanceForm] = useState(false);
  const [attStartDate, setAttStartDate] = useState(todayIso());
  const [attEndDate, setAttEndDate] = useState(todayIso());
  const [attStatus, setAttStatus] = useState<AttendanceStatus>("present");
  const [attPaymentAmount, setAttPaymentAmount] = useState("");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payType, setPayType] = useState<EmployeePaymentType>("salary");
  const [payDate, setPayDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [ledgerYear, setLedgerYear] = useState<number | "all">("all");
  const [attKind, setAttKind] = useState<PeriodKind>("monthly");
  const [attCursor, setAttCursor] = useState<PeriodCursor | null>(null);
  const [payKind, setPayKind] = useState<PeriodKind>("monthly");
  const [payCursor, setPayCursor] = useState<PeriodCursor | null>(null);

  const { data: employee } = useQuery({ queryKey: ["employee", id], queryFn: () => api.get<Employee>(`/employees/${id}`) });

  useEffect(() => {
    if (!employee || attCursor) return;
    const dates = (employee.attendances ?? []).map((a) => a.date.slice(0, 10)).sort();
    const anchor = dates[dates.length - 1] ?? (employee.endDate && employee.endDate <= todayIso() ? employee.endDate : todayIso());
    const cursor = defaultPeriodCursor(anchor);
    setAttCursor(cursor);
    setPayCursor(cursor);
  }, [employee, attCursor]);

  const attendances = useMemo(() => {
    const list = [...(employee?.attendances ?? [])];
    return list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }, [employee]);

  const attendancesByDate = useMemo(() => {
    const map = new Map<string, Attendance>();
    for (const a of attendances) map.set(a.date.slice(0, 10), a);
    return map;
  }, [attendances]);

  const monthlyRows = useMemo(
    () => buildMonthlyLedger(employee?.attendances, employee?.payments, employee?.startDate, employee?.endDate, todayIso()),
    [employee],
  );

  const monthlySummary = useMemo(() => buildMonthlySummary(monthlyRows), [monthlyRows]);

  const ledgerYears = useMemo(() => {
    const years = new Set<number>();
    for (const row of monthlyRows) years.add(row.jy);
    return Array.from(years).sort((a, b) => b - a);
  }, [monthlyRows]);

  const ledgerViewRows = useMemo(() => {
    if (ledgerYear === "all") return monthlyRows;
    const startIdx = monthlyRows.findIndex((row) => row.jy === ledgerYear);
    const subset = monthlyRows.filter((row) => row.jy === ledgerYear);
    if (startIdx <= 0) return subset;
    const beforeRunning = monthlyRows[startIdx - 1]!.running;
    return subset.map((row) => ({ ...row, running: addDecimal(row.running, negateDecimal(beforeRunning)) }));
  }, [monthlyRows, ledgerYear]);

  const attendanceDays = useMemo(() => {
    if (!attCursor) return [];
    const days: Array<{ iso: string; attendance: Attendance | null }> = [];
    if (attKind === "daily") {
      days.push({ iso: attCursor.daily, attendance: attendancesByDate.get(attCursor.daily) ?? null });
    } else if (attKind === "weekly") {
      for (let i = 0; i < 7; i += 1) {
        const iso = addIsoDays(attCursor.weekly, i);
        days.push({ iso, attendance: attendancesByDate.get(iso) ?? null });
      }
    } else if (attKind === "monthly") {
      const count = daysInJalaliMonth(attCursor.monthly.jy, attCursor.monthly.jm);
      for (let day = 1; day <= count; day += 1) {
        const iso = jalaliDateToIso(attCursor.monthly.jy, attCursor.monthly.jm, day);
        days.push({ iso, attendance: attendancesByDate.get(iso) ?? null });
      }
    }
    return days;
  }, [attKind, attCursor, attendancesByDate]);

  const attendanceYearRows = useMemo(() => {
    if (attKind !== "yearly" || !attCursor) return [];
    const rows: Array<{ jm: number; present: number; absent: number; leave: number; half: number; earned: string }> = [];
    for (let jm = 1; jm <= 12; jm += 1) {
      const key = monthKey(attCursor.yearly, jm);
      const inMonth = attendances.filter((a) => monthKey(isoToJalaliMonth(a.date).jy, isoToJalaliMonth(a.date).jm) === key);
      let present = 0;
      let absent = 0;
      let leave = 0;
      let half = 0;
      let earned = "0";
      for (const a of inMonth) {
        if (a.status === "present") present += 1;
        else if (a.status === "absent") absent += 1;
        else if (a.status === "leave") leave += 1;
        else if (a.status === "half_day") half += 1;
        earned = addDecimal(earned, a.payableAmount);
      }
      rows.push({ jm, present, absent, leave, half, earned });
    }
    return rows;
  }, [attKind, attCursor, attendances]);

  const paymentsInPeriod = useMemo(() => {
    if (!payCursor) return [];
    const list = (employee?.payments ?? []).filter((p) => !p.voidedAt).sort((a, b) => (a.paymentDate < b.paymentDate ? -1 : 1));
    if (payKind === "daily") return list.filter((p) => p.paymentDate.slice(0, 10) === payCursor.daily);
    if (payKind === "weekly") {
      const start = payCursor.weekly;
      const end = addIsoDays(start, 6);
      return list.filter((p) => p.paymentDate.slice(0, 10) >= start && p.paymentDate.slice(0, 10) <= end);
    }
    if (payKind === "monthly") {
      const key = monthKey(payCursor.monthly.jy, payCursor.monthly.jm);
      return list.filter((p) => monthKey(isoToJalaliMonth(p.paymentDate).jy, isoToJalaliMonth(p.paymentDate).jm) === key);
    }
    return list.filter((p) => isoToJalaliMonth(p.paymentDate).jy === payCursor.yearly);
  }, [payKind, payCursor, employee]);

  const paymentYearRows = useMemo(() => {
    if (payKind !== "yearly" || !payCursor) return [];
    const rows: Array<{ jm: number; paid: string; repaid: string }> = [];
    for (let jm = 1; jm <= 12; jm += 1) {
      const key = monthKey(payCursor.yearly, jm);
      const inMonth = paymentsInPeriod.filter((p) => monthKey(isoToJalaliMonth(p.paymentDate).jy, isoToJalaliMonth(p.paymentDate).jm) === key);
      let paid = "0";
      let repaid = "0";
      for (const p of inMonth) {
        if (p.type === "debt_repayment") repaid = addDecimal(repaid, p.amount);
        else paid = addDecimal(paid, p.amount);
      }
      rows.push({ jm, paid, repaid });
    }
    return rows;
  }, [payKind, payCursor, paymentsInPeriod]);

  const attendanceMutation = useMutation({
    mutationFn: async () => {
      const dates = buildIsoDateRange(attStartDate, attEndDate);
      const saved: Attendance[] = [];
      for (const date of dates) {
        saved.push(await api.post<Attendance>(`/employees/${id}/attendance`, { date, status: attStatus }));
      }
      if (attPaymentAmount.trim()) {
        await api.post<EmployeePayment>(`/employees/${id}/payments`, {
          amount: attPaymentAmount.trim(),
          type: "salary",
          currencyCode: employee?.currencyCode,
          paymentDate: attEndDate || attStartDate,
        });
      }
      return saved;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee", id] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      setShowAttendanceForm(false);
      setAttPaymentAmount("");
      setError(null);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "ناکامي"),
  });

  const paymentMutation = useMutation({
    mutationFn: () =>
      api.post<EmployeePayment>(`/employees/${id}/payments`, {
        amount: payAmount, type: payType, currencyCode: employee?.currencyCode, paymentDate: payDate,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee", id] });
      setShowPaymentForm(false);
      setPayAmount("");
      setError(null);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "ناکامي"),
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async ({ document, reason }: { document: EmployeeDocument; reason: string }) => {
      await api.delete<void>(`/employees/${document.employeeId}/documents/${document.id}?reason=${encodeURIComponent(reason)}`);
      return document.employeeId;
    },
    onSuccess: (employeeId) => {
      qc.invalidateQueries({ queryKey: ["employee", String(employeeId)] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["trash"] });
      setError(null);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "د سند حذف ناکام شو"),
  });

  if (!employee) return null;

  const accountClosed = Boolean(employee.endDate && employee.endDate <= todayIso());
  const currency = currencyLabel(employee.currencyCode);
  const alert = balanceAlertMessage(employee.name, employee.balance, currency);

  function openAttendanceForm() {
    if (accountClosed) {
      setError("ددې کارکوونکي کهاته بنده ده؛ حاضري او نور عملي کارونه نشي ثبتېدای، یوازې تادیه کېدای شي.");
      return;
    }
    setAttStartDate(employee?.startDate || todayIso());
    setAttEndDate(todayIso());
    setAttPaymentAmount("");
    setError(null);
    setShowAttendanceForm(true);
  }

  function deleteDocument(document: EmployeeDocument) {
    const reason = window.prompt("د سند د حذف دلیل ولیکئ:");
    if (!reason?.trim()) return;
    deleteDocumentMutation.mutate({ document, reason: reason.trim() });
  }

  return (
    <div className="print-report-page employee-ledger-page">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Link to={employee.workerType === "misc" ? "/misc-workers" : "/employees"} style={{ color: "var(--muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
          {employee.workerType === "misc" ? "متفرقه کاریګر" : "کارکوونکي"} <ArrowRight size={13} />
        </Link>
        <span style={{ color: "var(--muted)" }}>/</span>
        <span style={{ fontSize: 13 }}>{visibleText(employee.employeeNumber, "کارکوونکی")}</span>
      </div>
      <p className="page-title" style={{ margin: 0 }}>{employee.name}</p>
      <p className="page-sub">دنده: {employee.position} - مزد: {employee.wageAmount} {currency}</p>

      <LedgerIdentityBar subtitle={`${employee.name} / ${currency} کهاته`} />

      {employee.workPeriods?.length ? (
        <div style={{ background: "var(--surface-2)", padding: "12px 14px", borderRadius: 8, margin: "12px 0", fontWeight: 900 }}>
          نوی حساب د <JalaliDate date={employee.startDate} /> څخه شروع شو.
        </div>
      ) : null}

      {accountClosed ? (
        <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "12px 14px", borderRadius: 8, margin: "12px 0", fontWeight: 900 }}>
          ددې کارکوونکي کهاته بنده ده؛ حاضري او نور عملي کارونه نشي ثبتېدای، یوازې تادیه کېدای شي.
        </div>
      ) : null}

      <div className="ledger-balance-alert" style={{ borderColor: alert.color, color: alert.color, background: "var(--surface-2)", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
        {alert.text}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, margin: "16px 0" }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>د پیل نېټه</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}><JalaliDate date={employee.startDate} /></div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>حاضر / غیر حاضر ورځې</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{monthlySummary.presentDays} / {monthlySummary.absentDays}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>رخصتي: {monthlySummary.leaveDays} - نیم ورځ: {monthlySummary.halfDays}</div>
        </div>
        <div className="card" style={{ padding: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-outline btn-sm" disabled={accountClosed} onClick={openAttendanceForm}><Plus size={12} /> حاضري</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowPaymentForm(true)}><Plus size={12} /> تادیه</button>
        </div>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 15, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>د کارمند میاشتنی کهاته</div>
          <div className="no-print" style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
            <button className={`btn btn-sm ${ledgerYear === "all" ? "btn-primary" : "btn-outline"}`} onClick={() => setLedgerYear("all")}>ټول</button>
            {ledgerYears.map((year) => (
              <button key={year} className={`btn btn-sm ${ledgerYear === year ? "btn-primary" : "btn-outline"}`} onClick={() => setLedgerYear(year)}>{year}</button>
            ))}
          </div>
        </div>
        <div style={{ overflow: "auto" }}>
          <table className="fl-table ledger-table" style={{ minWidth: 980, fontSize: 13 }}>
            <thead>
              <tr>
                <th>شمېره</th><th>میاشت</th><th>حاضر</th><th>غیر حاضر</th><th>رخصتي</th><th>نیم ورځ</th>
                <th>مستحق معاش</th><th>ورکړل شوي</th><th>د قرض تادیه</th><th>خالص</th>
              </tr>
            </thead>
            <tbody>
              {ledgerViewRows.map((row, index) => (
                <tr key={monthKey(row.jy, row.jm)}>
                  <td>{index + 1}</td>
                  <td style={{ fontWeight: 800 }}>{jalaliMonthLabel(row.jy, row.jm)}</td>
                  <td>{row.presentDays}</td>
                  <td>{row.absentDays}</td>
                  <td>{row.leaveDays}</td>
                  <td>{row.halfDays}</td>
                  <td>{row.earned} {currency}</td>
                  <td>{row.paid} {currency}</td>
                  <td>{row.repaid} {currency}</td>
                  <td className={balanceLineClass(row.net)}>{row.net} {currency}</td>
                </tr>
              ))}
              {!ledgerViewRows.length ? (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>تر اوسه کومه کهاته نشته.</td></tr>
              ) : null}
            </tbody>
            {ledgerViewRows.length ? (
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ fontWeight: 900 }}>ټول</td>
                  <td style={{ fontWeight: 900 }}>{monthlySummary.presentDays}</td>
                  <td style={{ fontWeight: 900 }}>{monthlySummary.absentDays}</td>
                  <td style={{ fontWeight: 900 }}>{monthlySummary.leaveDays}</td>
                  <td style={{ fontWeight: 900 }}>{monthlySummary.halfDays}</td>
                  <td style={{ fontWeight: 900 }}>{monthlySummary.earned} {currency}</td>
                  <td style={{ fontWeight: 900 }}>{monthlySummary.paid} {currency}</td>
                  <td style={{ fontWeight: 900 }}>{monthlySummary.repaid} {currency}</td>
                  <td className={balanceLineClass(monthlySummary.running)} style={{ fontWeight: 900 }}>{monthlySummary.running} {currency}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 22, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>د حاضري ریکارډ</div>
        <div style={{ marginBottom: 12 }}>
          <PeriodPicker
            kind={attKind}
            label={attCursor ? cursorLabel(attKind, attCursor) : "—"}
            onPrev={() => attCursor && setAttCursor(shiftCursor(attKind, attCursor, -1))}
            onNext={() => attCursor && setAttCursor(shiftCursor(attKind, attCursor, 1))}
            onToday={() => setAttCursor(defaultPeriodCursor(todayIso()))}
            onKindChange={setAttKind}
          />
        </div>

        {attKind === "yearly" ? (
          <table className="fl-table ledger-table" style={{ fontSize: 13 }}>
            <thead>
              <tr><th>میاشت</th><th>حاضر</th><th>غیر حاضر</th><th>رخصتي</th><th>نیم ورځ</th><th>مستحق معاش</th></tr>
            </thead>
            <tbody>
              {attendanceYearRows.map((row) => (
                <tr key={row.jm}>
                  <td style={{ fontWeight: 800 }}>{JALALI_MONTH_NAMES[row.jm - 1]} {attCursor?.yearly}</td>
                  <td>{row.present}</td><td>{row.absent}</td><td>{row.leave}</td><td>{row.half}</td>
                  <td>{row.earned} {currency}</td>
                </tr>
              ))}
              {attendanceYearRows.every((row) => row.present === 0 && row.absent === 0 && row.leave === 0 && row.half === 0) ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 18, color: "var(--muted)" }}>په دې کال کې هېڅ حاضري نشته.</td></tr>
              ) : null}
            </tbody>
          </table>
        ) : (
          <table className="fl-table ledger-table" style={{ fontSize: 13 }}>
            <thead>
              <tr><th>نېټه</th><th>حالت</th><th>د ورځې مزد</th></tr>
            </thead>
            <tbody>
              {attendanceDays.map(({ iso, attendance }) => (
                <tr key={iso}>
                  <td><JalaliDate date={iso} /></td>
                  <td>{attendance ? ATTENDANCE_LABELS[attendance.status] : "—"}</td>
                  <td>{attendance ? attendance.payableAmount : "0"}</td>
                </tr>
              ))}
              {!attendanceDays.length ? (
                <tr><td colSpan={3} style={{ textAlign: "center", padding: 18, color: "var(--muted)" }}>تر اوسه هېڅ حاضري نشته.</td></tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>تادیات</div>
        <div style={{ marginBottom: 12 }}>
          <PeriodPicker
            kind={payKind}
            label={payCursor ? cursorLabel(payKind, payCursor) : "—"}
            onPrev={() => payCursor && setPayCursor(shiftCursor(payKind, payCursor, -1))}
            onNext={() => payCursor && setPayCursor(shiftCursor(payKind, payCursor, 1))}
            onToday={() => setPayCursor(defaultPeriodCursor(todayIso()))}
            onKindChange={setPayKind}
          />
        </div>

        {payKind === "yearly" ? (
          <table className="fl-table ledger-table" style={{ fontSize: 13 }}>
            <thead>
              <tr><th>میاشت</th><th>ورکړل شوي</th><th>د قرض تادیه</th></tr>
            </thead>
            <tbody>
              {paymentYearRows.map((row) => (
                <tr key={row.jm}>
                  <td style={{ fontWeight: 800 }}>{JALALI_MONTH_NAMES[row.jm - 1]} {payCursor?.yearly}</td>
                  <td style={{ color: "var(--success)", fontWeight: 600 }}>{row.paid} {currency}</td>
                  <td style={{ color: "var(--danger)", fontWeight: 600 }}>{row.repaid} {currency}</td>
                </tr>
              ))}
              {paymentYearRows.every((row) => decimalSign(row.paid) === 0 && decimalSign(row.repaid) === 0) ? (
                <tr><td colSpan={3} style={{ textAlign: "center", padding: 18, color: "var(--muted)" }}>په دې کال کې هېڅ تادیه نشته.</td></tr>
              ) : null}
            </tbody>
          </table>
        ) : (
          <table className="fl-table ledger-table" style={{ fontSize: 13 }}>
            <thead>
              <tr><th>شمېره</th><th>نېټه</th><th>ډول</th><th>اندازه</th><th>پخوانی پاتې</th><th>نوی پاتې</th></tr>
            </thead>
            <tbody>
              {paymentsInPeriod.map((p, index) => (
                <tr key={p.id}>
                  <td>{shortPaymentNumber(p, index)}</td>
                  <td><JalaliDate date={p.paymentDate} /></td>
                  <td>{paymentTypeLabel(p.type)}</td>
                  <td style={{ color: p.type === "debt_repayment" ? "var(--danger)" : "var(--success)", fontWeight: 600 }}>{p.amount}</td>
                  <td>{p.previousBalance ?? "—"}</td>
                  <td>{p.newBalance ?? "—"}</td>
                </tr>
              ))}
              {!paymentsInPeriod.length ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 18, color: "var(--muted)" }}>په دې موده کې هېڅ تادیه نشته.</td></tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      {employee.workPeriods?.length ? (
        <div className="card" style={{ padding: 0, overflow: "auto", marginBottom: 16, marginTop: 16 }}>
          <table className="fl-table ledger-table" style={{ minWidth: 720, fontSize: 13 }}>
            <thead><tr><th>پخوانی شروع</th><th>پخوانی ختم</th><th>معاش</th><th>یادښت</th></tr></thead>
            <tbody>
              {employee.workPeriods.map((period) => (
                <tr key={period.id}>
                  <td><JalaliDate date={period.startDate} /></td>
                  <td><JalaliDate date={period.endDate} /></td>
                  <td>{period.wageAmount} {currencyLabel(period.currencyCode)}</td>
                  <td>{period.note ?? "پخوانی حساب"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {employee.documents?.length ? (
        <div className="card" style={{ padding: 22, marginTop: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>اسناد</div>
          <div style={{ display: "grid", gap: 10 }}>
            {employee.documents.map((document) => (
              <div
                key={document.id}
                style={{ display: "grid", gridTemplateColumns: "72px minmax(0, 1fr) auto auto", alignItems: "center", gap: 12, color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}
              >
                <img src={document.fileUrl} alt={document.fileName} loading="lazy" style={{ width: 72, height: 54, objectFit: "cover", borderRadius: 8, background: "var(--surface-2)" }} />
                <span style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{document.fileName}</span>
                <span style={{ direction: "ltr", color: "var(--muted)", fontSize: 12 }}>{(document.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
                <div className="no-print" style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <a className="btn btn-outline btn-sm" href={document.fileUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                    لیدل
                  </a>
                  <button className="btn btn-outline btn-sm" type="button" disabled={deleteDocumentMutation.isPending} onClick={() => deleteDocument(document)}>
                    <Trash2 size={13} /> ډیلیټ
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {showAttendanceForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="card" style={{ width: 430, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>حاضري ثبتول</div>
              <button className="btn btn-outline btn-sm" onClick={() => setShowAttendanceForm(false)}><X size={14} /></button>
            </div>
            {error && <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="form-label">له نېټې</label>
                  <ShamsiDateInput className="form-input" value={attStartDate} onChange={setAttStartDate} />
                </div>
                <div>
                  <label className="form-label">تر نېټې</label>
                  <ShamsiDateInput className="form-input" value={attEndDate} onChange={setAttEndDate} />
                </div>
              </div>
              <div>
                <label className="form-label">حالت</label>
                <select className="form-input" value={attStatus} onChange={(e) => setAttStatus(e.target.value as AttendanceStatus)}>
                  <option value="present">حاضر</option>
                  <option value="absent">غیرحاضر</option>
                  <option value="leave">رخصتي</option>
                  <option value="half_day">نیم ورځ</option>
                </select>
              </div>
              <div>
                <label className="form-label">اضافي تادیه / رسیده پیسې (اختیاري)</label>
                <input className="form-input" type="text" inputMode="decimal" value={attPaymentAmount} onChange={(e) => setAttPaymentAmount(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-primary" disabled={attendanceMutation.isPending} onClick={() => attendanceMutation.mutate()}>ثبتول</button>
              <button className="btn btn-outline" onClick={() => setShowAttendanceForm(false)}>لغوه</button>
            </div>
          </div>
        </div>
      )}

      {showPaymentForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="card" style={{ width: 380, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>تادیه</div>
              <button className="btn btn-outline btn-sm" onClick={() => setShowPaymentForm(false)}><X size={14} /></button>
            </div>
            {error && <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="form-label">ډول</label>
                <select className="form-input" value={payType} onChange={(e) => setPayType(e.target.value as EmployeePaymentType)}>
                  <option value="salary">معاش</option>
                  <option value="advance">پیشکي</option>
                  <option value="debt_repayment">د قرضداري تادیه</option>
                </select>
              </div>
              <div>
                <label className="form-label">اندازه</label>
                <input className="form-input" type="text" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              </div>
              <div>
                <label className="form-label">نېټه</label>
                <ShamsiDateInput className="form-input" value={payDate} onChange={setPayDate} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-primary" disabled={!payAmount || paymentMutation.isPending} onClick={() => paymentMutation.mutate()}>ثبتول</button>
              <button className="btn btn-outline" onClick={() => setShowPaymentForm(false)}>لغوه</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
