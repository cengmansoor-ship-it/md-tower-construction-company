import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, BookOpen, Edit2, Lock, Printer, Save, Search, Trash2, Unlock, UserPlus, X } from "lucide-react";
import { api, ApiError, type Party, type PartyType, type Purchase } from "../lib/api";
import ShamsiDateInput from "../components/ShamsiDateInput";
import DateFilterButton from "../components/DateFilterButton";
import ViewModeToggle, { type ViewMode } from "../components/ViewModeToggle";
import { isValidOptionalPhone, phoneDigits, phoneRestrictionMessage } from "../lib/phone";
import PrintHeader from "../components/PrintHeader";

const TYPE_LABELS: Record<PartyType, string> = {
  individual_customer: "بازار / انفرادي مشتری",
  market_customer: "بازار / انفرادي مشتری",
  supplier: "د اجناسو د خریداري مشتری",
  sales_customer: "د فروش مشتری",
  tenant: "کرایه دار",
  exchange_dealer: "صرافي مشتری",
  employee: "کارکوونکی",
  partner: "شریک / حاجي صاحب",
  other: "نور",
};

const FORM_TYPE_OPTIONS: Array<{ value: PartyType; label: string }> = [
  { value: "market_customer", label: "بازار / انفرادي مشتری" },
  { value: "supplier", label: "د اجناسو د خریداري مشتری" },
  { value: "sales_customer", label: "د فروش مشتری" },
  { value: "tenant", label: "کرایه دار" },
  { value: "exchange_dealer", label: "صرافي مشتری" },
  { value: "employee", label: "کارکوونکی" },
  { value: "partner", label: "شریک / حاجي صاحب" },
  { value: "other", label: "نور" },
];

const FILTER_OPTIONS = [
  { value: "", label: "ټول ډولونه" },
  { value: "market_individual", label: "بازار / انفرادي مشتریان" },
  { value: "supplier", label: "د اجناسو د خریداري مشتریان" },
  { value: "sales_customer", label: "د فروش مشتریان" },
  { value: "exchange_dealer", label: "صرافي مشتریان" },
  { value: "tenant", label: "کرایه داران" },
  { value: "partner", label: "شریکان / حاجي صاحبان" },
  { value: "employee", label: "کارکوونکي" },
  { value: "other", label: "نور" },
];

const CURRENCIES = ["USD", "AFN", "PKR"] as const;

const PARTY_TONE_CLASSES: Record<PartyType, string> = {
  individual_customer: "party-tone-market",
  market_customer: "party-tone-market",
  supplier: "party-tone-supplier",
  sales_customer: "party-tone-sales",
  tenant: "party-tone-tenant",
  exchange_dealer: "party-tone-exchange",
  employee: "party-tone-employee",
  partner: "party-tone-partner",
  other: "party-tone-other",
};

function partyToneClass(type: PartyType): string {
  return PARTY_TONE_CLASSES[type] ?? "party-tone-other";
}

function defaultPartyTypeForFilter(typeFilter?: string): PartyType {
  if (typeFilter === "market_individual") return "market_customer";
  if (FORM_TYPE_OPTIONS.some((option) => option.value === typeFilter)) return typeFilter as PartyType;
  return "market_customer";
}

const COMPANY_NAME_TYPES: PartyType[] = ["supplier", "exchange_dealer", "market_customer", "individual_customer"];

function usesCompanyName(type: PartyType): boolean {
  return COMPANY_NAME_TYPES.includes(type);
}

function emptyForm(typeFilter?: string) {
  return {
    type: defaultPartyTypeForFilter(typeFilter),
    name: "",
    companyName: "",
    fatherName: "",
    grandfatherName: "",
    tazkiraNumber: "",
    phone1: "",
    phone2: "",
    address: "",
    notes: "",
  };
}

type PartyForm = ReturnType<typeof emptyForm>;

function formFromParty(party: Party): PartyForm {
  return {
    type: party.type,
    name: party.name,
    companyName: party.companyName ?? "",
    fatherName: party.fatherName ?? "",
    grandfatherName: party.grandfatherName ?? "",
    tazkiraNumber: party.tazkiraNumber ?? "",
    phone1: party.phone1 ?? "",
    phone2: party.phone2 ?? "",
    address: party.address ?? "",
    notes: party.notes ?? "",
  };
}

