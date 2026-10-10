import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Calculator, Edit2, Plus, Printer, Trash2, X } from "lucide-react";
import { api, type Purchase, type PurchaseStatus, type Party, type PartyLedgerResponse } from "../lib/api";
import JalaliDate from "../components/JalaliDate";
import PrintHeader from "../components/PrintHeader";
import ShamsiDateInput from "../components/ShamsiDateInput";
import DateFilterButton from "../components/DateFilterButton";
import { currencyLabel, visibleText } from "../lib/labels";
import ViewModeToggle, { type ViewMode } from "../components/ViewModeToggle";

const STATUS_LABELS: Record<PurchaseStatus, string> = { open: "پرانیستی", paid: "تادیه شوی", cancelled: "لغوه شوی" };
const STATUS_BADGES: Record<PurchaseStatus, string> = { open: "badge-warning", paid: "badge-success", cancelled: "badge-danger" };
const PURCHASE_TABLE_MIN_WIDTH = 1520;

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

interface NewPurchaseForm {
  supplierPartyId: number | null;
  purchaseNumber: string;
  purchaseDate: string;
  itemName: string;
  quantity: string;
  unitOfMeasure: string;
  unitPrice: string;
  currencyCode: string;
  notes: string;
}

function emptyForm(): NewPurchaseForm {
  return {
    supplierPartyId: null,
    purchaseNumber: "",
    purchaseDate: today(),
    itemName: "",
    quantity: "",
    unitOfMeasure: "",
    unitPrice: "",
    currencyCode: "AFN",
    notes: "",
  };
}

function parseDecimal(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const sign = normalized.startsWith("-") ? -1n : 1n;
  const unsigned = normalized.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  return { amount: sign * BigInt(`${whole}${fraction}`), scale: fraction.length };
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

function multiplyDecimal(left: string, right: string): string {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a || !b) return "";
  return formatScaled(a.amount * b.amount, a.scale + b.scale);
}

function subtractDecimal(left: string | null | undefined, right: string | null | undefined): string {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a || !b) return "0";
  const scale = Math.max(a.scale, b.scale);
  const aAmount = a.amount * 10n ** BigInt(scale - a.scale);
  const bAmount = b.amount * 10n ** BigInt(scale - b.scale);
  return formatScaled(aAmount - bAmount, scale);
}

function addDecimal(left: string | null | undefined, right: string | null | undefined): string {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a || !b) return String(left ?? right ?? "0");
  const scale = Math.max(a.scale, b.scale);
  const aAmount = a.amount * 10n ** BigInt(scale - a.scale);
  const bAmount = b.amount * 10n ** BigInt(scale - b.scale);
  return formatScaled(aAmount + bAmount, scale);
}

function compareDecimal(left: string | null | undefined, right: string | null | undefined): -1 | 0 | 1 {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a || !b) return 0;
  const scale = Math.max(a.scale, b.scale);
  const aAmount = a.amount * 10n ** BigInt(scale - a.scale);
  const bAmount = b.amount * 10n ** BigInt(scale - b.scale);
  if (aAmount === bAmount) return 0;
  return aAmount < bAmount ? -1 : 1;
}

function minDecimal(left: string, right: string): string {
  return compareDecimal(left, right) <= 0 ? left : right;
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
  const lower = clean.toLowerCase();
  for (const family of PURCHASE_ITEM_FAMILIES) {
    if (family.terms.some((term) => lower.includes(term.toLowerCase()))) return family.label;
  }
  const [firstMeaningfulToken] = clean.split(" ").filter((token) => !isPurchaseItemDetailToken(token));
  return firstMeaningfulToken ?? clean;
}

function decimalSign(value: string | null | undefined): -1 | 0 | 1 {
  const parsed = parseDecimal(value);
  if (!parsed || parsed.amount === 0n) return 0;
  return parsed.amount < 0n ? -1 : 1;
}

