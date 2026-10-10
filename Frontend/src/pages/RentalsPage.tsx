import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Printer, X } from "lucide-react";
import { api, type Rental, type RentalStatus, type RentalFrequency, type Party, type UnitWithLocation } from "../lib/api";
import JalaliDate from "../components/JalaliDate";
import ShamsiDateInput from "../components/ShamsiDateInput";
import DateFilterButton from "../components/DateFilterButton";
import { currencyLabel, visibleText } from "../lib/labels";
import { isValidOptionalPhone, phoneDigits, phoneRestrictionMessage } from "../lib/phone";
import ViewModeToggle, { type ViewMode } from "../components/ViewModeToggle";
import PrintHeader from "../components/PrintHeader";

const STATUS_LABELS: Record<RentalStatus, string> = { active: "فعال", ended: "پای ته رسېدلی", cancelled: "لغوه شوی" };
const STATUS_COLORS: Record<RentalStatus, string> = { active: "badge-info", ended: "badge-muted", cancelled: "badge-danger" };
const FREQUENCY_LABELS: Record<RentalFrequency, string> = { monthly: "میاشتنی", quarterly: "ربعوار", yearly: "کلنی" };
const UNIT_STATUS_LABELS: Record<string, string> = { draft: "مسوده", available: "خالي", reserved: "ساتل شوی", sold: "پلورل شوی", rented: "کرایه شوی", blocked: "بند شوی", cancelled: "لغوه شوی", inactive: "غیر فعال", unavailable: "ناشتون" };
const RENTAL_UNIT_PURPOSES = new Set(["for_rent", "both"]);