function partyFormPayload(form: PartyForm) {
  return {
    ...form,
    companyName: form.companyName || null,
    fatherName: form.fatherName || null,
    grandfatherName: form.grandfatherName || null,
    tazkiraNumber: form.tazkiraNumber || null,
    phone1: form.phone1 || null,
    phone2: form.phone2 || null,
    address: form.address || null,
    notes: form.notes || null,
  };
}

function partyPhoneError(form: PartyForm): string | null {
  if (!isValidOptionalPhone(form.phone1)) return phoneRestrictionMessage("تماس شمېره");
  if (!isValidOptionalPhone(form.phone2)) return phoneRestrictionMessage("دوهم تماس");
  return null;
}

function decimalSign(value?: string | null): -1 | 0 | 1 {
  const normalized = (value ?? "0").trim();
  if (/^-?0*(?:\.0*)?$/.test(normalized)) return 0;
  return normalized.startsWith("-") ? -1 : 1;
}

function absDecimal(value?: string | null): string {
  const normalized = (value ?? "0").trim();
  return normalized.startsWith("-") ? normalized.slice(1) : normalized;
}

function addDecimal(a: string, b: string): string {
  const [, af = ""] = a.replace("-", "").split(".");
  const [, bf = ""] = b.replace("-", "").split(".");
  const scale = Math.max(af.length, bf.length);
  const toBig = (value: string) => {
    const negative = value.trim().startsWith("-");
    const [whole, frac = ""] = value.replace("-", "").split(".");
    const digits = `${whole || "0"}${frac.padEnd(scale, "0")}`.replace(/^0+(?=\d)/, "") || "0";
    return (negative ? -1n : 1n) * BigInt(digits);
  };
  const total = toBig(a || "0") + toBig(b || "0");
  const negative = total < 0n;
  const absolute = negative ? -total : total;
  if (scale === 0) return `${negative ? "-" : ""}${absolute.toString()}`;
  const padded = absolute.toString().padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale) || "0";
  const fraction = padded.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function negateDecimal(value: string | null | undefined): string {
  const normalized = String(value ?? "0").trim();
  if (!normalized || /^0*(?:\.0*)?$/.test(normalized)) return "0";
  return normalized.startsWith("-") ? normalized.slice(1) : `-${normalized}`;
}

function subtractDecimal(left: string | null | undefined, right: string | null | undefined): string {
  return addDecimal(String(left ?? "0"), negateDecimal(right));
}

function purchaseReturnedQuantity(purchase: Purchase): string {
  return (purchase.returns ?? []).reduce((sum, ret) => addDecimal(sum, ret.quantity), "0");
}

function purchaseNetQuantity(purchase: Purchase): string {
  return subtractDecimal(purchase.quantity, purchaseReturnedQuantity(purchase));
}

function BalanceCell({ value }: { value?: string }) {
  const sign = decimalSign(value);
  return (
    <td style={{ color: sign < 0 ? "var(--danger)" : sign > 0 ? "var(--success)" : "var(--text)", fontWeight: sign === 0 ? 500 : 800, direction: "ltr", textAlign: "center" }}>
      {sign < 0 ? absDecimal(value) : value ?? "0"}
    </td>
  );
}

