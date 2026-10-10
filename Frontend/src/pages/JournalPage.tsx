import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Banknote,
  BookOpen,
  Coins,
  Edit2,
  FileText,
  Printer,
  Save,
  Trash2,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import {
  api,
  type DailyCashCategory,
  type DailyCashDaySummary,
  type DailyCashEntry,
  type DailyCashEntryType,
  type DailyCashSummary,
  type DailyCashTargets,
  type DailyCashTargetType,
} from "../lib/api";
import PrintHeader from "../components/PrintHeader";
import JalaliDate from "../components/JalaliDate";
import ShamsiDateInput from "../components/ShamsiDateInput";
import { gregorianToJalali, isoToJalaliString } from "../lib/jalali";
import { currencyLabel as displayCurrency, visibleText } from "../lib/labels";

const CURRENCY_OPTIONS = [
  { code: "AFN", label: "افغانی", symbol: "؋", Icon: Banknote },
  { code: "USD", label: "ډالر", symbol: "$", Icon: FileText },
  { code: "PKR", label: "کلداره", symbol: "₨", Icon: Coins },
] as const;

const CATEGORY_LABELS: Record<DailyCashCategory, string> = {
  cash_in: "رسید پیسې",
  labor: "کارکوونکي/کاریګر",
  kitchen: "آشپزخانه",
  machinery: "ماشینري",
  company: "شرکت",
  customers: "مشتریان",
  other: "نور مصارف",
};

const TARGET_TYPE_LABELS: Record<DailyCashTargetType, string> = {
  supplier: "د اجناسو خریداري مشتري",
  sales_customer: "فروش مشتري",
  exchange_dealer: "صرافي مشتري",
  market_customer: "بازار/انفرادي مشتري",
  individual_customer: "بازار/انفرادي مشتري",
  regular_employee: "کارکوونکی",
  misc_worker: "متفرقه کاریګر",
  expense: "د مصارف برخه",
  company: "شرکت",
  other: "نور",
};

const TARGET_TYPES: DailyCashTargetType[] = [
  "sales_customer",
  "supplier",
  "exchange_dealer",
  "market_customer",
  "regular_employee",
  "misc_worker",
  "expense",
  "company",
  "other",
];

const EXPENSE_CATEGORIES: DailyCashCategory[] = ["labor", "kitchen", "machinery", "company", "other"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function targetNeedsAccount(targetType: DailyCashTargetType): boolean {
  return ["supplier", "sales_customer", "exchange_dealer", "market_customer", "individual_customer", "regular_employee", "misc_worker"].includes(targetType);
}

function isPartyTargetType(targetType: DailyCashTargetType | null | undefined): boolean {
  return ["supplier", "sales_customer", "exchange_dealer", "market_customer", "individual_customer"].includes(targetType ?? "other");
}

function dailyCashPartyLedgerUrl(entry: DailyCashEntry): string | null {
  if (!entry.targetId || !isPartyTargetType(entry.targetType)) return null;
  return `/parties/${entry.targetId}`;
}

function targetTypeForPayload(targetType: DailyCashTargetType, targetId: string, targets: DailyCashTargets | undefined): DailyCashTargetType {
  if (targetType !== "market_customer") return targetType;
  const id = Number(targetId);
  const party = targets?.parties.find((item) => item.id === id && (item.type === "market_customer" || item.type === "individual_customer"));
  return party?.type === "individual_customer" ? "individual_customer" : "market_customer";
}

function categoryFromTarget(entryType: DailyCashEntryType, targetType: DailyCashTargetType, current: DailyCashCategory): DailyCashCategory {
  if (entryType === "in") return "cash_in";
  if (targetType === "regular_employee" || targetType === "misc_worker") return "labor";
  if (targetType === "company") return "company";
  if (targetType === "expense") return EXPENSE_CATEGORIES.includes(current) ? current : "other";
  if (["supplier", "sales_customer", "exchange_dealer", "market_customer", "individual_customer"].includes(targetType)) return "customers";
  return current === "cash_in" ? "other" : current;
}

function isZero(value: string | undefined) {
  return !value || /^-?0*(?:\.0*)?$/.test(value);
}

function parseDecimal(value: string | undefined) {
  const normalized = String(value ?? "0").trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const sign = normalized.startsWith("-") ? -1n : 1n;
  const unsigned = normalized.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  return { amount: sign * BigInt(`${whole || "0"}${fraction}`), scale: fraction.length };
}

function formatScaled(amount: bigint, scale: number): string {
  const sign = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;
  if (scale === 0) return `${sign}${absolute}`;
  const text = absolute.toString().padStart(scale + 1, "0");
  const whole = text.slice(0, -scale) || "0";
  const fraction = text.slice(-scale).replace(/0+$/, "");
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

function subtractDecimal(left: string | undefined, right: string | undefined): string {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a || !b) return "0";
  const scale = Math.max(a.scale, b.scale);
  const aAmount = a.amount * 10n ** BigInt(scale - a.scale);
  const bAmount = b.amount * 10n ** BigInt(scale - b.scale);
  return formatScaled(aAmount - bAmount, scale);
}

function addDecimal(left: string | undefined, right: string | undefined): string {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a || !b) return "0";
  const scale = Math.max(a.scale, b.scale);
  const aAmount = a.amount * 10n ** BigInt(scale - a.scale);
  const bAmount = b.amount * 10n ** BigInt(scale - b.scale);
  return formatScaled(aAmount + bAmount, scale);
}