function absDecimal(value: string | null | undefined): string {
  const normalized = String(value ?? "0").trim();
  return normalized.startsWith("-") ? normalized.slice(1) : normalized;
}

function purchaseBalanceDisplay(value: string | null | undefined, currencyCode: string): string {
  const sign = decimalSign(value);
  const amount = sign < 0 ? absDecimal(value) : value ?? "0";
  return sign < 0 ? `طلب: ${amount} ${currencyLabel(currencyCode)}` : `${amount} ${currencyLabel(currencyCode)}`;
}

function purchaseBalanceColor(value: string | null | undefined): string {
  const sign = decimalSign(value);
  if (sign < 0) return "var(--success)";
  if (sign > 0) return "var(--danger)";
  return "var(--text)";
}

function requiredLabel(label: string) {
  return (
    <>
      {label} <span style={{ color: "var(--danger)", fontWeight: 900 }}>*</span>
    </>
  );
}

function purchaseLedgerUrl(purchase: Purchase): string {
  return `/parties/${purchase.supplierPartyId}`;
}

function purchaseDisplayNumber(purchase: Purchase): string {
  return purchase.customerBillNumber || purchase.purchaseNumber;
}

function purchaseReturnedQuantity(purchase: Purchase): string {
  return (purchase.returns ?? []).reduce((sum, ret) => addDecimal(sum, ret.quantity), "0");
}

function purchaseNetQuantity(purchase: Purchase): string {
  return subtractDecimal(purchase.quantity, purchaseReturnedQuantity(purchase));
}

function supplierReceiptValue(row: PartyLedgerResponse["rows"][number]): string {
  if (row.sourceModule === "purchase") return "0";
  return decimalSign(row.receipt) !== 0 ? row.receipt : row.money;
}