export default function PartiesPage() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") ?? "");
  const [startDate, setStartDate] = useState(searchParams.get("startDate") ?? "");
  const [endDate, setEndDate] = useState(searchParams.get("endDate") ?? "");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Party[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [editForm, setEditForm] = useState<PartyForm>(emptyForm());

  useEffect(() => {
    setQ(searchParams.get("q") ?? "");
    setTypeFilter(searchParams.get("type") ?? "");
    setStartDate(searchParams.get("startDate") ?? "");
    setEndDate(searchParams.get("endDate") ?? "");
  }, [searchParams]);

  useEffect(() => {
    document.body.classList.add("parties-print-route");
    return () => document.body.classList.remove("parties-print-route");
  }, []);

  const { data: parties, refetch: refetchParties } = useQuery({
    queryKey: ["parties", q, typeFilter, startDate, endDate, "with-balances"],
    queryFn: () => {
      const params = new URLSearchParams({ withBalances: "1" });
      if (q) params.set("q", q);
      if (typeFilter) params.set("type", typeFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      return api.get<Party[]>(`/parties?${params.toString()}`);
    },
  });

  const showSupplierPurchaseItemTotals = typeFilter === "supplier";
  const { data: supplierPurchaseRows } = useQuery({
    queryKey: ["supplier-party-purchase-item-totals", q, startDate, endDate, showSupplierPurchaseItemTotals],
    enabled: showSupplierPurchaseItemTotals,
    queryFn: () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const query = params.toString();
      return api.get<Purchase[]>(`/purchases${query ? `?${query}` : ""}`);
    },
  });

  const visibleSupplierIds = useMemo(() => new Set((parties ?? []).filter((party) => party.type === "supplier").map((party) => party.id)), [parties]);
  const supplierPurchaseItemTotals = useMemo(() => {
    const totals = new Map<string, { itemName: string; unitOfMeasure: string | null; quantity: string }>();
    for (const purchase of supplierPurchaseRows ?? []) {
      if (purchase.status === "cancelled") continue;
      if (!visibleSupplierIds.has(purchase.supplierPartyId)) continue;
      const itemName = purchase.itemName.trim() || "نامعلوم جنس";
      const key = `${itemName}::${purchase.unitOfMeasure ?? ""}`;
      const previous = totals.get(key) ?? { itemName, unitOfMeasure: purchase.unitOfMeasure ?? null, quantity: "0" };
      previous.quantity = addDecimal(previous.quantity, purchaseNetQuantity(purchase));
      totals.set(key, previous);
    }
    return Array.from(totals.values()).filter((item) => decimalSign(item.quantity) !== 0);
  }, [supplierPurchaseRows, visibleSupplierIds]);

  const summary = useMemo(() => {
    const totals: Record<string, { debt: string; receivable: string }> = {};
    for (const code of CURRENCIES) totals[code] = { debt: "0", receivable: "0" };
    for (const party of parties ?? []) {
      for (const code of CURRENCIES) {
        const value = party.balances?.[code] ?? "0";
        const sign = decimalSign(value);
        if (sign < 0) totals[code].debt = addDecimal(totals[code].debt, absDecimal(value));
        if (sign > 0) totals[code].receivable = addDecimal(totals[code].receivable, value);
      }
    }
    return totals;
  }, [parties]);

  function updateFilters(next: { q?: string; type?: string; startDate?: string; endDate?: string }) {
    const params = new URLSearchParams(searchParams);
    const nextQ = next.q ?? q;
    const nextType = next.type ?? typeFilter;
    const nextStartDate = next.startDate ?? startDate;
    const nextEndDate = next.endDate ?? endDate;
    if (nextQ) params.set("q", nextQ);
    else params.delete("q");
    if (nextType) params.set("type", nextType);
    else params.delete("type");
    if (nextStartDate) params.set("startDate", nextStartDate);
    else params.delete("startDate");
    if (nextEndDate) params.set("endDate", nextEndDate);
    else params.delete("endDate");
    setSearchParams(params);
  }

  function findByDateRange() {
    updateFilters({ startDate, endDate });
    void refetchParties();
  }

  const phoneError = partyPhoneError(form);
  const editPhoneError = editingParty ? partyPhoneError(editForm) : null;

  async function checkDuplicates(name: string) {
    if (!name.trim()) {
      setDuplicates([]);
      return;
    }
    try {
      const matches = await api.get<Party[]>(`/parties/duplicate-check?name=${encodeURIComponent(name.trim())}`);
      setDuplicates(matches);
    } catch (err) {
      setDuplicates([]);
      if (err instanceof ApiError && err.status === 401) {
        setError("ستاسې ناسته پای ته رسېدلې ده؛ مهرباني وکړئ بیا ننوزئ.");
        return;
      }
      setError(err instanceof Error ? err.message : "د ورته نومونو پلټنه ناکامه شوه");
    }
  }

  const createMutation = useMutation({
    mutationFn: () => api.post<Party>("/parties", partyFormPayload(form)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parties"] });
      setForm(emptyForm());
      setDuplicates([]);
      setError(null);
      setShowForm(false);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "ثبت ناکام شو"),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingParty) throw new Error("مشتری انتخاب نه دی");
      return api.put<Party>(`/parties/${editingParty.id}`, partyFormPayload(editForm));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parties"] });
      if (editingParty) qc.invalidateQueries({ queryKey: ["party", String(editingParty.id)] });
      setEditingParty(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "ایډیټ ناکام شو"),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ party, reason }: { party: Party; reason: string }) => api.post<Party>(`/parties/${party.id}/delete`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setError(null);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "ډیلیټ ناکام شو"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (party: Party) => api.put<Party>(`/parties/${party.id}`, { isActive: !party.isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parties"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "د کهاتې حالت بدل نه شو"),
  });

  function togglePartyActive(party: Party) {
    toggleActiveMutation.mutate(party);
  }

  function startEditParty(party: Party) {
    setEditingParty(party);
    setEditForm(formFromParty(party));
    setError(null);
  }

  function deleteParty(party: Party) {
    const reason = window.prompt("د حذف دلیل ولیکئ:", "غلط یا اړتیا نه لرونکی مشتری");
    if (!reason?.trim()) return;
    deleteMutation.mutate({ party, reason: reason.trim() });
  }

  function renderPartyActions(party: Party) {
    return (
      <div className="no-print" style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        <Link className="btn btn-outline btn-sm" to={`/parties/${party.id}`} style={{ textDecoration: "none", fontWeight: 900, whiteSpace: "nowrap" }}>
          <BookOpen size={13} /> کهاته لیدل
        </Link>
        <button className="btn btn-outline btn-sm" type="button" onClick={() => startEditParty(party)} style={{ whiteSpace: "nowrap", fontWeight: 900 }}>
          <Edit2 size={13} /> ایډیټ
        </button>
        <button className="btn btn-outline btn-sm" type="button" onClick={() => deleteParty(party)} disabled={deleteMutation.isPending} style={{ whiteSpace: "nowrap", fontWeight: 900 }}>
          <Trash2 size={13} /> ډیلیټ
        </button>
        <button
          className={`btn btn-sm ${party.isActive ? "btn-outline" : "btn-primary"}`}
          onClick={() => togglePartyActive(party)}
          disabled={toggleActiveMutation.isPending}
          style={{ whiteSpace: "nowrap", fontWeight: 900 }}
        >
          {party.isActive ? <Lock size={13} /> : <Unlock size={13} />}
          {party.isActive ? "کهاته بندول" : "کهاته پرانستل"}
        </button>
      </div>
    );
  }

  const selectedFilterLabel = FILTER_OPTIONS.find((option) => option.value === typeFilter)?.label ?? "مشتریان";

  return (
    <div className="print-report-page">
      <PrintHeader title={`${selectedFilterLabel} راپور`} />
      <div className="page-header">
        <div>
          <h1 className="page-title">{selectedFilterLabel}</h1>
          <p className="page-sub">د مشتریانو ثبت، راجستر، لټون، کهات لیدل او تغیرات.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {typeFilter === "exchange_dealer" ? (
            <Link className="btn btn-outline" to="/exchange/transactions" style={{ textDecoration: "none", fontWeight: 900 }}>
              <ArrowLeftRight size={18} /> د صرافي راکړه/ورکړه
            </Link>
          ) : null}
          <button className="btn btn-outline" onClick={() => window.print()}>
            <Printer size={18} /> چاپ
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowForm((current) => {
                if (!current) {
                  setForm(emptyForm(typeFilter));
                  setError(null);
                  setDuplicates([]);
                }
                return !current;
              });
            }}
          >
            <UserPlus size={18} /> نوی مشتری
          </button>
        </div>
      </div>

      {error && !showForm && !editingParty && (
        <div className="no-print" style={{ color: "var(--danger)", fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {showForm && (
        <div className="card no-print" style={{ marginBottom: 24, borderRadius: 8 }}>
          <div className="card-header">د نوي مشتری معلومات</div>
          <div className="card-body">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14, marginBottom: 18 }}>
              <div>
                <label className="form-label">ډول</label>
                <select className="form-select" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as PartyType }))}>
                  {FORM_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              {[
                { key: "name", label: "نوم" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="form-label">{label}</label>
                  <input
                    className="form-input"
                    value={(form as Record<string, string>)[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    onBlur={key === "name" ? (e) => checkDuplicates(e.target.value) : undefined}
                  />
                </div>
              ))}
              {usesCompanyName(form.type) ? (
                <div>
                  <label className="form-label">د شرکت نوم</label>
                  <input className="form-input" value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} />
                </div>
              ) : (
                [
                  { key: "fatherName", label: "د پلار نوم" },
                  { key: "grandfatherName", label: "د نیکه نوم" },
                  { key: "tazkiraNumber", label: "تذکره شمېره" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="form-label">{label}</label>
                    <input
                      className="form-input"
                      value={(form as Record<string, string>)[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                ))
              )}
              {[
                { key: "phone1", label: "تماس شمېره" },
                { key: "phone2", label: "دوهم تماس" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="form-label">{label}</label>
                  <input
                    className="form-input"
                    inputMode={key === "phone1" || key === "phone2" ? "numeric" : undefined}
                    maxLength={key === "phone1" || key === "phone2" ? 10 : undefined}
                    pattern={key === "phone1" || key === "phone2" ? "\\d{10}" : undefined}
                    title={key === "phone1" || key === "phone2" ? phoneRestrictionMessage(label) : undefined}
                    value={(form as Record<string, string>)[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: key === "phone1" || key === "phone2" ? phoneDigits(e.target.value) : e.target.value }))}
                  />
                  {(key === "phone1" || key === "phone2") && !isValidOptionalPhone((form as Record<string, string>)[key]) ? (
                    <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>{phoneRestrictionMessage(label)}</div>
                  ) : null}
                </div>
              ))}
              <div style={{ gridColumn: "1/-1" }}>
                <label className="form-label">آدرس</label>
                <input className="form-input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label className="form-label">یادښت</label>
                <textarea className="form-input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={{ height: 78, padding: "12px 16px" }} />
              </div>
            </div>
            {duplicates.length > 0 && (
              <div style={{ background: "var(--warning-light)", color: "#92400E", padding: "12px 16px", borderRadius: 6, fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
                ورته نومونه: {duplicates.map((d) => d.name).join("، ")}
              </div>
            )}
            {phoneError && <div style={{ color: "var(--danger)", fontSize: 14, marginBottom: 16 }}>{phoneError}</div>}
            {error && <div style={{ color: "var(--danger)", fontSize: 14, marginBottom: 16 }}>{error}</div>}
            <div style={{ display: "flex", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 18 }}>
              <button className="btn btn-primary" onClick={() => createMutation.mutate()} disabled={!form.name.trim() || Boolean(phoneError) || createMutation.isPending}>ثبت</button>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>لغوه</button>
            </div>
          </div>
        </div>
      )}

      <div className="no-print" style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative", minWidth: 240, maxWidth: 420 }}>
          <Search size={18} style={{ position: "absolute", top: "50%", right: 16, transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }} />
          <input
            className="form-input"
            placeholder="لټون"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              updateFilters({ q: e.target.value });
            }}
            style={{ paddingRight: 44 }}
          />
        </div>
        <select
          className="form-select"
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            updateFilters({ type: e.target.value });
          }}
          style={{ width: 260 }}
        >
          {FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ShamsiDateInput
          className="form-input"
          placeholder="شروع تاریخ"
          value={startDate}
          onChange={(value) => {
            setStartDate(value);
            updateFilters({ startDate: value });
          }}
          style={{ width: 188 }}
        />
        <ShamsiDateInput
          className="form-input"
          placeholder="ختم تاریخ"
          value={endDate}
          onChange={(value) => {
            setEndDate(value);
            updateFilters({ endDate: value });
          }}
          style={{ width: 188 }}
        />
        <DateFilterButton onClick={findByDateRange} />
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>

      {viewMode === "grid" ? (
        <div className="list-grid">
          {parties?.map((party) => (
            <div key={party.id} className={`list-card party-card ${partyToneClass(party.type)}`}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start", marginBottom: 8 }}>
                <div style={{ fontWeight: 900 }}>{party.name}</div>
                <span className="party-type-chip">{TYPE_LABELS[party.type]}</span>
              </div>
              {usesCompanyName(party.type) && party.companyName ? (
                <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 4 }}>{party.companyName}</div>
              ) : party.type === "sales_customer" && party.fatherName ? (
                <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 4 }}>د پلار نوم: {party.fatherName}</div>
              ) : null}
              <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>{party.phone1 ?? party.phone2 ?? "—"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, textAlign: "center", fontSize: 12 }}>
                {CURRENCIES.map((code) => (
                  <div key={code} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
                    <div style={{ color: "var(--muted)" }}>{code === "AFN" ? "افغانی" : code === "USD" ? "ډالر" : "کلداره"}</div>
                    <strong>{party.balances?.[code] ?? "0"}</strong>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>{renderPartyActions(party)}</div>
            </div>
          ))}
          {parties?.length === 0 && <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>هیڅ مشتری ونه موندل شو.</div>}
        </div>
      ) : (
      <div className="card elevated-card print-report-surface" style={{ overflow: "auto", borderRadius: 8 }}>
        <table className="fl-table" style={{ minWidth: 1100, fontSize: 13 }}>
          <thead>
            <tr>
              <th rowSpan={2}>شمیره</th>
              <th rowSpan={2}>نوم</th>
              <th rowSpan={2}>تماس شمیره</th>
              <th colSpan={3}>حساب ډول</th>
              <th className="no-print" colSpan={4}>تګ لاره</th>
            </tr>
            <tr>
              <th>ډالر</th>
              <th>افغانی</th>
              <th>کلداره</th>
              <th className="no-print">کهات لیدل</th>
              <th className="no-print">ایډیټ</th>
              <th className="no-print">ډیلیټ</th>
              <th className="no-print">کهاته بندول/پرانستل</th>
            </tr>
          </thead>
          <tbody>
            {parties?.map((party, index) => (
              <tr key={party.id} className={`party-row ${partyToneClass(party.type)}`}>
                <td>{index + 1}</td>
                <td style={{ fontWeight: 800 }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <span>{party.name}</span>
                    {usesCompanyName(party.type) && party.companyName ? (
                      <span className="party-type-chip">{party.companyName}</span>
                    ) : party.type === "sales_customer" && party.fatherName ? (
                      <span className="party-type-chip">{party.fatherName}</span>
                    ) : null}
                    <span className="party-type-chip">{TYPE_LABELS[party.type]}</span>
                    <span className={`badge ${party.isActive ? "badge-success" : "badge-danger"}`} style={{ width: "fit-content" }}>
                      {party.isActive ? "پرانستی" : "بند"}
                    </span>
                  </div>
                </td>
                <td>{party.phone1 ?? party.phone2 ?? "—"}</td>
                <BalanceCell value={party.balances?.USD} />
                <BalanceCell value={party.balances?.AFN} />
                <BalanceCell value={party.balances?.PKR} />
                <td className="no-print">
                  <Link className="btn btn-outline btn-sm" to={`/parties/${party.id}`} style={{ textDecoration: "none", fontWeight: 900, whiteSpace: "nowrap" }}>
                    <BookOpen size={13} /> کهاته لیدل
                  </Link>
                </td>
                <td className="no-print">
                  <button className="btn btn-outline btn-sm" type="button" onClick={() => startEditParty(party)} style={{ whiteSpace: "nowrap", fontWeight: 900 }}>
                    <Edit2 size={13} /> ایډیټ
                  </button>
                </td>
                <td className="no-print">
                  <button className="btn btn-outline btn-sm" type="button" onClick={() => deleteParty(party)} disabled={deleteMutation.isPending} style={{ whiteSpace: "nowrap", fontWeight: 900 }}>
                    <Trash2 size={13} /> ډیلیټ
                  </button>
                </td>
                <td className="no-print">
                  <button className={`btn btn-sm ${party.isActive ? "btn-outline" : "btn-primary"}`} onClick={() => togglePartyActive(party)} disabled={toggleActiveMutation.isPending} style={{ whiteSpace: "nowrap", fontWeight: 900 }}>
                    {party.isActive ? <Lock size={13} /> : <Unlock size={13} />}
                    {party.isActive ? "کهاته بندول" : "کهاته پرانستل"}
                  </button>
                </td>
              </tr>
            ))}
            {parties?.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: "center", padding: 36, color: "var(--muted)" }}>هیڅ مشتری ونه موندل شو.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ background: "var(--surface-2)", fontWeight: 900 }}>
              <td colSpan={3}>ټوټل حساب:</td>
              {CURRENCIES.map((code) => (
                <td key={code} style={{ lineHeight: 1.8 }}>
                  <div style={{ color: "var(--danger)" }}>پور: {summary[code].debt}</div>
                  <div style={{ color: "var(--success)" }}>طلب: {summary[code].receivable}</div>
                </td>
              ))}
              <td className="no-print" colSpan={4}></td>
            </tr>
          </tfoot>
        </table>
      </div>
      )}

      {showSupplierPurchaseItemTotals ? (
        <div className="card purchase-item-totals-card" style={{ padding: 0, overflow: "hidden", marginTop: 18 }}>
          <table className="fl-table purchase-item-totals-table" style={{ fontSize: 15 }}>
            <thead>
              <tr>
                <th colSpan={2}>د خرید سوی اجناس تعداد</th>
              </tr>
            </thead>
            <tbody>
              {supplierPurchaseItemTotals.map((item) => (
                <tr key={`${item.itemName}-${item.unitOfMeasure ?? ""}`}>
                  <td className="purchase-item-name-cell">ټول {item.itemName}</td>
                  <td className="purchase-item-total-cell">
                    {item.quantity}{item.unitOfMeasure ? ` ${item.unitOfMeasure}` : ""}
                  </td>
                </tr>
              ))}
              {!supplierPurchaseItemTotals.length ? (
                <tr>
                  <td colSpan={2} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>تر اوسه خرید شوی اجناس نشته.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {editingParty && (
        <div className="modal-backdrop no-print" onClick={() => setEditingParty(null)}>
          <div className="card modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <span>د مشتری ایډیټ</span>
              <button className="btn btn-outline btn-sm" type="button" onClick={() => setEditingParty(null)}>
                <X size={14} />
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14, marginBottom: 18 }}>
              <div>
                <label className="form-label">ډول</label>
                <select className="form-select" value={editForm.type} onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value as PartyType }))}>
                  {FORM_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              {[
                { key: "name", label: "نوم" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="form-label">{label}</label>
                  <input
                    className="form-input"
                    value={(editForm as Record<string, string>)[key]}
                    onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
              {usesCompanyName(editForm.type) ? (
                <div>
                  <label className="form-label">د شرکت نوم</label>
                  <input className="form-input" value={editForm.companyName} onChange={(e) => setEditForm((f) => ({ ...f, companyName: e.target.value }))} />
                </div>
              ) : (
                [
                  { key: "fatherName", label: "د پلار نوم" },
                  { key: "grandfatherName", label: "د نیکه نوم" },
                  { key: "tazkiraNumber", label: "تذکره شمېره" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="form-label">{label}</label>
                    <input
                      className="form-input"
                      value={(editForm as Record<string, string>)[key]}
                      onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                ))
              )}
              {[
                { key: "phone1", label: "تماس شمېره" },
                { key: "phone2", label: "دوهم تماس" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="form-label">{label}</label>
                  <input
                    className="form-input"
                    inputMode={key === "phone1" || key === "phone2" ? "numeric" : undefined}
                    maxLength={key === "phone1" || key === "phone2" ? 10 : undefined}
                    pattern={key === "phone1" || key === "phone2" ? "\\d{10}" : undefined}
                    title={key === "phone1" || key === "phone2" ? phoneRestrictionMessage(label) : undefined}
                    value={(editForm as Record<string, string>)[key]}
                    onChange={(e) => setEditForm((f) => ({ ...f, [key]: key === "phone1" || key === "phone2" ? phoneDigits(e.target.value) : e.target.value }))}
                  />
                  {(key === "phone1" || key === "phone2") && !isValidOptionalPhone((editForm as Record<string, string>)[key]) ? (
                    <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>{phoneRestrictionMessage(label)}</div>
                  ) : null}
                </div>
              ))}
              <div style={{ gridColumn: "1/-1" }}>
                <label className="form-label">آدرس</label>
                <input className="form-input" value={editForm.address} onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label className="form-label">یادښت</label>
                <textarea className="form-input" value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} style={{ height: 78, padding: "12px 16px" }} />
              </div>
            </div>
            {editPhoneError && <div style={{ color: "var(--danger)", fontSize: 14, marginBottom: 16 }}>{editPhoneError}</div>}
            {error && <div style={{ color: "var(--danger)", fontSize: 14, marginBottom: 16 }}>{error}</div>}
            <div style={{ display: "flex", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 18 }}>
              <button className="btn btn-primary" onClick={() => updateMutation.mutate()} disabled={!editForm.name.trim() || Boolean(editPhoneError) || updateMutation.isPending}>
                <Save size={14} /> ساتل
              </button>
              <button className="btn btn-outline" onClick={() => setEditingParty(null)}>
                <X size={14} /> لغوه
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
