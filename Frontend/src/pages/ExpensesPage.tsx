import { useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { api, type Expense, type ExpenseCategory } from "../lib/api";
import PrintHeader from "../components/PrintHeader";
import JalaliDate from "../components/JalaliDate";
import ShamsiDateInput from "../components/ShamsiDateInput";
import DateFilterButton from "../components/DateFilterButton";
import { isoToJalaliString } from "../lib/jalali";
import { currencyLabel } from "../lib/labels";
import ViewModeToggle, { type ViewMode } from "../components/ViewModeToggle";

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  kitchen: "آشپزخانه",
  office: "دفتر",
  transport: "ترانسپورټ",
  utilities: "خدمات",
  salaries: "معاشونه",
  maintenance: "ترمیم",
  other: "نور",
};
const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as Array<[ExpenseCategory, string]>;
const CUSTOM_CATEGORY_PREFIX = "custom:";
const EXPENSES_TABLE_MIN_WIDTH = 760;

interface ExpenseCategorySummary {
  key: string;
  label: string;
  count: number;
  totals: Record<string, string>;
}

interface ExpenseCategoryConfig {
  labels: Partial<Record<ExpenseCategory, string>>;
  hidden: string[];
  custom: string[];
}

interface NewExpenseForm {
  category: ExpenseCategory;
  categoryName: string;
  expenseDate: string;
  description: string;
  amount: string;
  currencyCode: string;
  payeeName: string;
}

function today(): string {
  return localIsoDate(new Date());
}

function localIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function emptyForm(): NewExpenseForm {
  return { category: "office", categoryName: "", expenseDate: today(), description: "", amount: "", currencyCode: "AFN", payeeName: "" };
}

function decimalToScaled(value: string | number | null | undefined): { amount: bigint; scale: number } {
  const clean = String(value ?? "0").trim() || "0";
  const negative = clean.startsWith("-");
  const unsigned = negative ? clean.slice(1) : clean;
  const [wholeRaw, fractionRaw = ""] = unsigned.split(".");
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
  const fraction = fractionRaw.replace(/[^0-9]/g, "");
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  return { amount: (negative ? -1n : 1n) * BigInt(digits), scale: fraction.length };
}

function formatScaled(amount: bigint, scale: number): string {
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  if (scale === 0) return `${negative ? "-" : ""}${absolute.toString()}`;
  const padded = absolute.toString().padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale) || "0";
  const fraction = padded.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function addDecimal(a: string, b: string): string {
  const left = decimalToScaled(a);
  const right = decimalToScaled(b);
  const scale = Math.max(left.scale, right.scale);
  const leftAmount = left.amount * 10n ** BigInt(scale - left.scale);
  const rightAmount = right.amount * 10n ** BigInt(scale - right.scale);
  return formatScaled(leftAmount + rightAmount, scale);
}

function totalsByCurrency(expenses: Expense[] | undefined): Record<string, string> {
  const totals: Record<string, string> = {};
  for (const expense of expenses ?? []) {
    if (expense.voidedAt) continue;
    totals[expense.currencyCode] = addDecimal(totals[expense.currencyCode] ?? "0", expense.amount);
  }
  return totals;
}

function expenseCategoryLabel(expense: Expense, categoryLabels: Record<ExpenseCategory, string>): string {
  const customName = expense.categoryName?.trim();
  return customName || categoryLabels[expense.category] || expense.category;
}

function customCategoryFilterKey(name: string): string {
  return `${CUSTOM_CATEGORY_PREFIX}${name}`;
}

function customCategoryNameFromFilter(filterValue: string): string | null {
  if (!filterValue.startsWith(CUSTOM_CATEGORY_PREFIX)) return null;
  return filterValue.slice(CUSTOM_CATEGORY_PREFIX.length).trim() || null;
}

function expenseCategoryFilterKey(expense: Expense): string {
  const customName = expense.categoryName?.trim();
  return customName ? customCategoryFilterKey(customName) : expense.category;
}

function filterExpensesByCategory(expenses: Expense[] | undefined, filterValue: string): Expense[] | undefined {
  const customName = customCategoryNameFromFilter(filterValue);
  if (customName) {
    return expenses?.filter((expense) => expense.category === "other" && expense.categoryName?.trim() === customName);
  }
  return expenses;
}