export default function PurchasesPage() {
  const qc = useQueryClient();
  const topTableScrollRef = useRef<HTMLDivElement>(null);
  const bodyTableScrollRef = useRef<HTMLDivElement>(null);
  const purchaseTableRef = useRef<HTMLTableElement>(null);
  const [purchaseScrollWidth, setPurchaseScrollWidth] = useState(PURCHASE_TABLE_MIN_WIDTH);
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("q") ?? "";
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [currencyFilter, setCurrencyFilter] = useState(searchParams.get("currency") ?? "");
  const [startDate, setStartDate] = useState(searchParams.get("startDate") ?? "");
  const [endDate, setEndDate] = useState(searchParams.get("endDate") ?? "");
  const [q, setQ] = useState(urlSearch);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showForm, setShowForm] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<number | null>(null);
  const [form, setForm] = useState<NewPurchaseForm>(emptyForm());
  const [partyQuery, setPartyQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQ(urlSearch);
  }, [urlSearch]);

  const { data: purchases, refetch: refetchPurchases } = useQuery({
    queryKey: ["purchases", statusFilter, currencyFilter, startDate, endDate, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (currencyFilter) params.set("currency", currencyFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (q) params.set("q", q);
      const query = params.toString();
      return api.get<Purchase[]>(`/purchases${query ? `?${query}` : ""}`);
    },
  });

  const displayPurchases = useMemo(
    () => (purchases ?? []).filter((purchase) => purchase.status !== "cancelled"),
    [purchases],
  );

  const focusedSupplierId = useMemo(() => {
    if (!displayPurchases.length) return null;
    const supplierIds = new Set(displayPurchases.map((purchase) => purchase.supplierPartyId));
    if (supplierIds.size !== 1) return null;
    const supplier = displayPurchases[0]?.supplier;
    const needle = q.trim().toLowerCase();
    const supplierMatchesSearch =
      !needle ||
      [supplier?.name, supplier?.phone1, supplier?.phone2, supplier?.address]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    return supplierMatchesSearch ? displayPurchases[0]!.supplierPartyId : null;
  }, [displayPurchases, q]);

  const { data: focusedSupplierLedger, refetch: refetchFocusedSupplierLedger } = useQuery({
    queryKey: ["purchase-list-party-ledger", focusedSupplierId, currencyFilter, startDate, endDate],
    enabled: focusedSupplierId != null,
    queryFn: () => {
      const params = new URLSearchParams();
      if (currencyFilter) params.set("currency", currencyFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const query = params.toString();
      return api.get<PartyLedgerResponse>(`/parties/${focusedSupplierId}/ledger${query ? `?${query}` : ""}`);
    },
  });

  const { data: purchaseItemTotalRows, refetch: refetchPurchaseItemTotals } = useQuery({
    queryKey: ["purchase-item-total-rows", currencyFilter, startDate, endDate, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (currencyFilter) params.set("currency", currencyFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (q) params.set("q", q);
      const query = params.toString();
      return api.get<Purchase[]>(`/purchases${query ? `?${query}` : ""}`);
    },
  });

  useEffect(() => {
    if (viewMode !== "list") return;
    const updateScrollWidth = () => {
      const bodyWidth = bodyTableScrollRef.current?.scrollWidth ?? 0;
      const tableWidth = purchaseTableRef.current?.scrollWidth ?? 0;
      setPurchaseScrollWidth(Math.max(PURCHASE_TABLE_MIN_WIDTH, bodyWidth, tableWidth));
    };
    updateScrollWidth();
    const observer = new ResizeObserver(updateScrollWidth);
    if (bodyTableScrollRef.current) observer.observe(bodyTableScrollRef.current);
    if (purchaseTableRef.current) observer.observe(purchaseTableRef.current);
    window.addEventListener("resize", updateScrollWidth);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScrollWidth);
    };
  }, [displayPurchases, viewMode]);

  const { data: suppliers } = useQuery({
    queryKey: ["parties-search-supplier", partyQuery],
    queryFn: () => api.get<Party[]>(`/parties?type=supplier${partyQuery ? `&q=${encodeURIComponent(partyQuery)}` : ""}`),
    enabled: showForm,
  });

  const computedTotal = useMemo(() => multiplyDecimal(form.quantity, form.unitPrice), [form.quantity, form.unitPrice]);

  const effectivePurchaseFinancials = useMemo(() => {
    const financials = new Map<number, { paid: string; balance: string }>();
    const visiblePurchases = [...displayPurchases].sort((a, b) => {
        const byDate = a.purchaseDate.localeCompare(b.purchaseDate);
        return byDate !== 0 ? byDate : a.id - b.id;
      });
    if (!visiblePurchases.length) return financials;
    for (const purchase of visiblePurchases) {
      const paid = subtractDecimal(purchase.totalAmount, purchase.balance ?? "0");
      financials.set(purchase.id, { paid, balance: purchase.balance ?? "0" });
    }
    return financials;
  }, [displayPurchases]);

  const itemTotals = useMemo(() => {
    const totals = new Map<string, { itemName: string; unitOfMeasure: string | null; quantity: string }>();
    for (const purchase of purchaseItemTotalRows ?? []) {
      if (purchase.status === "cancelled") continue;
      const itemName = purchase.itemName.trim() || "نامعلوم جنس";
      const unitOfMeasure = purchase.unitOfMeasure ?? null;
      const key = `${itemName.toLowerCase()}::${unitOfMeasure ?? ""}`;
      const previous = totals.get(key);
      const netQuantity = purchaseNetQuantity(purchase);
      totals.set(key, {
        itemName,
        unitOfMeasure,
        quantity: previous ? addDecimal(previous.quantity, netQuantity) : netQuantity,
      });
    }
    return Array.from(totals.values()).filter((item) => decimalSign(item.quantity) !== 0);
  }, [purchaseItemTotalRows]);

  function resetForm() {
    setEditingPurchaseId(null);
    setForm(emptyForm());
    setPartyQuery("");
    setError(null);
  }

  function openCreateForm() {
    resetForm();
    setShowForm(true);
  }

  function openEditForm(purchase: Purchase) {
    setEditingPurchaseId(purchase.id);
    setForm({
      supplierPartyId: purchase.supplierPartyId,
      purchaseNumber: purchaseDisplayNumber(purchase),
      purchaseDate: purchase.purchaseDate,
      itemName: purchase.itemName,
      quantity: purchase.quantity,
      unitOfMeasure: purchase.unitOfMeasure ?? "",
      unitPrice: purchase.unitPrice,
      currencyCode: purchase.currencyCode,
      notes: purchase.notes ?? "",
    });
    setPartyQuery(purchase.supplier?.name ?? "");
    setError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    resetForm();
  }

  function showPurchaseInCurrentList(purchase: Purchase) {
    setStatusFilter("");
    setCurrencyFilter("");
    setQ("");
    const purchaseDate = purchase.purchaseDate?.slice(0, 10);
    if (!purchaseDate) return;
    if (!startDate || purchaseDate < startDate) setStartDate(purchaseDate);
    if (!endDate || purchaseDate > endDate) setEndDate(purchaseDate);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const validationError = purchaseValidationError();
      if (validationError) throw new Error(validationError);
      const body = {
        purchaseNumber: form.purchaseNumber,
        supplierPartyId: form.supplierPartyId as number,
        purchaseDate: form.purchaseDate,
        itemName: form.itemName,
        quantity: form.quantity,
        unitOfMeasure: form.unitOfMeasure || null,
        unitPrice: form.unitPrice,
        currencyCode: form.currencyCode,
        notes: form.notes || null,
      };
      if (editingPurchaseId) return api.put<Purchase>(`/purchases/${editingPurchaseId}`, body);
      return api.post<Purchase>("/purchases", body);
    },
    onSuccess: (purchase) => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["purchase-item-total-rows"] });
      qc.invalidateQueries({ queryKey: ["purchase"] });
      qc.invalidateQueries({ queryKey: ["party-ledger"] });
      qc.invalidateQueries({ queryKey: ["party-ledger-total"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      showPurchaseInCurrentList(purchase);
      closeForm();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "ناکامي"),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => api.post<Purchase>(`/purchases/${id}/delete`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["purchase-item-total-rows"] });
      qc.invalidateQueries({ queryKey: ["party-ledger"] });
      qc.invalidateQueries({ queryKey: ["party-ledger-total"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["trash"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "حذف ناکام شو"),
  });

  function deletePurchase(purchase: Purchase) {
    const reason = window.prompt("د حذف دلیل ولیکئ:");
    if (!reason?.trim()) return;
    deleteMutation.mutate({ id: purchase.id, reason: reason.trim() });
  }

  function purchaseValidationError(): string | null {
    if (!form.supplierPartyId) {
      return partyQuery.trim()
        ? "د مشتری نوم باید د لیست څخه وټاکل شي. که نوی مشتری وي، لومړی یې د مشتریانو په برخه کې جوړ کړئ."
        : "د اجناسو د خریداري مشتری اړین دی.";
    }
    if (!form.purchaseNumber.trim()) return "بیل نمبر اړین دی.";
    if (!form.itemName.trim()) return "د جنس نوم اړین دی.";
    if (decimalSign(form.quantity) <= 0) return "مقدار باید تر صفر زیات وي.";
    if (decimalSign(form.unitPrice) <= 0) return "قیمت باید تر صفر زیات وي.";
    if (!form.unitOfMeasure.trim()) return "د مقدار نوع اړین دی.";
    if (!form.purchaseDate.trim()) return "نېټه اړینه ده.";
    if (!form.currencyCode.trim()) return "اسعار اړین دي.";
    if (decimalSign(computedTotal) <= 0) return "مجموعه باید تر صفر زیاته وي.";
    return null;
  }

  function submitPurchase() {
    const validationError = purchaseValidationError();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    saveMutation.mutate();
  }

  function handlePurchaseCellKeyDown(event: KeyboardEvent<HTMLElement>) {
    if ((event.key !== "Enter" && event.key !== "Tab") || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const fields = Array.from(document.querySelectorAll<HTMLElement>("[data-purchase-entry-cell]"))
      .filter((field) => !field.hasAttribute("disabled") && field.getAttribute("aria-hidden") !== "true");
    const currentIndex = fields.indexOf(event.currentTarget);
    const next = fields[currentIndex + 1] ?? fields[0];
    next?.focus();
  }

  function chooseSupplier(supplier: Party) {
    setForm((current) => ({ ...current, supplierPartyId: supplier.id }));
    setPartyQuery(supplier.name);
  }

  function handleSupplierSearchChange(value: string) {
    setPartyQuery(value);
    const selectedSupplier = suppliers?.find((supplier) => supplier.id === form.supplierPartyId);
    if (!selectedSupplier || selectedSupplier.name !== value) {
      setForm((current) => ({ ...current, supplierPartyId: null }));
    }
  }

  function handleSupplierSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (
      (event.key === "Enter" || event.key === "Tab") &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !form.supplierPartyId &&
      suppliers?.[0]
    ) {
      chooseSupplier(suppliers[0]);
    }
    handlePurchaseCellKeyDown(event);
  }

  function syncPurchaseTableScroll(event: UIEvent<HTMLDivElement>, targetRef: { current: HTMLDivElement | null }) {
    const target = targetRef.current;
    if (!target || target.scrollLeft === event.currentTarget.scrollLeft) return;
    target.scrollLeft = event.currentTarget.scrollLeft;
  }

  function findByDateRange() {
    void refetchPurchases();
    void refetchPurchaseItemTotals();
    if (focusedSupplierId != null) void refetchFocusedSupplierLedger();
  }

  return (
    <div>
      <PrintHeader title="د اجناسو خرید کهاته" />

      <div className="page-header">
        <div>
          <p className="page-title" style={{ margin: 0 }}>د اجناسو خرید</p>
          <p className="page-sub">د اجناسو خریداري، د عرضه کوونکو حسابونه او د بیلونو لټون</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <button className="btn btn-outline" onClick={() => window.print()}>
            <Printer size={16} /> چاپ
          </button>
          <button className="btn btn-primary" onClick={openCreateForm}>
            <Plus size={16} /> د اجناسو خرید
          </button>
        </div>
      </div>

      <div className="card no-print purchase-filter-card" style={{ padding: 16, margin: "16px 0", display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["", "open", "paid"].map((s) => (
            <button key={s} className={`btn btn-sm ${statusFilter === s ? "btn-primary" : "btn-outline"}`} onClick={() => setStatusFilter(s)}>
              {s ? STATUS_LABELS[s as PurchaseStatus] : "ټول"}
            </button>
          ))}
        </div>
        <div>
          <label className="form-label">حساب ډول</label>
          <select className="form-input" value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)} style={{ width: 150 }}>
            <option value="">ټول اسعار</option>
            <option value="AFN">افغانی</option>
            <option value="USD">ډالر</option>
            <option value="PKR">کلداره</option>
          </select>
        </div>
        <div>
          <label className="form-label">شروع تاریخ</label>
          <ShamsiDateInput className="form-input" value={startDate} onChange={setStartDate} style={{ width: 150 }} />
        </div>
        <div>
          <label className="form-label">ختم تاریخ</label>
          <ShamsiDateInput className="form-input" value={endDate} onChange={setEndDate} style={{ width: 150 }} />
        </div>
        <DateFilterButton onClick={findByDateRange} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <label className="form-label filter-search-label">لټون</label>
          <input className="form-input" value={q} onChange={(event) => setQ(event.target.value)} placeholder="جنس، مشتری، بیل نمبر یا یادداشت..." />
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="list-grid purchase-list-grid">
          {displayPurchases.map((purchase, index) => {
            const financial = effectivePurchaseFinancials.get(purchase.id);
            const balance = financial?.balance ?? purchase.balance ?? "0";
            return (
              <div
                key={purchase.id}
                className="list-card purchase-entry-card"
                style={{ color: "inherit", animationDelay: `${Math.min(index, 8) * 18}ms` }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                  <Link to={`/purchases/${purchase.id}`} style={{ color: "inherit", fontWeight: 900, textDecoration: "none" }}>{purchase.itemName}</Link>
                  <div className={`badge ${STATUS_BADGES[purchase.status]}`}>{STATUS_LABELS[purchase.status]}</div>
                </div>
                <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
                  {purchase.supplier?.name ?? "—"} / <JalaliDate date={purchase.purchaseDate} />
                </div>
                <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                  <span>مقدار: {purchase.quantity} {purchase.unitOfMeasure ?? ""}</span>
                  <span>بیل نمبر: {visibleText(purchaseDisplayNumber(purchase), `بیل ${index + 1}`)}</span>
                  <span>قیمت: {purchase.unitPrice} {currencyLabel(purchase.currencyCode)}</span>
                  <span>مجموعه: {purchase.totalAmount} {currencyLabel(purchase.currencyCode)}</span>
                  <span>
                    الباقی: <strong style={{ color: purchaseBalanceColor(balance) }}>{purchaseBalanceDisplay(balance, purchase.currencyCode)}</strong>
                  </span>
                </div>
                <div className="purchase-row-actions" style={{ marginTop: 12 }}>
                  <Link className="btn btn-outline btn-sm purchase-ledger-button" to={purchaseLedgerUrl(purchase)} style={{ textDecoration: "none" }}>
                    <BookOpen size={14} /> کهاته لیدل
                  </Link>
                  <button className="btn btn-outline btn-sm" onClick={() => openEditForm(purchase)}>
                    <Edit2 size={14} /> اصلاح
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => deletePurchase(purchase)} disabled={deleteMutation.isPending || purchase.status === "cancelled"}>
                    <Trash2 size={14} /> حذف
                  </button>
                </div>
              </div>
            );
          })}
          {!displayPurchases.length && <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>تر اوسه هیڅ خریداري نشته.</div>}
        </div>
      ) : (
        <>
        <div
          className="purchase-table-top-scroll no-print"
          ref={topTableScrollRef}
          onScroll={(event) => syncPurchaseTableScroll(event, bodyTableScrollRef)}
        >
          <div style={{ width: purchaseScrollWidth, height: 1 }} />
        </div>
        <div
          className="card elevated-card purchase-list-surface"
          ref={bodyTableScrollRef}
          onScroll={(event) => syncPurchaseTableScroll(event, topTableScrollRef)}
          style={{ padding: 0, overflow: "auto" }}
        >
          <table ref={purchaseTableRef} className="fl-table purchase-entry-table" style={{ minWidth: PURCHASE_TABLE_MIN_WIDTH, fontSize: 13 }}>
            <thead>
              <tr>
                <th>شماره</th>
                <th>تاریخ</th>
                <th>مشتری نوم</th>
                <th>جنس نوم</th>
                <th>بیل نمبر</th>
                <th>مقدار</th>
                <th>قیمت</th>
                <th>مجموعه</th>
                <th>رسید</th>
                <th>الباقی</th>
                <th>حالت</th>
                <th className="no-print">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {displayPurchases.map((p, index) => {
                const financial = effectivePurchaseFinancials.get(p.id);
                const paid = financial?.paid ?? subtractDecimal(p.totalAmount, p.balance ?? "0");
                const balance = financial?.balance ?? p.balance ?? "0";
                return (
                  <tr key={p.id} className="purchase-entry-row" style={{ animationDelay: `${Math.min(index, 8) * 18}ms` }}>
                    <td>{index + 1}</td>
                    <td style={{ whiteSpace: "nowrap", color: "var(--muted)" }}><JalaliDate date={p.purchaseDate} /></td>
                    <td>{p.supplier?.name ?? "—"}</td>
                    <td>{p.itemName}</td>
                    <td>
                      <Link to={`/purchases/${p.id}`} style={{ color: "var(--primary)", fontWeight: 800, textDecoration: "none" }}>
                        {visibleText(purchaseDisplayNumber(p), `بیل ${index + 1}`)}
                      </Link>
                    </td>
                    <td>{p.quantity} {p.unitOfMeasure ?? ""}</td>
                    <td>{p.unitPrice} {currencyLabel(p.currencyCode)}</td>
                    <td style={{ color: "var(--text)", fontWeight: 900 }}>{p.totalAmount} {currencyLabel(p.currencyCode)}</td>
                    <td style={{ color: "var(--success)", fontWeight: 800 }}>{paid} {currencyLabel(p.currencyCode)}</td>
                    <td style={{ color: purchaseBalanceColor(balance), fontWeight: 900 }}>{purchaseBalanceDisplay(balance, p.currencyCode)}</td>
                    <td><span className={`badge ${STATUS_BADGES[p.status]}`}>{STATUS_LABELS[p.status]}</span></td>
                    <td className="no-print">
                      <div className="purchase-row-actions">
                        <Link className="btn btn-outline btn-sm purchase-ledger-button" to={purchaseLedgerUrl(p)} style={{ textDecoration: "none" }}>
                          <BookOpen size={14} /> کهاته لیدل
                        </Link>
                        <button className="btn btn-outline btn-sm" onClick={() => openEditForm(p)}>
                          <Edit2 size={14} /> اصلاح
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => deletePurchase(p)} disabled={deleteMutation.isPending || p.status === "cancelled"}>
                          <Trash2 size={14} /> حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!displayPurchases.length && (
                <tr><td colSpan={12} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>تر اوسه هیڅ خریداري نشته.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {itemTotals.length ? (
        <div className="card purchase-item-totals-card">
          <table className="fl-table purchase-item-totals-table" style={{ fontSize: 15 }}>
            <thead>
              <tr>
                <th colSpan={2}>د خرید سوی اجناس تعداد</th>
              </tr>
            </thead>
            <tbody>
              {itemTotals.map((total) => (
                <tr key={`${total.itemName}-${total.unitOfMeasure ?? ""}`}>
                  <td className="purchase-item-name-cell">ټول {total.itemName}</td>
                  <td className="purchase-item-total-cell">{total.quantity}{total.unitOfMeasure ? ` ${total.unitOfMeasure}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {showForm && (
        <div className="modal-backdrop" onClick={closeForm}>
          <div className="card modal-card purchase-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Plus size={18} /> {editingPurchaseId ? "د اجناسو خرید اصلاح" : "د اجناسو خرید ثبتول"}
              </span>
              <button className="btn btn-outline btn-sm" onClick={closeForm}><X size={14} /></button>
            </div>
            {error && (
              <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                {error}
              </div>
            )}
            <div className="purchase-modal-form">
              <div>
                <label className="form-label">{requiredLabel("مشتری نوم")}</label>
                <input
                  className="form-input"
                  data-purchase-entry-cell
                  placeholder="نوم، نمبر یا ادرس ولیکئ..."
                  value={partyQuery}
                  onChange={(event) => handleSupplierSearchChange(event.target.value)}
                  onKeyDown={handleSupplierSearchKeyDown}
                />
                <select
                  required
                  className="form-input"
                  data-purchase-entry-cell
                  style={{ marginTop: 6 }}
                  value={form.supplierPartyId ?? ""}
                  onChange={(event) => {
                    const supplier = suppliers?.find((item) => item.id === Number(event.target.value));
                    if (supplier) {
                      chooseSupplier(supplier);
                    } else {
                      setForm((current) => ({ ...current, supplierPartyId: null }));
                    }
                  }}
                  onKeyDown={handlePurchaseCellKeyDown}
                >
                  <option value="">-- خرید کونکي وټاکئ --</option>
                  {form.supplierPartyId && !suppliers?.some((supplier) => supplier.id === form.supplierPartyId) ? (
                    <option value={form.supplierPartyId}>{partyQuery || `مشتری ${form.supplierPartyId}`}</option>
                  ) : null}
                  {suppliers?.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}{supplier.phone1 ? ` - ${supplier.phone1}` : ""}
                    </option>
                  ))}
                </select>
                {suppliers && suppliers.length === 0 ? (
                  <div style={{ marginTop: 8, color: "var(--danger)", fontSize: 13, fontWeight: 800 }}>
                    د اجناسو د خریداري مشتری نشته؛ لومړی یې د مشتریانو په برخه کې جوړ کړئ.
                  </div>
                ) : null}
              </div>
              <div>
                <label className="form-label">{requiredLabel("بیل نمبر")}</label>
                <input required className="form-input" data-purchase-entry-cell value={form.purchaseNumber} onChange={(e) => setForm((f) => ({ ...f, purchaseNumber: e.target.value }))} onKeyDown={handlePurchaseCellKeyDown} />
              </div>
              <div>
                <label className="form-label">{requiredLabel("جنس نوم")}</label>
                <input required className="form-input" data-purchase-entry-cell value={form.itemName} onChange={(e) => setForm((f) => ({ ...f, itemName: e.target.value }))} onKeyDown={handlePurchaseCellKeyDown} />
              </div>
              <div className="purchase-form-calc-grid">
                <div>
                  <label className="form-label">{requiredLabel("مقدار")}</label>
                  <input required className="form-input" data-purchase-entry-cell type="text" inputMode="decimal" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} onKeyDown={handlePurchaseCellKeyDown} />
                </div>
                <div>
                  <label className="form-label">{requiredLabel("قیمت")}</label>
                  <input required className="form-input" data-purchase-entry-cell type="text" inputMode="decimal" value={form.unitPrice} onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))} onKeyDown={handlePurchaseCellKeyDown} />
                </div>
                <div>
                  <label className="form-label">مجموعه</label>
                  <div className="purchase-total-preview" title="مقدار × قیمت = مجموعه">
                    <Calculator size={16} />
                    <span>{computedTotal || "0"}</span>
                  </div>
                </div>
              </div>
              <div className="purchase-form-meta-grid">
                <div>
                  <label className="form-label">{requiredLabel("مقدار نوع")}</label>
                  <input required className="form-input" data-purchase-entry-cell placeholder="دانه، کیلو..." value={form.unitOfMeasure} onChange={(e) => setForm((f) => ({ ...f, unitOfMeasure: e.target.value }))} onKeyDown={handlePurchaseCellKeyDown} />
                </div>
                <div>
                  <label className="form-label">نېټه</label>
                  <ShamsiDateInput className="form-input" data-purchase-entry-cell value={form.purchaseDate} onChange={(purchaseDate) => setForm((f) => ({ ...f, purchaseDate }))} onKeyDown={handlePurchaseCellKeyDown} />
                </div>
                <div>
                  <label className="form-label">{requiredLabel("اسعار")}</label>
                  <select required className="form-input" data-purchase-entry-cell value={form.currencyCode} onChange={(e) => setForm((f) => ({ ...f, currencyCode: e.target.value }))} onKeyDown={handlePurchaseCellKeyDown}>
                    <option value="AFN">افغانی</option>
                    <option value="USD">ډالر</option>
                    <option value="PKR">کلداره</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">یادداشتونه</label>
                <textarea className="form-input" data-purchase-entry-cell rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} onKeyDown={handlePurchaseCellKeyDown} style={{ height: 62, padding: "8px 12px" }} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" disabled={saveMutation.isPending} onClick={submitPurchase}>
                {editingPurchaseId ? "ساتل" : "ثبتول"}
              </button>
              <button className="btn btn-outline" onClick={closeForm}>لغوه</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