function decimalSign(value: string | undefined): -1 | 0 | 1 {
  const parsed = parseDecimal(value);
  if (!parsed || parsed.amount === 0n) return 0;
  return parsed.amount < 0n ? -1 : 1;
}

function formatAmount(value: string | undefined) {
  const parsed = parseDecimal(value);
  return parsed ? formatScaled(parsed.amount, parsed.scale) : value ?? "0";
}

function amountCell(value: string | undefined, tone: "in" | "out") {
  if (isZero(value)) return "";
  return <span className={tone === "in" ? "journal-money-in" : "journal-money-out"}>{formatAmount(value)}</span>;
}

type JournalArchivePeriod = "day" | "week" | "month" | "year";

interface JournalArchiveSummary extends DailyCashDaySummary {
  key: string;
  period: JournalArchivePeriod;
  label: string;
  rangeLabel: string;
  dayCount: number;
  sortDate: string;
}

const JOURNAL_ARCHIVE_PERIODS: Array<{ value: JournalArchivePeriod; label: string }> = [
  { value: "day", label: "ورځې" },
  { value: "week", label: "هفتې" },
  { value: "month", label: "میاشتې" },
  { value: "year", label: "کلونه" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDayNumber(iso: string): number {
  return Math.floor(new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).getTime() / DAY_MS);
}

function isoFromDayNumber(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

function jalaliParts(iso: string): { jy: number; jm: number; jd: number } {
  const [gy, gm, gd] = iso.slice(0, 10).split("-").map(Number);
  return gregorianToJalali(gy || 1970, gm || 1, gd || 1);
}

function weekStartDayNumber(iso: string): number {
  const dayNumber = isoDayNumber(iso);
  const day = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).getUTCDay();
  return dayNumber - ((day + 1) % 7);
}

function archiveMeta(summary: DailyCashDaySummary, period: JournalArchivePeriod): Pick<JournalArchiveSummary, "key" | "period" | "label" | "rangeLabel" | "sortDate"> {
  if (period === "day") {
    const label = isoToJalaliString(summary.entryDate);
    return { key: `day:${summary.entryDate}`, period, label, rangeLabel: label, sortDate: summary.entryDate };
  }
  if (period === "week") {
    const start = isoFromDayNumber(weekStartDayNumber(summary.entryDate));
    const end = isoFromDayNumber(weekStartDayNumber(summary.entryDate) + 6);
    const rangeLabel = `${isoToJalaliString(start)} - ${isoToJalaliString(end)}`;
    return { key: `week:${start}`, period, label: `هفته ${rangeLabel}`, rangeLabel, sortDate: end };
  }
  const { jy, jm } = jalaliParts(summary.entryDate);
  if (period === "month") {
    const month = String(jm).padStart(2, "0");
    const label = `${jy}/${month}`;
    return { key: `month:${jy}-${month}`, period, label: `میاشت ${label}`, rangeLabel: label, sortDate: summary.entryDate };
  }
  return { key: `year:${jy}`, period, label: `کال ${jy}`, rangeLabel: String(jy), sortDate: summary.entryDate };
}

function buildJournalArchives(summaries: DailyCashDaySummary[], period: JournalArchivePeriod): JournalArchiveSummary[] {
  const grouped = new Map<string, JournalArchiveSummary>();
  for (const summary of summaries) {
    const meta = archiveMeta(summary, period);
    const existing = grouped.get(meta.key);
    if (!existing) {
      grouped.set(meta.key, {
        ...summary,
        ...meta,
        dayCount: 1,
        netTotal: subtractDecimal(summary.totalIn, summary.totalOut),
      });
      continue;
    }
    existing.transactionCount += summary.transactionCount;
    existing.dayCount += 1;
    existing.totalIn = addDecimal(existing.totalIn, summary.totalIn);
    existing.totalOut = addDecimal(existing.totalOut, summary.totalOut);
    existing.netTotal = subtractDecimal(existing.totalIn, existing.totalOut);
    if (summary.entryDate > existing.sortDate) {
      existing.sortDate = summary.entryDate;
      existing.lastDescription = summary.lastDescription;
    }
  }
  return Array.from(grouped.values()).sort((a, b) => b.sortDate.localeCompare(a.sortDate));
}

export default function JournalPage() {
  const [searchParams] = useSearchParams();
  const journalSearch = searchParams.get("q") ?? "";

  useEffect(() => {
    document.body.classList.add("journal-print-route");
    return () => document.body.classList.remove("journal-print-route");
  }, []);

  const qc = useQueryClient();
  const activeJournalRef = useRef<HTMLElement | null>(null);
  const [entryDate, setEntryDate] = useState(todayIso());
  const [currencyCode, setCurrencyCode] = useState<(typeof CURRENCY_OPTIONS)[number]["code"]>("AFN");
  const [archivePeriod, setArchivePeriod] = useState<JournalArchivePeriod>("day");
  const [description, setDescription] = useState("");
  const [entryType, setEntryType] = useState<DailyCashEntryType>("in");
  const [targetType, setTargetType] = useState<DailyCashTargetType>("sales_customer");
  const [targetId, setTargetId] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [targetSearchFocused, setTargetSearchFocused] = useState(false);
  const [category, setCategory] = useState<DailyCashCategory>("cash_in");
  const [amount, setAmount] = useState("");
  const [editingEntry, setEditingEntry] = useState<DailyCashEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["daily-cash", entryDate, currencyCode],
    queryFn: () => api.get<DailyCashSummary>(`/journal/daily-cash?date=${encodeURIComponent(entryDate)}&currencyCode=${currencyCode}`),
  });

  const { data: targets } = useQuery({
    queryKey: ["daily-cash-targets"],
    queryFn: () => api.get<DailyCashTargets>("/journal/daily-cash-targets"),
  });

  const { data: daySummaries } = useQuery({
    queryKey: ["daily-cash-days", currencyCode],
    queryFn: () => api.get<DailyCashDaySummary[]>(`/journal/daily-cash-days?currencyCode=${currencyCode}`),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const submittedTargetType = targetTypeForPayload(targetType, targetId, targets);
      const body = {
        entryDate,
        description,
        category: categoryFromTarget(entryType, submittedTargetType, category),
        entryType,
        targetType: submittedTargetType,
        targetId: targetNeedsAccount(targetType) ? Number(targetId) : null,
        amount,
        currencyCode,
        reason: "د روزنامچې اصلاح",
      };
      if (editingEntry) return api.put(`/journal/daily-cash/${editingEntry.id}`, body);
      return api.post("/journal/daily-cash", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-cash"] });
      qc.invalidateQueries({ queryKey: ["daily-cash-days"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      resetForm();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "ثبت ناکام شو"),
  });

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => api.post(`/journal/daily-cash/${id}/void`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-cash"] });
      qc.invalidateQueries({ queryKey: ["daily-cash-days"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "حذف ناکام شو"),
  });

  const selectedCurrency = CURRENCY_OPTIONS.find((c) => c.code === currencyCode) ?? CURRENCY_OPTIONS[0];
  const cashInTotal = data?.totals.cash_in ?? "0";
  const expenseTotal = data?.totals.total_expenses ?? "0";
  const netTotal = useMemo(() => subtractDecimal(cashInTotal, expenseTotal), [cashInTotal, expenseTotal]);
  const journalArchives = useMemo(() => buildJournalArchives(daySummaries ?? [], archivePeriod), [archivePeriod, daySummaries]);
  const entryCount = data?.entries.length ?? 0;
  const needsAccount = targetNeedsAccount(targetType);
  const visibleEntries = useMemo(() => {
    const needle = journalSearch.trim().toLowerCase();
    const entries = data?.entries ?? [];
    if (!needle) return entries;
    return entries.filter((entry) =>
      [
        entry.description,
        entry.targetName,
        entry.currencyCode,
        entry.amount,
        entry.entryDate,
        TARGET_TYPE_LABELS[entry.targetType ?? "other"],
        CATEGORY_LABELS[entry.category],
      ].some((value) => String(value ?? "").toLowerCase().includes(needle)),
    );
  }, [data?.entries, journalSearch]);

  const targetOptions = useMemo(() => {
    if (!targets) return [];
    if (targetType === "regular_employee") {
      return targets.employees
        .filter((employee) => employee.workerType === "regular" && employee.currencyCode === currencyCode)
        .map((employee) => ({
          id: employee.id,
          label: `${visibleText(employee.name, employee.employeeNumber)}${employee.fatherName ? ` / ${employee.fatherName}` : ""}`,
        }));
    }
    if (targetType === "misc_worker") {
      return targets.employees
        .filter((employee) => employee.workerType === "misc" && employee.currencyCode === currencyCode)
        .map((employee) => ({
          id: employee.id,
          label: `${visibleText(employee.name, employee.employeeNumber)}${employee.fatherName ? ` / ${employee.fatherName}` : ""}`,
        }));
    }
    return targets.parties
      .filter((party) =>
        targetType === "market_customer"
          ? party.type === "market_customer" || party.type === "individual_customer"
          : party.type === targetType,
      )
      .map((party) => ({
        id: party.id,
        label: `${visibleText(party.name, String(party.id))}${party.fatherName ? ` / ${party.fatherName}` : ""}`,
      }));
  }, [currencyCode, targetType, targets]);

  const filteredTargetOptions = useMemo(() => {
    const query = targetSearch.trim().toLowerCase();
    if (!needsAccount || !query) return [];
    return targetOptions.filter((option) => option.label.toLowerCase().includes(query)).slice(0, 8);
  }, [needsAccount, targetOptions, targetSearch]);

  const summaryItems = [
    { label: "ټول داخل (+)", value: cashInTotal, Icon: TrendingUp, tone: "success" },
    { label: "ټول خارج (-)", value: expenseTotal, Icon: TrendingDown, tone: "danger" },
    { label: "اوسنی الباقي", value: netTotal, Icon: WalletCards, tone: decimalSign(netTotal) < 0 ? "danger" : "info" },
    { label: "د نن ثبتونه", value: String(entryCount), Icon: BookOpen, tone: "muted" },
  ] as const;

  function resetForm() {
    setDescription("");
    setAmount("");
    setEditingEntry(null);
    setError(null);
    setEntryType("in");
    setTargetType("sales_customer");
    setTargetId("");
    setTargetSearch("");
    setTargetSearchFocused(false);
    setCategory("cash_in");
  }

  function changeEntryType(nextType: DailyCashEntryType) {
    setEntryType(nextType);
    setCategory((current) => categoryFromTarget(nextType, targetType, current));
  }

  function changeTargetType(nextTargetType: DailyCashTargetType) {
    setTargetType(nextTargetType);
    setTargetId("");
    setTargetSearch("");
    setCategory((current) => categoryFromTarget(entryType, nextTargetType, current));
  }

  function submitEntry() {
    if (!description.trim() || !amount.trim() || saveMutation.isPending) return;
    if (needsAccount && !targetId) {
      setError("حساب/شخص باید انتخاب شي");
      return;
    }
    saveMutation.mutate();
  }

  function openDaySummary(summary: DailyCashDaySummary, dateOverride?: string) {
    const nextDate = dateOverride ?? summary.entryDate;
    const nextCurrency = summary.currencyCode as (typeof CURRENCY_OPTIONS)[number]["code"];
    setCurrencyCode(nextCurrency);
    setEntryDate(nextDate);
    setEditingEntry(null);
    setDescription("");
    setAmount("");
    setTargetId("");
    setTargetSearch("");
    setError(null);
    void qc.invalidateQueries({ queryKey: ["daily-cash", nextDate, nextCurrency] });
    window.setTimeout(() => {
      activeJournalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function editEntry(entry: DailyCashEntry) {
    const nextEntryType = entry.entryType ?? (entry.category === "cash_in" ? "in" : "out");
    const nextTargetType =
      entry.targetType === "individual_customer"
        ? "market_customer"
        : entry.targetType ?? (entry.category === "cash_in" ? "sales_customer" : "other");
    setEditingEntry(entry);
    setEntryDate(entry.entryDate);
    setCurrencyCode(entry.currencyCode as (typeof CURRENCY_OPTIONS)[number]["code"]);
    setDescription(entry.description);
    setEntryType(nextEntryType);
    setTargetType(nextTargetType);
    setTargetId(entry.targetId ? String(entry.targetId) : "");
    setTargetSearch(entry.targetName ?? "");
    setCategory(entry.category);
    setAmount(formatAmount(entry.amount));
    setError(null);
  }

  return (
    <div>
      <PrintHeader title={`${selectedCurrency.label} روزنامچه`} />
      <div className="page-header no-print">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="journal-page-icon"><BookOpen size={24} /></span>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>روزنامچه</h1>
            <div className="page-breadcrumb" style={{ marginTop: 7 }}>
              <span>کورپاڼه</span><span>/</span><span>روزنامچه</span>
            </div>
          </div>
        </div>
        <button className="btn btn-outline" onClick={() => window.print()}>
          <Printer size={16} /> چاپ
        </button>
      </div>

      <div className="journal-currency-tabs no-print">
        {CURRENCY_OPTIONS.map(({ code, label, symbol, Icon }) => (
          <button
            key={code}
            type="button"
            className={`journal-currency-tab ${currencyCode === code ? "active" : ""}`}
            onClick={() => {
              setCurrencyCode(code);
              setTargetId("");
              setTargetSearch("");
            }}
          >
            <Icon size={18} />
            <span>{label}</span>
            <small>{symbol}</small>
          </button>
        ))}
      </div>

      <div className="card journal-filter-card no-print">
        <div className="card-body" style={{ display: "flex", gap: 16, alignItems: "end", flexWrap: "wrap" }}>
          <div>
            <label className="form-label">د روزنامچې نېټه</label>
            <ShamsiDateInput className="form-input" value={entryDate} onChange={setEntryDate} style={{ width: 190 }} />
          </div>
          <button className="btn btn-primary" onClick={() => qc.invalidateQueries({ queryKey: ["daily-cash"] })}>
            لټون
          </button>
          {isFetching ? <span style={{ color: "var(--muted)", fontWeight: 700 }}>لوډ کېږي...</span> : null}
          {data?.previousDayCount ? (
            <span style={{ color: "var(--primary)", fontWeight: 900 }}>
              پرون (<JalaliDate date={data.previousDate} />) {data.previousDayCount} ثبتونه ترسره شوي دي.
            </span>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="no-print journal-error">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <section className="card journal-entry-card no-print">
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {editingEntry ? <Edit2 size={18} /> : <Save size={18} />} {editingEntry ? "د روزنامچې اصلاح" : "نوی ثبت"} - {selectedCurrency.label}
          </div>
          {editingEntry ? (
            <button className="btn btn-outline btn-sm" onClick={resetForm}>
              <X size={14} /> لغوه
            </button>
          ) : null}
        </div>
        <div className="card-body">
          <div className="journal-entry-grid" style={{ gridTemplateColumns: "repeat(4, minmax(160px, 1fr))" }}>
            <div>
              <label className="form-label">نېټه</label>
              <ShamsiDateInput className="form-input" value={entryDate} onChange={setEntryDate} />
            </div>
            <div>
              <label className="form-label">برخه / کټګوري</label>
              <select className="form-select" value={targetType} onChange={(e) => changeTargetType(e.target.value as DailyCashTargetType)}>
                {TARGET_TYPES.map((type) => (
                  <option key={type} value={type}>{TARGET_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">حساب / شخص</label>
              <div style={{ position: "relative" }}>
                <input
                  className="form-input"
                  value={targetSearch}
                  disabled={!needsAccount}
                  onFocus={() => setTargetSearchFocused(true)}
                  onBlur={() => window.setTimeout(() => setTargetSearchFocused(false), 120)}
                  onChange={(event) => {
                    setTargetSearch(event.target.value);
                    setTargetId("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && filteredTargetOptions.length === 1 && !targetId) {
                      event.preventDefault();
                      const [match] = filteredTargetOptions;
                      setTargetId(String(match.id));
                      setTargetSearch(match.label);
                      setTargetSearchFocused(false);
                    } else if (event.key === "Enter") {
                      submitEntry();
                    }
                  }}
                  placeholder={needsAccount ? "نوم ولیکئ..." : "حساب ته اړتیا نشته"}
                />
                {targetId ? (
                  <div style={{ marginTop: 6, color: "var(--success)", fontSize: 12, fontWeight: 800 }}>
                    انتخاب شوی: {targetSearch}
                  </div>
                ) : null}
                {needsAccount && targetSearchFocused && targetSearch.trim() && !targetId ? (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      right: 0,
                      left: 0,
                      zIndex: 20,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      boxShadow: "var(--shadow-md)",
                      overflow: "hidden",
                      maxHeight: 230,
                      overflowY: "auto",
                    }}
                  >
                    {filteredTargetOptions.length ? filteredTargetOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setTargetId(String(option.id));
                          setTargetSearch(option.label);
                          setTargetSearchFocused(false);
                        }}
                        style={{
                          width: "100%",
                          border: 0,
                          borderBottom: "1px solid var(--border)",
                          background: "transparent",
                          padding: "10px 12px",
                          textAlign: "right",
                          cursor: "pointer",
                          fontWeight: 800,
                          color: "var(--text)",
                        }}
                      >
                        {option.label}
                      </button>
                    )) : (
                      <div style={{ padding: "12px 14px", color: "var(--muted)", fontWeight: 700 }}>
                        نتیجه ونه موندل شوه
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            <div>
              <label className="form-label">داخل / خارج</label>
              <div className="journal-type-toggle">
                <button type="button" className={entryType === "in" ? "active in" : ""} onClick={() => changeEntryType("in")}>داخل +</button>
                <button type="button" className={entryType === "out" ? "active out" : ""} onClick={() => changeEntryType("out")}>خارج -</button>
              </div>
            </div>
            {entryType === "out" && targetType === "expense" ? (
              <div>
                <label className="form-label">د مصرف ډول</label>
                <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value as DailyCashCategory)}>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="journal-description-field" style={{ gridColumn: entryType === "out" && targetType === "expense" ? "span 2" : "span 3" }}>
              <label className="form-label">تفصیل *</label>
              <input
                className="form-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitEntry(); }}
                placeholder="لنډ تفصیل ولیکئ..."
              />
            </div>
            <div>
              <label className="form-label">اندازه ({selectedCurrency.symbol})</label>
              <input
                className="form-input"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitEntry(); }}
                placeholder="0"
                style={{ direction: "ltr", textAlign: "right", fontWeight: 800, borderColor: entryType === "in" ? "#12B76A" : "var(--danger)" }}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={submitEntry}
              disabled={!description.trim() || !amount.trim() || (needsAccount && !targetId) || saveMutation.isPending}
            >
              <Save size={16} /> {editingEntry ? "ساتل" : "قبول"}
            </button>
          </div>
        </div>
      </section>

      <div className="journal-summary-grid">
        {summaryItems.map(({ label, value, Icon, tone }) => (
          <div key={label} className={`journal-summary-card ${tone}`}>
            <div>
              <span>{label}</span>
              <strong>{tone === "muted" ? value : `${formatAmount(value)} ${displayCurrency(currencyCode)}`}</strong>
            </div>
            <Icon size={22} />
          </div>
        ))}
      </div>

      <section ref={activeJournalRef} className="card journal-table-card">
        <div className="card-header" style={{ gap: 12, flexWrap: "wrap" }}>
          <div>{selectedCurrency.label} روزنامچه</div>
          <div style={{ color: "var(--muted)", fontSize: 13, fontWeight: 600 }}>
            <JalaliDate date={entryDate} />
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="fl-table journal-table" style={{ minWidth: 1100, fontSize: 14 }}>
            <colgroup>
              <col className="journal-col-date" />
              <col className="journal-col-category" />
              <col className="journal-col-account" />
              <col className="journal-col-description" />
              <col className="journal-col-in" />
              <col className="journal-col-out" />
              <col className="journal-col-currency" />
              <col className="journal-col-actions no-print" />
            </colgroup>
            <thead>
              <tr>
                <th>تاریخ</th>
                <th>برخه</th>
                <th>حساب / شخص</th>
                <th style={{ width: 340 }}>تفصیل</th>
                <th style={{ color: "#027A48" }}>داخل</th>
                <th style={{ color: "var(--danger)" }}>خارج</th>
                <th>اسعار</th>
                <th className="no-print">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((entry) => {
                const rowType = entry.entryType ?? (entry.category === "cash_in" ? "in" : "out");
                const rowTargetType = entry.targetType ?? "other";
                const partyLedgerUrl = dailyCashPartyLedgerUrl(entry);
                return (
                  <tr key={entry.id}>
                    <td style={{ whiteSpace: "nowrap" }}><JalaliDate date={entry.entryDate} /></td>
                    <td>{TARGET_TYPE_LABELS[rowTargetType] ?? CATEGORY_LABELS[entry.category]}</td>
                    <td>{entry.targetName || "—"}</td>
                    <td style={{ fontWeight: 700 }}>{entry.description}</td>
                    <td>{rowType === "in" ? amountCell(entry.amount, "in") : ""}</td>
                    <td>{rowType === "out" ? amountCell(entry.amount, "out") : ""}</td>
                    <td>{displayCurrency(entry.currencyCode)}</td>
                    <td className="no-print">
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        {partyLedgerUrl ? (
                          <Link className="btn btn-outline btn-sm" to={partyLedgerUrl} title="لیدل" style={{ textDecoration: "none" }}>
                            لیدل
                          </Link>
                        ) : null}
                        <button className="btn btn-outline btn-sm" title="ایډيټ" onClick={() => editEntry(entry)}>
                          <Edit2 size={13} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="ډیلیټ"
                          onClick={() => {
                            const reason = window.prompt("د حذف دلیل ولیکئ:");
                            if (reason?.trim()) voidMutation.mutate({ id: entry.id, reason: reason.trim() });
                          }}
                          style={{ color: "var(--danger)" }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && !visibleEntries.length && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: 42, color: "var(--muted)", fontWeight: 700 }}>
                    د دې تاریخ لپاره ثبت نشته.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="journal-total-row">
                <td>جمله حساب:</td>
                <td colSpan={3} />
                <td>{formatAmount(data?.totals.cash_in ?? "0")}</td>
                <td>{formatAmount(expenseTotal)}</td>
                <td />
                <td className="no-print" />
              </tr>
              <tr>
                <td>اوسنی الباقي:</td>
                <td style={{ color: decimalSign(netTotal) < 0 ? "var(--danger)" : "var(--success)", fontWeight: 900 }}>
                  {formatAmount(netTotal)} {selectedCurrency.label}
                </td>
                <td colSpan={5} />
                <td className="no-print" />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="card journal-table-card journal-archive-card no-print" style={{ marginTop: 18 }}>
        <div className="card-header" style={{ gap: 12, flexWrap: "wrap" }}>
          <div>د ورځنیو روزنامچو ریکارډونه</div>
          <div style={{ color: "var(--muted)", fontSize: 13, fontWeight: 700 }}>{selectedCurrency.label}</div>
        </div>
        <div className="journal-archive-tabs" role="tablist" aria-label="د روزنامچې زېرمه">
          {JOURNAL_ARCHIVE_PERIODS.map((period) => (
            <button
              key={period.value}
              type="button"
              className={archivePeriod === period.value ? "active" : ""}
              onClick={() => setArchivePeriod(period.value)}
            >
              {period.label}
            </button>
          ))}
        </div>
        {journalArchives.length ? (
          <div className="journal-archive-grid">
            {journalArchives.map((summary) => (
              <button
                key={summary.key}
                type="button"
                className={`journal-archive-box ${summary.sortDate === entryDate ? "is-active" : ""}`}
                onClick={() => openDaySummary(summary, summary.sortDate)}
              >
                <div className="journal-archive-box-top">
                  <strong>{summary.label}</strong>
                  <span>{summary.dayCount} ورځي / {summary.transactionCount} ثبتونه</span>
                </div>
                <div className="journal-archive-box-money">
                  <span className="journal-money-in">{formatAmount(summary.totalIn)} {displayCurrency(summary.currencyCode)}</span>
                  <span className="journal-money-out">{formatAmount(summary.totalOut)} {displayCurrency(summary.currencyCode)}</span>
                  <span className={decimalSign(summary.netTotal) < 0 ? "journal-money-out" : "journal-money-in"}>
                    {formatAmount(summary.netTotal)} {displayCurrency(summary.currencyCode)}
                  </span>
                </div>
                <div className="journal-archive-box-note">{summary.lastDescription || "—"}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="journal-archive-empty">
            تر اوسه د دې اسعارو لپاره ورځنۍ روزنامچه نشته.
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table className="fl-table journal-table" style={{ minWidth: 820, fontSize: 13 }}>
            <thead>
              <tr>
                <th>نېټه</th>
                <th>ټرانزیکشنونه</th>
                <th style={{ color: "#027A48" }}>ټول داخل</th>
                <th style={{ color: "var(--danger)" }}>ټول خارج</th>
                <th>الباقي</th>
                <th>وروستی تفصیل</th>
                <th>کړنه</th>
              </tr>
            </thead>
            <tbody>
              {daySummaries?.map((summary) => (
                <tr
                  key={`${summary.entryDate}-${summary.currencyCode}`}
                  onDoubleClick={() => openDaySummary(summary)}
                  style={{ cursor: "pointer", background: summary.entryDate === entryDate ? "var(--primary-light)" : undefined }}
                >
                  <td style={{ fontWeight: 900, whiteSpace: "nowrap" }}><JalaliDate date={summary.entryDate} /></td>
                  <td>{summary.transactionCount}</td>
                  <td className="journal-money-in">{formatAmount(summary.totalIn)} {displayCurrency(summary.currencyCode)}</td>
                  <td className="journal-money-out">{formatAmount(summary.totalOut)} {displayCurrency(summary.currencyCode)}</td>
                  <td style={{ fontWeight: 900, color: decimalSign(summary.netTotal) < 0 ? "var(--danger)" : "var(--success)" }}>
                    {formatAmount(summary.netTotal)} {displayCurrency(summary.currencyCode)}
                  </td>
                  <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary.lastDescription || "—"}</td>
                  <td>
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => openDaySummary(summary)}>
                      لیدل
                    </button>
                  </td>
                </tr>
              ))}
              {!daySummaries?.length ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--muted)", fontWeight: 700 }}>
                    تر اوسه د دې اسعارو لپاره ورځنۍ روزنامچه نشته.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