function floorAllowsRent(unit: UnitWithLocation): boolean {
  return unit.floor?.purpose !== "for_sale";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

interface NewRentalForm {
  unitId: number | null;
  tenantPartyId: number | null;
  startDate: string;
  rentAmount: string;
  frequency: RentalFrequency;
  depositAmount: string;
  currencyCode: string;
  notes: string;
  firstReceivedAmount: string;
}

interface NewTenantForm {
  name: string;
  fatherName: string;
  tazkiraNumber: string;
  phone1: string;
  address: string;
  notes: string;
}

function emptyForm(): NewRentalForm {
  return {
    unitId: null, tenantPartyId: null, startDate: today(),
    rentAmount: "", frequency: "monthly", depositAmount: "0", currencyCode: "AFN",
    notes: "", firstReceivedAmount: "",
  };
}

function emptyTenantForm(): NewTenantForm {
  return { name: "", fatherName: "", tazkiraNumber: "", phone1: "", address: "", notes: "" };
}

export default function RentalsPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const unitTypeFilter = searchParams.get("unitType") ?? "";
  const urlSearch = searchParams.get("q") ?? "";
  const isShopView = unitTypeFilter === "shop";
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(today());
  const [q, setQ] = useState(urlSearch);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showForm, setShowForm] = useState(false);
  const [showTenantForm, setShowTenantForm] = useState(false);
  const [form, setForm] = useState<NewRentalForm>(emptyForm());
  const [tenantForm, setTenantForm] = useState<NewTenantForm>(emptyTenantForm());
  const [unitQuery, setUnitQuery] = useState("");
  const [partyQuery, setPartyQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tenantError, setTenantError] = useState<string | null>(null);

  useEffect(() => {
    setQ(urlSearch);
  }, [urlSearch]);

  const { data: rentals, refetch: refetchRentals } = useQuery({
    queryKey: ["rentals", statusFilter, unitTypeFilter, startDate, endDate, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (unitTypeFilter) params.set("unitType", unitTypeFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (q) params.set("q", q);
      const query = params.toString();
      return api.get<Rental[]>(`/rentals${query ? `?${query}` : ""}`);
    },
  });

  const { data: availableUnits } = useQuery({
    queryKey: ["units-available-rent", unitQuery, unitTypeFilter],
    queryFn: () => {
      const params = new URLSearchParams({ status: "available" });
      params.set("availability", "rent");
      if (unitTypeFilter) params.set("unitType", unitTypeFilter);
      if (unitQuery) params.set("q", unitQuery);
      return api.get<UnitWithLocation[]>(`/units?${params.toString()}`);
    },
    enabled: showForm,
  });

  const { data: rentedStatusUnits } = useQuery({
    queryKey: ["units-rented-status", unitTypeFilter, q],
    queryFn: () => {
      const params = new URLSearchParams({ status: "rented" });
      params.set("availability", "rent");
      if (unitTypeFilter) params.set("unitType", unitTypeFilter);
      if (q) params.set("q", q);
      return api.get<UnitWithLocation[]>(`/units?${params.toString()}`);
    },
  });

  const { data: parties } = useQuery({
    queryKey: ["parties-search-tenant", partyQuery],
    queryFn: () => api.get<Party[]>(`/rentals/tenants${partyQuery ? `?q=${encodeURIComponent(partyQuery)}` : ""}`),
    enabled: showForm,
  });

  const { data: tenantAccounts } = useQuery({
    queryKey: ["rental-tenant-accounts", q],
    queryFn: () => api.get<Party[]>(`/rentals/tenants${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<Rental>("/rentals", {
        unitId: form.unitId,
        tenantPartyId: form.tenantPartyId,
        startDate: form.startDate,
        rentAmount: form.rentAmount,
        frequency: form.frequency,
        depositAmount: form.depositAmount || 0,
        currencyCode: form.currencyCode,
        notes: form.notes || null,
        firstReceivedAmount: form.firstReceivedAmount ? form.firstReceivedAmount : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rentals"] });
      qc.invalidateQueries({ queryKey: ["rental-tenant-accounts"] });
      qc.invalidateQueries({ queryKey: ["units-rented-status"] });
      qc.invalidateQueries({ queryKey: ["units-available-rent"] });
      setShowForm(false);
      setForm(emptyForm());
      setError(null);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "ناکامي"),
  });

  const createTenantMutation = useMutation({
    mutationFn: () =>
      api.post<Party>("/rentals/tenants", {
        name: tenantForm.name.trim(),
        fatherName: tenantForm.fatherName.trim() || null,
        tazkiraNumber: tenantForm.tazkiraNumber.trim() || null,
        phone1: tenantForm.phone1.trim() || null,
        address: tenantForm.address.trim() || null,
        notes: tenantForm.notes.trim() || null,
      }),
    onSuccess: (tenant) => {
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["parties-search-tenant"] });
      qc.invalidateQueries({ queryKey: ["rental-tenant-accounts"] });
      setForm((current) => ({ ...current, tenantPartyId: tenant.id }));
      setPartyQuery(tenant.name);
      setShowForm(true);
      setShowTenantForm(false);
      setTenantForm(emptyTenantForm());
      setTenantError(null);
    },
    onError: (e: unknown) => setTenantError(e instanceof Error ? e.message : "د کرایه دار ثبت ناکام شو"),
  });

  const rentableUnits = useMemo(() => (availableUnits ?? []).filter((unit) => RENTAL_UNIT_PURPOSES.has(unit.purpose) && floorAllowsRent(unit)), [availableUnits]);
  const selectedUnit = useMemo(() => rentableUnits.find((u) => u.id === form.unitId), [rentableUnits, form.unitId]);
  const rentedUnitIds = useMemo(() => new Set((rentals ?? []).map((rental) => rental.unitId)), [rentals]);
  const rentalTenantIds = useMemo(() => new Set((rentals ?? []).map((rental) => rental.tenantPartyId)), [rentals]);
  const rentedUnitsWithoutContract = useMemo(
    () => (rentedStatusUnits ?? []).filter((unit) => !rentedUnitIds.has(unit.id)),
    [rentedStatusUnits, rentedUnitIds],
  );
  const tenantAccountsWithoutRental = useMemo(
    () => statusFilter ? [] : (tenantAccounts ?? []).filter((tenant) => !rentalTenantIds.has(tenant.id)),
    [rentalTenantIds, statusFilter, tenantAccounts],
  );
  const hasRentalRows = Boolean((rentals?.length ?? 0) + rentedUnitsWithoutContract.length + tenantAccountsWithoutRental.length);
  const tenantPhoneError = !isValidOptionalPhone(tenantForm.phone1) ? phoneRestrictionMessage("تماس شمېره") : null;

  return (
    <div className="print-report-page">
      <PrintHeader title={`${isShopView ? "د دوکانونو کرایه" : "کرایې"} راپور`} />
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <p className="page-title" style={{ margin: 0 }}>{isShopView ? "د دوکانونو کرایه" : "کرایې"}</p>
          <p className="page-sub">{isShopView ? "د دوکانونو کرایه، رسیدونه او د کرایه‌دارانو حسابونه" : "د واحدونو کرایه، رسیدونه او د کرایه‌دارانو حسابونه"}</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <button className="btn btn-outline" onClick={() => window.print()}>
            <Printer size={16} /> چاپ
          </button>
          <button className="btn btn-outline" onClick={() => setShowTenantForm(true)}>
            <Plus size={16} /> نوی کرایه دار
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> {isShopView ? "نوې د دوکان کرایه" : "نوې کرایه"}
          </button>
        </div>
      </div>

      <div className="card no-print" style={{ padding: 16, margin: "16px 0", display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["", "active", "ended", "cancelled"].map((s) => (
            <button key={s} className={`btn btn-sm ${statusFilter === s ? "btn-primary" : "btn-outline"}`} onClick={() => setStatusFilter(s)}>
              {s ? STATUS_LABELS[s as RentalStatus] : "ټول"}
            </button>
          ))}
        </div>
        <div>
          <label className="form-label">شروع تاریخ</label>
          <ShamsiDateInput className="form-input" value={startDate} onChange={setStartDate} style={{ width: 150 }} />
        </div>
        <div>
          <label className="form-label">ختم تاریخ</label>
          <ShamsiDateInput className="form-input" value={endDate} onChange={setEndDate} style={{ width: 150 }} />
        </div>
        <DateFilterButton onClick={() => void refetchRentals()} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <label className="form-label filter-search-label">لټون</label>
          <input className="form-input" value={q} onChange={(event) => setQ(event.target.value)} placeholder="کرایه دار، دوکان، کور نمبر یا بلاک..." />
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="list-grid">
          {rentals?.map((rental) => (
            <Link key={rental.id} to={`/rentals/${rental.id}`} className="list-card" style={{ color: "inherit", textDecoration: "none" }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>{rental.tenant?.name ?? "—"}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
                {rental.unit ? `${visibleText(rental.unit.floor?.block?.name, "بلاک")} / ${rental.unit.unitNumber}` : "—"}
              </div>
              <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                <span>کرایه: {rental.rentAmount} {currencyLabel(rental.currencyCode)} / {FREQUENCY_LABELS[rental.frequency]}</span>
                <span>پاتې: {rental.balance ?? "0"} {currencyLabel(rental.currencyCode)}</span>
                <span>حالت: {STATUS_LABELS[rental.status]}</span>
                <span>تاریخ: <JalaliDate date={rental.startDate} /></span>
              </div>
            </Link>
          ))}
          {rentedUnitsWithoutContract.map((unit) => (
            <div key={`rented-unit-${unit.id}`} className="list-card">
              <div style={{ fontWeight: 900, marginBottom: 8 }}>{visibleText(unit.unitType?.name, "ملکیت")} / {unit.unitNumber}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
                {visibleText(unit.floor?.block?.name, "بلاک")} / {visibleText(unit.floor?.name, "منزل")}
              </div>
              <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                <span>حالت: {UNIT_STATUS_LABELS[unit.status] ?? "کرایه شوی"}</span>
                <span>دا ملکیت د پروژې له حالته کرایه شوی ښکاري.</span>
              </div>
            </div>
          ))}
          {tenantAccountsWithoutRental.map((tenant) => (
            <Link key={`tenant-account-${tenant.id}`} to={`/parties/${tenant.id}`} className="list-card" style={{ color: "inherit", textDecoration: "none" }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>{visibleText(tenant.name, `کرایه دار ${tenant.id}`)}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>کرایه دار کهاته</div>
              <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                <span>ملکیت: تر اوسه نه دی ورکړل شوی</span>
                <span>پاتې: 0</span>
                <span>حالت: یوازې کرایه دار</span>
              </div>
            </Link>
          ))}
          {!hasRentalRows && <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>تر اوسه هېڅ کرایه نشته.</div>}
        </div>
      ) : (
      <div className="card elevated-card print-report-surface" style={{ padding: 0, overflow: "auto" }}>
        <table className="fl-table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th>د کرایې شمېره</th><th>کرایه‌دار</th><th>ملکیت</th><th>کرایه</th>
              <th>پاتې</th><th>حالت</th><th>پیل نېټه</th>
            </tr>
          </thead>
          <tbody>
            {rentals?.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`/rentals/${r.id}`} style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
                    {visibleText(r.rentalNumber, `کرایه ${r.id}`)}
                  </Link>
                </td>
                <td>{r.tenant?.name ?? "—"}</td>
                <td>{r.unit ? `${visibleText(r.unit.floor?.block?.name, "بلاک")} / ${r.unit.unitNumber}` : "—"}</td>
                <td>{r.rentAmount} {currencyLabel(r.currencyCode)} / {FREQUENCY_LABELS[r.frequency]}</td>
                <td style={{ color: Number(r.balance ?? 0) > 0 ? "var(--danger)" : "var(--success)", fontWeight: 600 }}>{r.balance ?? "—"}</td>
                <td><span className={`badge ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status]}</span></td>
                <td style={{ whiteSpace: "nowrap", color: "var(--muted)" }}><JalaliDate date={r.startDate} /></td>
              </tr>
            ))}
            {rentedUnitsWithoutContract.map((unit) => (
              <tr key={`rented-unit-${unit.id}`}>
                <td>—</td>
                <td>—</td>
                <td>{visibleText(unit.floor?.block?.name, "بلاک")} / {visibleText(unit.floor?.name, "منزل")} / {unit.unitNumber}</td>
                <td>—</td>
                <td>—</td>
                <td><span className="badge badge-info">{UNIT_STATUS_LABELS[unit.status] ?? "کرایه شوی"}</span></td>
                <td>—</td>
              </tr>
            ))}
            {tenantAccountsWithoutRental.map((tenant) => (
              <tr key={`tenant-account-${tenant.id}`}>
                <td>
                  <Link to={`/parties/${tenant.id}`} style={{ color: "var(--primary)", fontWeight: 700, textDecoration: "none" }}>
                    کهاته لیدل
                  </Link>
                </td>
                <td>
                  <Link to={`/parties/${tenant.id}`} style={{ color: "var(--primary)", fontWeight: 800, textDecoration: "none" }}>
                    {visibleText(tenant.name, `کرایه دار ${tenant.id}`)}
                  </Link>
                </td>
                <td>تر اوسه ملکیت نه دی ورکړل شوی</td>
                <td>—</td>
                <td style={{ color: "var(--success)", fontWeight: 700 }}>0</td>
                <td><span className="badge badge-muted">یوازې کرایه دار</span></td>
                <td>—</td>
              </tr>
            ))}
            {!hasRentalRows && (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>تر اوسه هېڅ کرایه نشته.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {showForm && (
        <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="card compact-form-modal" style={{ width: 640, maxHeight: "82vh", overflow: "auto", padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>نوې کرایه ثبتول</div>
              <button className="btn btn-outline btn-sm" onClick={() => setShowForm(false)}><X size={14} /></button>
            </div>

            {error && (
              <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>
                {error}
              </div>
            )}

            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="form-label">ملکیت (نمرې لټون)</label>
                <input className="form-input" placeholder="د واحد شمېره ولیکئ..." value={unitQuery} onChange={(e) => setUnitQuery(e.target.value)} />
                <select className="form-input" style={{ marginTop: 6 }} value={form.unitId ?? ""} onChange={(e) => setForm((f) => ({ ...f, unitId: Number(e.target.value) || null }))}>
                  <option value="">-- ملکیت وټاکئ --</option>
                  {rentableUnits.map((u) => (
                    <option key={u.id} value={u.id}>{visibleText(u.floor?.block?.name, "بلاک")} / {u.unitNumber} ({visibleText(u.unitType?.name, "ډول")})</option>
                  ))}
                </select>
                {selectedUnit && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>حالت: {UNIT_STATUS_LABELS[selectedUnit.status] ?? "حالت"}</div>}
              </div>

              <div>
                <label className="form-label">کرایه‌دار (نوم لټون)</label>
                <input className="form-input" placeholder="نوم ولیکئ..." value={partyQuery} onChange={(e) => setPartyQuery(e.target.value)} />
                <select className="form-input" style={{ marginTop: 6 }} value={form.tenantPartyId ?? ""} onChange={(e) => setForm((f) => ({ ...f, tenantPartyId: Number(e.target.value) || null }))}>
                  <option value="">-- کرایه‌دار وټاکئ --</option>
                  {parties?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                <div>
                  <label className="form-label">کرایه</label>
                  <input className="form-input" type="text" inputMode="decimal" value={form.rentAmount} onChange={(e) => setForm((f) => ({ ...f, rentAmount: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">تکرار</label>
                  <select className="form-input" value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as RentalFrequency }))}>
                    <option value="monthly">میاشتنی</option>
                    <option value="quarterly">ربعوار</option>
                    <option value="yearly">کلنی</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">اسعار</label>
                  <select className="form-input" value={form.currencyCode} onChange={(e) => setForm((f) => ({ ...f, currencyCode: e.target.value }))}>
                    <option value="AFN">افغانی</option>
                    <option value="USD">ډالر</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
                <div>
                  <label className="form-label">د پیل نېټه</label>
                  <ShamsiDateInput className="form-input" value={form.startDate} onChange={(startDate) => setForm((f) => ({ ...f, startDate }))} />
                </div>
                <div>
                  <label className="form-label">امانت (اختیاري)</label>
                  <input className="form-input" type="text" inputMode="decimal" value={form.depositAmount} onChange={(e) => setForm((f) => ({ ...f, depositAmount: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="form-label">لومړنۍ ترلاسه شوې پیسه (اختیاري)</label>
                <input className="form-input" type="text" inputMode="decimal" value={form.firstReceivedAmount} onChange={(e) => setForm((f) => ({ ...f, firstReceivedAmount: e.target.value }))} />
              </div>

              <div>
                <label className="form-label">یادداشتونه</label>
                <textarea className="form-input" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-primary" disabled={!form.unitId || !form.tenantPartyId || !form.rentAmount || createMutation.isPending} onClick={() => createMutation.mutate()}>
                ثبتول
              </button>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>لغوه</button>
            </div>
          </div>
        </div>
      )}

      {showTenantForm && (
        <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}>
          <div className="card compact-form-modal" style={{ width: 560, maxHeight: "82vh", overflow: "auto", padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>نوی کرایه دار ثبتول</div>
              <button className="btn btn-outline btn-sm" onClick={() => setShowTenantForm(false)}><X size={14} /></button>
            </div>

            {tenantError && (
              <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>
                {tenantError}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
              <div>
                <label className="form-label">نوم</label>
                <input className="form-input" value={tenantForm.name} onChange={(e) => setTenantForm((current) => ({ ...current, name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">پلار نوم</label>
                <input className="form-input" value={tenantForm.fatherName} onChange={(e) => setTenantForm((current) => ({ ...current, fatherName: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">تذکره نمبر</label>
                <input className="form-input" value={tenantForm.tazkiraNumber} onChange={(e) => setTenantForm((current) => ({ ...current, tazkiraNumber: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">تماس شمېره</label>
                <input
                  className="form-input"
                  inputMode="numeric"
                  maxLength={10}
                  pattern="\d{10}"
                  title={phoneRestrictionMessage("تماس شمېره")}
                  placeholder="0700000000"
                  value={tenantForm.phone1}
                  onChange={(e) => setTenantForm((current) => ({ ...current, phone1: phoneDigits(e.target.value) }))}
                />
                {tenantPhoneError ? <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>{tenantPhoneError}</div> : null}
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">آدرس</label>
                <input className="form-input" value={tenantForm.address} onChange={(e) => setTenantForm((current) => ({ ...current, address: e.target.value }))} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">یادداشت</label>
                <textarea className="form-input" rows={2} value={tenantForm.notes} onChange={(e) => setTenantForm((current) => ({ ...current, notes: e.target.value }))} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-primary" disabled={!tenantForm.name.trim() || Boolean(tenantPhoneError) || createTenantMutation.isPending} onClick={() => createTenantMutation.mutate()}>
                ثبتول
              </button>
              <button className="btn btn-outline" onClick={() => setShowTenantForm(false)}>لغوه</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