function totalsByExpenseCategory(
  expenses: Expense[] | undefined,
  categoryLabels: Record<ExpenseCategory, string>,
  hiddenCategories: string[],
  customCategoryNames: string[],
): ExpenseCategorySummary[] {
  const result = new Map<string, ExpenseCategorySummary>();
  for (const [category] of CATEGORY_OPTIONS) {
    if (hiddenCategories.includes(category)) continue;
    result.set(category, { key: category, label: categoryLabels[category], count: 0, totals: {} });
  }
  for (const name of customCategoryNames) {
    const cleanName = name.trim();
    if (!cleanName) continue;
    const key = customCategoryFilterKey(cleanName);
    if (hiddenCategories.includes(key)) continue;
    result.set(key, { key, label: cleanName, count: 0, totals: {} });
  }
  for (const expense of expenses ?? []) {
    if (expense.voidedAt) continue;
    const key = expenseCategoryFilterKey(expense);
    if (hiddenCategories.includes(key) && !result.has(key)) continue;
    const bucket = result.get(key) ?? { key, label: expenseCategoryLabel(expense, categoryLabels), count: 0, totals: {} };
    if (!bucket) continue;
    bucket.count += 1;
    bucket.totals[expense.currencyCode] = addDecimal(bucket.totals[expense.currencyCode] ?? "0", expense.amount);
    result.set(key, bucket);
  }
  return Array.from(result.values());
}

function formatTotals(totals: Record<string, string>): string {
  const rows = Object.entries(totals);
  if (!rows.length) return "0";
  return rows.map(([currency, value]) => `${value} ${currencyLabel(currency)}`).join(" / ");
}

export default function ExpensesPage() {
  const qc = useQueryClient();
  const topTableScrollRef = useRef<HTMLDivElement>(null);
  const bodyTableScrollRef = useRef<HTMLDivElement>(null);
  const expensesTableRef = useRef<HTMLTableElement>(null);
  const [expensesScrollWidth, setExpensesScrollWidth] = useState(EXPENSES_TABLE_MIN_WIDTH);
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("q") ?? "";
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [startDate, setStartDate] = useState(searchParams.get("startDate") ?? "");
  const [endDate, setEndDate] = useState(searchParams.get("endDate") ?? "");
  const [q, setQ] = useState(urlSearch);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showForm, setShowForm] = useState(false);
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [form, setForm] = useState<NewExpenseForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQ(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    document.body.classList.add("expenses-print-route");
    return () => document.body.classList.remove("expenses-print-route");
  }, []);

  const { data: expenses, refetch: refetchExpenses } = useQuery({
    queryKey: ["expenses", categoryFilter, currencyCode, startDate, endDate, q],
    queryFn: () => {
      const params = new URLSearchParams();
      const customCategoryFilter = customCategoryNameFromFilter(categoryFilter);
      if (customCategoryFilter) params.set("category", "other");
      else if (categoryFilter) params.set("category", categoryFilter);
      if (currencyCode) params.set("currencyCode", currencyCode);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (q) params.set("q", q);
      const query = params.toString();
      return api.get<Expense[]>(`/expenses${query ? `?${query}` : ""}`);
    },
  });

  const { data: summaryExpenses, refetch: refetchSummaryExpenses } = useQuery({
    queryKey: ["expenses-category-summary", currencyCode, startDate, endDate, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (currencyCode) params.set("currencyCode", currencyCode);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (q) params.set("q", q);
      const query = params.toString();
      return api.get<Expense[]>(`/expenses${query ? `?${query}` : ""}`);
    },
  });

  const { data: expenseCategoryConfig } = useQuery({
    queryKey: ["expense-category-config"],
    queryFn: () => api.get<ExpenseCategoryConfig>("/expenses/categories"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<Expense>("/expenses", {
        category: form.category,
        categoryName: form.categoryName.trim() || null,
        expenseDate: form.expenseDate,
        description: form.description,
        amount: form.amount,
        currencyCode: form.currencyCode,
        payeeName: form.payeeName || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-category-summary"] });
      qc.invalidateQueries({ queryKey: ["expense-category-config"] });
      setShowForm(false);
      setShowCustomCategory(false);
      setCategoryMenuOpen(false);
      setForm(emptyForm());
      setError(null);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "ناکامي"),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => api.post<Expense>(`/expenses/${id}/void`, { reason }),
    onSuccess: (_expense, variables) => {
      qc.setQueriesData<Expense[]>({ queryKey: ["expenses"] }, (current) => current?.filter((expense) => expense.id !== variables.id));
      qc.setQueriesData<Expense[]>({ queryKey: ["expenses-category-summary"] }, (current) => current?.filter((expense) => expense.id !== variables.id));
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-category-summary"] });
      qc.invalidateQueries({ queryKey: ["trash"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "حذف ناکام شو"),
  });

  const renameCategoryMutation = useMutation({
    mutationFn: ({ key, label }: { key: string; label: string }) =>
      api.put<{ updated?: number }>("/expenses/category-label", { key, label }),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ["expense-category-config"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-category-summary"] });
      if (categoryFilter === variables.key && customCategoryNameFromFilter(variables.key)) {
        setCategoryFilter(customCategoryFilterKey(variables.label));
      }
    },
    onError: (e: unknown) => window.alert(e instanceof Error ? e.message : "د نوعیت تغییر ناکام شو"),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: ({ key }: { key: string }) => api.post<{ updated?: number }>("/expenses/category-delete", { key }),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ["expense-category-config"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-category-summary"] });
      if (categoryFilter === variables.key) setCategoryFilter("");
    },
    onError: (e: unknown) => window.alert(e instanceof Error ? e.message : "د نوعیت حذف ناکام شو"),
  });

  function deleteExpense(expense: Expense) {
    const reason = window.prompt("د حذف دلیل ولیکئ:");
    if (!reason?.trim()) return;
    deleteMutation.mutate({ id: expense.id, reason: reason.trim() });
  }

  const categoryLabels: Record<ExpenseCategory, string> = { ...CATEGORY_LABELS, ...(expenseCategoryConfig?.labels ?? {}) };
  const hiddenExpenseCategories = expenseCategoryConfig?.hidden ?? [];
  const customExpenseCategories = expenseCategoryConfig?.custom ?? [];
  const filteredExpenses = filterExpensesByCategory(expenses, categoryFilter);
  const visibleExpenses = useMemo(() => filteredExpenses?.filter((expense) => !expense.voidedAt), [filteredExpenses]);
  const totals = totalsByCurrency(visibleExpenses);
  const categorySummaries = totalsByExpenseCategory(summaryExpenses, categoryLabels, hiddenExpenseCategories, customExpenseCategories);
  const selectedCategorySummary = categorySummaries.find((summary) => summary.key === categoryFilter);
  const selectedCategoryLabel = selectedCategorySummary?.label || (categoryFilter && categoryLabels[categoryFilter as ExpenseCategory] ? categoryLabels[categoryFilter as ExpenseCategory] : "ټول مصارف");
  const rangeLabel = startDate || endDate
    ? `${startDate ? isoToJalaliString(startDate) : "له پیل"} تر ${endDate ? isoToJalaliString(endDate) : "تر پایه"}`
    : "ټول تاریخونه";

  function refetchExpenseReports() {
    void refetchExpenses();
    void refetchSummaryExpenses();
  }

  function updateFormCategory(value: string) {
    const customName = customCategoryNameFromFilter(value);
    if (customName) {
      setShowCustomCategory(true);
      setForm((current) => ({ ...current, category: "other", categoryName: customName }));
      setCategoryMenuOpen(false);
      return;
    }
    setShowCustomCategory(false);
    setForm((current) => ({ ...current, category: value as ExpenseCategory, categoryName: "" }));
    setCategoryMenuOpen(false);
  }

  function startCustomCategory() {
    setShowCustomCategory(true);
    setCategoryMenuOpen(false);
    setForm((current) => ({ ...current, category: "other", categoryName: "" }));
  }

  function saveCustomCategoryName(name: string) {
    const cleanName = name.trim();
    if (!cleanName) return;
    const key = customCategoryFilterKey(cleanName);
    if (customExpenseCategories.includes(cleanName) || categorySummaries.some((summary) => summary.key === key)) return;
    renameCategoryMutation.mutate({ key, label: cleanName });
  }

  function editExpenseCategory(summary: ExpenseCategorySummary) {
    const newName = window.prompt("د مصرف نوعیت نوی نوم ولیکئ:", summary.label);
    if (!newName?.trim() || newName.trim() === summary.label) return;
    renameCategoryMutation.mutate({ key: summary.key, label: newName.trim() });
  }

  function deleteExpenseCategory(summary: ExpenseCategorySummary) {
    const confirmed = window.confirm(`"${summary.label}" نوعیت حذف شي؟ ریکارډونه نه حذفېږي؛ یوازې له فورم لیست څخه به پټ شي.`);
    if (!confirmed) return;
    deleteCategoryMutation.mutate({ key: summary.key });
  }

  const formCategorySelectValue = form.categoryName.trim() ? customCategoryFilterKey(form.categoryName.trim()) : form.category;
  const formCategoryOptions = form.categoryName.trim() && !categorySummaries.some((summary) => summary.key === formCategorySelectValue)
    ? [...categorySummaries, { key: formCategorySelectValue, label: form.categoryName.trim(), count: 0, totals: {} }]
    : categorySummaries;
  const currentFormCategoryLabel = formCategoryOptions.find((summary) => summary.key === formCategorySelectValue)?.label ?? categoryLabels[form.category];
  const canSubmitExpense = Boolean(form.description.trim() && form.amount.trim() && (!showCustomCategory || form.categoryName.trim()));

  useEffect(() => {
    if (viewMode !== "list") return;
    const updateScrollWidth = () => {
      const bodyWidth = bodyTableScrollRef.current?.scrollWidth ?? 0;
      const tableWidth = expensesTableRef.current?.scrollWidth ?? 0;
      setExpensesScrollWidth(Math.max(EXPENSES_TABLE_MIN_WIDTH, bodyWidth, tableWidth));
    };
    updateScrollWidth();
    const observer = new ResizeObserver(updateScrollWidth);
    if (bodyTableScrollRef.current) observer.observe(bodyTableScrollRef.current);
    if (expensesTableRef.current) observer.observe(expensesTableRef.current);
    window.addEventListener("resize", updateScrollWidth);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScrollWidth);
    };
  }, [visibleExpenses, viewMode]);

  function syncExpensesTableScroll(event: UIEvent<HTMLDivElement>, targetRef: { current: HTMLDivElement | null }) {
    const target = targetRef.current;
    if (!target || target.scrollLeft === event.currentTarget.scrollLeft) return;
    target.scrollLeft = event.currentTarget.scrollLeft;
  }

  return (
    <div className="expenses-page">
      <PrintHeader title={`${selectedCategoryLabel} راپور`} rangeLabel={rangeLabel} />
      <div className="page-header no-print">
        <div>
          <p className="page-title" style={{ margin: 0 }}>د مصارفاتو برخه</p>
          <p className="page-sub">ثبت، لټون، تاریخي راپور او چاپ.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <button className="btn btn-outline" onClick={() => window.print()}>
            <Printer size={16} /> چاپ
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> نوی مصرف
          </button>
        </div>
      </div>

      <div className="card no-print" style={{ padding: 18, margin: "16px 0", display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <label className="form-label">د مصرف نوعیت</label>
          <select className="form-input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">ټول</option>
            {categorySummaries.map((summary) => (
              <option key={summary.key} value={summary.key}>{summary.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">اسعار</label>
          <select className="form-input" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
            <option value="">ټول</option>
            <option value="AFN">افغانی</option>
            <option value="USD">ډالر</option>
            <option value="PKR">کلداره</option>
          </select>
        </div>
        <div>
          <label className="form-label">شروع تاریخ</label>
          <ShamsiDateInput className="form-input" value={startDate} onChange={setStartDate} />
        </div>
        <div>
          <label className="form-label">ختم تاریخ</label>
          <ShamsiDateInput className="form-input" value={endDate} onChange={setEndDate} />
        </div>
        <button className="btn btn-outline" type="button" onClick={() => { setStartDate(""); setEndDate(""); }}>
          ټول تاریخونه
        </button>
        <DateFilterButton onClick={refetchExpenseReports} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <label className="form-label filter-search-label">لټون</label>
          <input className="form-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="تفصیل، مستحق یا نمبر..." />
        </div>
      </div>

      <div className="expenses-print-summary" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>ټول مصارف</div>
          <div style={{ fontWeight: 800, fontSize: 18, direction: "ltr", textAlign: "right" }}>{formatTotals(totals)}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>د ثبت شمېر</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{visibleExpenses?.length ?? 0}</div>
        </div>
      </div>

      <div className="card no-print" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: 16 }}>د مصرف نوعیتونه</div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>د ټاکل شوې مودې مجموعه: {selectedCategoryLabel}</div>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setCategoryFilter("")}>ټول راپور</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          {categorySummaries.map((summary) => {
            const active = categoryFilter === summary.key;
            return (
              <div
                key={summary.key}
                className="expense-category-summary-card"
                style={{
                  border: active ? "1px solid rgba(22, 163, 74, 0.7)" : "1px solid var(--line)",
                  borderRadius: 8,
                  background: active ? "linear-gradient(135deg, rgba(220, 252, 231, 0.96), rgba(255, 255, 255, 0.98))" : "linear-gradient(135deg, rgba(255, 247, 237, 0.95), rgba(255, 255, 255, 0.98))",
                  boxShadow: active ? "0 12px 28px rgba(22, 163, 74, 0.14)" : "0 10px 24px rgba(249, 115, 22, 0.08)",
                  color: "var(--text)",
                  display: "grid",
                  gap: 6,
                  padding: "12px 14px",
                  textAlign: "right",
                }}
              >
                <button
                  type="button"
                  onClick={() => setCategoryFilter(active ? "" : summary.key)}
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "inherit",
                    cursor: "pointer",
                    display: "grid",
                    gap: 6,
                    padding: 0,
                    textAlign: "right",
                  }}
                >
                  <span style={{ fontWeight: 950 }}>{summary.label}</span>
                  <span style={{ direction: "ltr", textAlign: "right", fontWeight: 900 }}>{formatTotals(summary.totals)}</span>
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>{summary.count} ثبت</span>
                </button>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-start", borderTop: "1px solid rgba(15, 23, 42, 0.07)", paddingTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm expense-type-icon-button"
                    title="تغیر"
                    onClick={(event) => {
                      event.stopPropagation();
                      editExpenseCategory(summary);
                    }}
                    disabled={renameCategoryMutation.isPending || deleteCategoryMutation.isPending}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm expense-type-icon-button"
                    title="حذف"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteExpenseCategory(summary);
                    }}
                    disabled={renameCategoryMutation.isPending || deleteCategoryMutation.isPending}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="list-grid">
          {visibleExpenses?.map((expense) => (
            <div key={expense.id} className="list-card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                <div style={{ fontWeight: 900 }}>{expenseCategoryLabel(expense, categoryLabels)}</div>
                <div style={{ fontWeight: 900, color: "var(--danger)" }}>{expense.amount} {currencyLabel(expense.currencyCode)}</div>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}><JalaliDate date={expense.expenseDate} /></div>
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <div>{expense.description}</div>
                {expense.payeeName ? <div style={{ color: "var(--muted)" }}>{expense.payeeName}</div> : null}
              </div>
              <div className="no-print" style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn btn-outline btn-sm" onClick={() => deleteExpense(expense)} disabled={deleteMutation.isPending}>
                  <Trash2 size={14} /> حذف
                </button>
              </div>
            </div>
          ))}
          {!visibleExpenses?.length ? <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>په ټاکل شوي شرط کې مصرف نشته.</div> : null}
        </div>
      ) : (
      <>
      <div
        className="expenses-table-top-scroll no-print"
        ref={topTableScrollRef}
        onScroll={(event) => syncExpensesTableScroll(event, bodyTableScrollRef)}
      >
        <div style={{ width: expensesScrollWidth, height: 1 }} />
      </div>
      <div
        className="card elevated-card expenses-print-surface"
        ref={bodyTableScrollRef}
        onScroll={(event) => syncExpensesTableScroll(event, topTableScrollRef)}
        style={{ padding: 0, overflow: "auto" }}
      >
        <table ref={expensesTableRef} className="fl-table expenses-entry-table" style={{ minWidth: EXPENSES_TABLE_MIN_WIDTH, fontSize: 13 }}>
          <thead>
            <tr>
              <th>شماره</th>
              <th>تاریخ</th>
              <th>تفصیل</th>
              <th>پیسی</th>
              <th className="no-print">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {visibleExpenses?.map((expense, index) => (
              <tr key={expense.id}>
                <td>{index + 1}</td>
                <td style={{ whiteSpace: "nowrap" }}><JalaliDate date={expense.expenseDate} /></td>
                <td>{expenseCategoryLabel(expense, categoryLabels)} - {expense.description}{expense.payeeName ? ` - ${expense.payeeName}` : ""}</td>
                <td style={{ direction: "ltr", textAlign: "right", fontWeight: 700 }}>{expense.amount} {currencyLabel(expense.currencyCode)}</td>
                <td className="no-print">
                  <button className="btn btn-outline btn-sm" onClick={() => deleteExpense(expense)} disabled={deleteMutation.isPending}>
                    <Trash2 size={14} /> حذف
                  </button>
                </td>
              </tr>
            ))}
            {!visibleExpenses?.length ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>په ټاکل شوي شرط کې مصرف نشته.</td>
              </tr>
            ) : null}
            {visibleExpenses?.length ? (
              <tr>
                <td colSpan={3} style={{ fontWeight: 800 }}>ټوټل مصرف</td>
                <td style={{ fontWeight: 800, direction: "ltr", textAlign: "right" }}>{formatTotals(totals)}</td>
                <td className="no-print" />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      </>
      )}

      {showForm ? (
        <div className="modal-backdrop no-print" onClick={() => setShowForm(false)}>
          <div className="card modal-card expense-modal-card compact-form-modal" onClick={(event) => event.stopPropagation()} style={{ width: "min(620px, calc(100vw - 32px))", maxHeight: "82vh", padding: 18, borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>نوی مصرف ثبتول</div>
              <button className="btn btn-outline btn-sm" onClick={() => setShowForm(false)}><X size={14} /></button>
            </div>
            {error ? <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div> : null}
            <div className="expense-form-grid">
              <div className="expense-form-field expense-category-field">
                <div className="expense-field-heading">
                  <label className="form-label">د مصرف نوعیت</label>
                  <button type="button" className="btn btn-outline btn-sm expense-type-icon-button" title="نوی مصرف" onClick={startCustomCategory}>
                    <Plus size={16} />
                  </button>
                </div>
                <div
                  className="expense-category-select"
                  onBlur={(event) => {
                    const nextTarget = event.relatedTarget;
                    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setCategoryMenuOpen(false);
                  }}
                >
                  <button
                    type="button"
                    className="form-input expense-category-select-button"
                    onClick={() => setCategoryMenuOpen((open) => !open)}
                    aria-expanded={categoryMenuOpen}
                  >
                    <span>{currentFormCategoryLabel}</span>
                    <ChevronDown size={16} />
                  </button>
                  {categoryMenuOpen ? (
                    <div className="expense-category-menu">
                      {formCategoryOptions.map((summary) => {
                        const selected = formCategorySelectValue === summary.key;
                        return (
                          <div key={summary.key} className={`expense-category-menu-row${selected ? " is-selected" : ""}`}>
                            <button type="button" className="expense-category-menu-option" onClick={() => updateFormCategory(summary.key)}>
                              {summary.label}
                            </button>
                            <div className="expense-category-menu-actions">
                              <button
                                type="button"
                                className="btn btn-outline btn-sm expense-type-icon-button"
                                title="تغیر"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setCategoryMenuOpen(false);
                                  editExpenseCategory(summary);
                                }}
                                disabled={renameCategoryMutation.isPending || deleteCategoryMutation.isPending}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm expense-type-icon-button"
                                title="حذف"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setCategoryMenuOpen(false);
                                  deleteExpenseCategory(summary);
                                }}
                                disabled={renameCategoryMutation.isPending || deleteCategoryMutation.isPending}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                {showCustomCategory ? (
                  <input
                    className="form-input"
                    placeholder="د نوي مصرف نوعیت نوم"
                    value={form.categoryName}
                    onChange={(e) => setForm((current) => ({ ...current, category: "other", categoryName: e.target.value }))}
                    onBlur={(e) => saveCustomCategoryName(e.target.value)}
                  />
                ) : null}
              </div>
              <div className="expense-form-field expense-description-field">
                <label className="form-label">تفصیل</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                />
              </div>
              <div className="expense-form-field expense-money-field">
                <label className="form-label">پیسی</label>
                <div className="expense-money-grid">
                  <input className="form-input" inputMode="decimal" value={form.amount} onChange={(e) => setForm((current) => ({ ...current, amount: e.target.value }))} />
                  <select className="form-input" value={form.currencyCode} onChange={(e) => setForm((current) => ({ ...current, currencyCode: e.target.value }))}>
                    <option value="AFN">افغانی</option>
                    <option value="USD">ډالر</option>
                    <option value="PKR">کلداره</option>
                  </select>
                </div>
              </div>
              <div className="expense-form-field expense-date-field">
                <label className="form-label">تاریخ</label>
                <ShamsiDateInput className="form-input" value={form.expenseDate} onChange={(expenseDate) => setForm((current) => ({ ...current, expenseDate }))} />
              </div>
              <div className="expense-form-field expense-payee-field">
                <label className="form-label">مستحق / نوم</label>
                <input className="form-input" value={form.payeeName} onChange={(e) => setForm((current) => ({ ...current, payeeName: e.target.value }))} />
              </div>
              <div className="expense-form-actions">
                <button className="btn btn-primary" disabled={!canSubmitExpense || createMutation.isPending} onClick={() => createMutation.mutate()}>ثبت کړی</button>
                <button className="btn btn-outline" onClick={() => setShowForm(false)}>لغوه</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
