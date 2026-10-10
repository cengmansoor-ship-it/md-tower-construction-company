import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Edit2, Plus, Printer, Trash2, Upload, X } from "lucide-react";
import { api, type Employee, type EmployeeDocument, type EmployeeStatus, type EmployeeWageType, type EmployeeWorkerType } from "../lib/api";
import PrintHeader from "../components/PrintHeader";
import JalaliDate from "../components/JalaliDate";
import ShamsiDateInput from "../components/ShamsiDateInput";
import DateFilterButton from "../components/DateFilterButton";
import ViewModeToggle, { type ViewMode } from "../components/ViewModeToggle";
import { daysInJalaliMonth, gregorianToJalali, isoToJalaliString, jalaliToGregorian } from "../lib/jalali";
import { currencyLabel, visibleText } from "../lib/labels";
import { isValidOptionalPhone, phoneDigits, phoneRestrictionMessage } from "../lib/phone";

const STATUS_LABELS: Record<EmployeeStatus, string> = { active: "فعال", inactive: "غیر فعال" };
const MAX_EMPLOYEE_DOCUMENTS = 3;
const MAX_EMPLOYEE_DOCUMENT_BYTES = 5 * 1024 * 1024;

interface NewEmployeeForm {
  name: string;
  fatherName: string;
  phone: string;
  position: string;
  wageType: EmployeeWageType;
  wageAmount: string;
  currencyCode: string;
  startDate: string;
  endDate: string;
  status: EmployeeStatus;
  workerType: EmployeeWorkerType;
  notes: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function gregorianIsoDate(parts: { gy: number; gm: number; gd: number }): string {
  return `${parts.gy}-${String(parts.gm).padStart(2, "0")}-${String(parts.gd).padStart(2, "0")}`;
}

function currentJalaliMonthRange(): { start: string; end: string } {
  const now = new Date();
  const current = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const start = gregorianIsoDate(jalaliToGregorian(current.jy, current.jm, 1));
  const end = gregorianIsoDate(jalaliToGregorian(current.jy, current.jm, daysInJalaliMonth(current.jy, current.jm)));
  return { start, end };
}

function emptyForm(workerType: EmployeeWorkerType = "regular"): NewEmployeeForm {
  return {
    name: "",
    fatherName: "",
    phone: "",
    position: workerType === "misc" ? "متفرقه کاریګر" : "",
    wageType: workerType === "misc" ? "daily" : "daily",
    wageAmount: "",
    currencyCode: "AFN",
    startDate: today(),
    endDate: "",
    status: "active",
    workerType,
    notes: "",
  };
}

function decimalToScaled(value: string | number | null | undefined): { amount: bigint; scale: number } {
  const clean = String(value ?? "0").trim() || "0";
  const negative = clean.startsWith("-");
  const unsigned = negative ? clean.slice(1) : clean;
  const [wholeRaw, fractionRaw = ""] = unsigned.split(".");
  const fraction = fractionRaw.replace(/[^0-9]/g, "");
  const digits = `${wholeRaw || "0"}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  return { amount: (negative ? -1n : 1n) * BigInt(digits), scale: fraction.length };
}

function addDecimal(a: string, b: string): string {
  const left = decimalToScaled(a);
  const right = decimalToScaled(b);
  const scale = Math.max(left.scale, right.scale);
  const value = left.amount * 10n ** BigInt(scale - left.scale) + right.amount * 10n ** BigInt(scale - right.scale);
  return scaledToDecimal(value, scale);
}

function scaledToDecimal(value: bigint, scale: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  if (scale === 0) return `${negative ? "-" : ""}${absolute.toString()}`;
  const padded = absolute.toString().padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale) || "0";
  const fraction = padded.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function compareDecimal(a: string | number | null | undefined, b: string | number | null | undefined): number {
  const left = decimalToScaled(a);
  const right = decimalToScaled(b);
  const scale = Math.max(left.scale, right.scale);
  const leftAmount = left.amount * 10n ** BigInt(scale - left.scale);
  const rightAmount = right.amount * 10n ** BigInt(scale - right.scale);
  return leftAmount === rightAmount ? 0 : leftAmount > rightAmount ? 1 : -1;
}

function absDecimal(value: string | number | null | undefined): string {
  const scaled = decimalToScaled(value);
  return scaledToDecimal(scaled.amount < 0n ? -scaled.amount : scaled.amount, scaled.scale);
}

function shortEmployeeNumber(employee: Employee, index: number): string {
  return visibleText(employee.employeeNumber, `شمېره ${index + 1}`).replace(/^کارکوونکی[-\s]*/u, "").replace(/^Employee[-\s]*/iu, "");
}

function validateEmployeeDocumentFiles(files: File[]): string | null {
  if (files.length > MAX_EMPLOYEE_DOCUMENTS) return "یوازې تر درې اسنادو پورې پورته کېدای شي";
  for (const file of files) {
    if (!["image/jpeg", "image/png"].includes(file.type)) return "یوازې JPG او PNG عکسونه منل کېږي";
    if (file.size > MAX_EMPLOYEE_DOCUMENT_BYTES) return "د هر عکس سایز باید تر ۵MB زیات نه وي";
  }
  return null;
}

function totalsByCurrency(employees: Employee[] | undefined, field: (employee: Employee) => string, filter?: (employee: Employee) => boolean): string {
  const totals: Record<string, string> = {};
  for (const employee of employees ?? []) {
    if (filter && !filter(employee)) continue;
    totals[employee.currencyCode] = addDecimal(totals[employee.currencyCode] ?? "0", field(employee));
  }
  return Object.entries(totals)
    .filter(([, amount]) => compareDecimal(amount, "0") !== 0)
    .map(([currency, amount]) => `${amount} ${currencyLabel(currency)}`)
    .join("، ") || "0";
}

function employeeOwesCompany(employee: Employee): boolean {
  return compareDecimal(employee.balance ?? "0", "0") < 0;
}

function companyOwesEmployee(employee: Employee): boolean {
  return compareDecimal(employee.balance ?? "0", "0") > 0;
}

function employeeBalanceLabel(employee: Employee): string {
  return companyOwesEmployee(employee) ? "پور" : "طلب";
}

function employeeBalanceColor(employee: Employee): string {
  return companyOwesEmployee(employee) ? "var(--danger)" : "var(--success)";
}

function employeeMatchesSearch(employee: Employee, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    employee.employeeNumber,
    employee.name,
    employee.fatherName,
    employee.phone,
    employee.position,
    employee.workerType,
    employee.currencyCode,
    employee.notes,
  ].some((value) => String(value ?? "").toLowerCase().includes(needle));
}

export default function EmployeesPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("q") ?? "";
  const monthRange = currentJalaliMonthRange();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [startDate, setStartDate] = useState(monthRange.start);
  const [endDate, setEndDate] = useState(monthRange.end);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showForm, setShowForm] = useState(false);
  const [q, setQ] = useState(urlSearch);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<NewEmployeeForm>(emptyForm());
  const [selectedDocumentFiles, setSelectedDocumentFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const attendanceDate = today();
  const phoneError = !isValidOptionalPhone(form.phone) ? phoneRestrictionMessage("تماس شمېره") : null;

  const { data: employees, refetch: refetchEmployees } = useQuery({
    queryKey: ["employees", "regular", statusFilter, startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams({ workerType: "regular" });
      if (statusFilter) params.set("status", statusFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const query = params.toString();
      return api.get<Employee[]>(`/employees${query ? `?${query}` : ""}`);
    },
  });
  const visibleEmployees = (employees ?? []).filter((employee) => employeeMatchesSearch(employee, q));
  const earnedTotals = totalsByCurrency(visibleEmployees, (employee) => employee.earnedTotal ?? "0");
  const paidTotals = totalsByCurrency(visibleEmployees, (employee) => employee.paidTotal ?? "0");
  const receivableTotals = totalsByCurrency(visibleEmployees, (employee) => absDecimal(employee.balance ?? "0"), employeeOwesCompany);
  const debtTotals = totalsByCurrency(visibleEmployees, (employee) => employee.balance ?? "0", companyOwesEmployee);

  useEffect(() => {
    setQ(urlSearch);
  }, [urlSearch]);

  function closeForm() {
    setShowForm(false);
    setEditingEmployee(null);
    setForm(emptyForm());
    setSelectedDocumentFiles([]);
    setError(null);
  }

  function startCreateEmployee() {
    setEditingEmployee(null);
    setForm(emptyForm());
    setSelectedDocumentFiles([]);
    setError(null);
    setShowForm(true);
  }

  function startEditEmployee(employee: Employee) {
    setEditingEmployee(employee);
    setForm({
      name: employee.name,
      fatherName: employee.fatherName ?? "",
      phone: employee.phone ?? "",
      position: employee.position,
      wageType: employee.wageType,
      wageAmount: employee.wageAmount,
      currencyCode: employee.currencyCode,
      startDate: employee.startDate,
      endDate: employee.endDate ?? "",
      status: employee.status,
      workerType: employee.workerType ?? "regular",
      notes: employee.notes ?? "",
    });
    setSelectedDocumentFiles([]);
    setError(null);
    setShowForm(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validationError = validateEmployeeDocumentFiles(selectedDocumentFiles);
      if (validationError) throw new Error(validationError);
      const employee = editingEmployee
        ? await api.put<Employee>(`/employees/${editingEmployee.id}`, {
            name: form.name,
            fatherName: form.fatherName || null,
            phone: form.phone || null,
            position: form.position,
            wageType: form.wageType,
            wageAmount: form.wageAmount,
            currencyCode: form.currencyCode,
            startDate: form.startDate,
            endDate: form.endDate || null,
            status: form.status,
            workerType: form.workerType,
            notes: form.notes || null,
          })
        : await api.post<Employee>("/employees", {
            name: form.name,
            fatherName: form.fatherName || null,
            phone: form.phone || null,
            position: form.position,
            wageType: form.wageType,
            wageAmount: form.wageAmount,
            currencyCode: form.currencyCode,
            startDate: form.startDate,
            endDate: form.endDate || null,
            workerType: form.workerType,
            notes: form.notes || null,
          });
      for (const file of selectedDocumentFiles) {
        await api.uploadFile<EmployeeDocument>(`/employees/${employee.id}/documents`, file);
      }
      return employee;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      if (editingEmployee) qc.invalidateQueries({ queryKey: ["employee", String(editingEmployee.id)] });
      closeForm();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "ناکامي"),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => api.post<Employee>(`/employees/${id}/delete`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["trash"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "حذف ناکام شو"),
  });

  function deleteEmployee(employee: Employee) {
    const reason = window.prompt("د حذف دلیل ولیکئ:");
    if (!reason?.trim()) return;
    deleteMutation.mutate({ id: employee.id, reason: reason.trim() });
  }

  return (
    <div className="print-report-page print-wide employees-page">
      <PrintHeader title={`د کارکوونکو میاشتنی راپور (${isoToJalaliString(startDate)} - ${isoToJalaliString(endDate)})`} />
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">کارکوونکي</h1>
          <p className="page-sub">د کارکوونکو، حاضري او تادیاتو مدیریت</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-outline" onClick={() => window.print()}>
            <Printer size={16} /> چاپ
          </button>
          <button className="btn btn-primary" onClick={startCreateEmployee}>
            <Plus size={16} /> نوی کارکوونکی
          </button>
        </div>
      </div>

      <div className="no-print" style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap", alignItems: "center" }}>
        {["", "active", "inactive"].map((status) => (
          <button key={status} className={`btn btn-sm ${statusFilter === status ? "btn-primary" : "btn-outline"}`} onClick={() => setStatusFilter(status)}>
            {status ? STATUS_LABELS[status as EmployeeStatus] : "ټول"}
          </button>
        ))}
        <ShamsiDateInput className="form-input" placeholder="شروع تاریخ" value={startDate} onChange={setStartDate} style={{ width: 150 }} />
        <ShamsiDateInput className="form-input" placeholder="ختم تاریخ" value={endDate} onChange={setEndDate} style={{ width: 150 }} />
        <DateFilterButton onClick={() => void refetchEmployees()} />
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>

      <div className="card elevated-card no-print" style={{ padding: 0, overflow: "auto", marginBottom: 16 }}>
        <table className="fl-table" style={{ minWidth: 920, fontSize: 13 }}>
          <thead>
            <tr><th>تاریخ</th><th><JalaliDate date={attendanceDate} /></th><th colSpan={6}></th></tr>
            <tr><th>شمېره</th><th>آډي نمبر</th><th>نوم</th><th>د پلار نوم</th><th>وظیفه</th><th>تماس شمېره</th><th>حاضر</th><th>غیر حاضر</th></tr>
          </thead>
          <tbody>
            {visibleEmployees.map((employee, index) => (
              <tr key={`attendance-frame-${employee.id}`}>
                <td>{index + 1}</td>
                <td>{shortEmployeeNumber(employee, index)}</td>
                <td>{employee.name}</td>
                <td>{employee.fatherName ?? "—"}</td>
                <td>{employee.position}</td>
                <td>{employee.phone ?? "—"}</td>
                <td></td>
                <td></td>
              </tr>
            ))}
            {!visibleEmployees.length ? <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>د حاضري لپاره کارکوونکی نشته.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {viewMode === "grid" ? (
        <div className="list-grid">
          {visibleEmployees.map((employee) => (
            <div key={employee.id} className="list-card">
              <div style={{ fontWeight: 900, marginBottom: 8 }}>{employee.name}</div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>{employee.position}</div>
              <div style={{ marginTop: 12, display: "grid", gap: 6, fontSize: 13 }}>
                <span>د پلار نوم: {employee.fatherName ?? "—"}</span>
                <span>ډول: {employee.workerType === "misc" ? "متفرقه کاریګر" : "عادي کارکوونکی"}</span>
                <span>تماس: {employee.phone ?? "—"}</span>
                <span>معاش: {employee.wageAmount} {currencyLabel(employee.currencyCode)}</span>
                <span>تېر حساب: {employee.previousBalance ?? "0"} {currencyLabel(employee.currencyCode)}</span>
                <span>مستحق معاش: {employee.earnedTotal ?? "0"} {currencyLabel(employee.currencyCode)}</span>
                <span>ورکړل شوي: {employee.paidTotal ?? "0"} {currencyLabel(employee.currencyCode)}</span>
                <span>{employeeBalanceLabel(employee)}: {absDecimal(employee.balance ?? "0")} {currencyLabel(employee.currencyCode)}</span>
                <span>شروع تاریخ: <JalaliDate date={employee.startDate} /></span>
                <span>ختم تاریخ: {employee.endDate ? <JalaliDate date={employee.endDate} /> : "—"}</span>
              </div>
              <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <Link className="btn btn-outline btn-sm" to={`/employees/${employee.id}`} style={{ textDecoration: "none" }}>
                  <BookOpen size={13} /> کهاته لیدل
                </Link>
                <button className="btn btn-outline btn-sm" type="button" onClick={() => startEditEmployee(employee)}>
                  <Edit2 size={13} /> ایډیټ
                </button>
                <button className="btn btn-outline btn-sm" type="button" onClick={() => deleteEmployee(employee)} disabled={deleteMutation.isPending}>
                  <Trash2 size={13} /> ډیلیټ
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card elevated-card print-report-surface" style={{ padding: 0, overflow: "auto" }}>
          <table className="fl-table" style={{ minWidth: 1400, fontSize: 13 }}>
            <thead>
              <tr>
                <th>نوم</th><th>ډول</th><th>د پلار نوم</th><th>معاش</th><th>تېر حساب</th><th>مستحق معاش</th><th>ورکړل شوي</th><th>طلب / پور</th><th>تماس شمېره</th><th>وظیفه</th><th>شروع تاریخ</th><th>ختم تاریخ</th><th className="no-print">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {visibleEmployees.map((employee) => (
                <tr key={employee.id}>
                  <td>{employee.name}</td>
                  <td>{employee.workerType === "misc" ? "متفرقه" : "عادي"}</td>
                  <td>{employee.fatherName ?? "—"}</td>
                  <td>{employee.wageAmount} {currencyLabel(employee.currencyCode)}</td>
                  <td>{employee.previousBalance ?? "0"} {currencyLabel(employee.currencyCode)}</td>
                  <td>{employee.earnedTotal ?? "0"} {currencyLabel(employee.currencyCode)}</td>
                  <td>{employee.paidTotal ?? "0"} {currencyLabel(employee.currencyCode)}</td>
                  <td style={{ fontWeight: 900, color: employeeBalanceColor(employee) }}>
                    {employeeBalanceLabel(employee)}: {absDecimal(employee.balance ?? "0")} {currencyLabel(employee.currencyCode)}
                  </td>
                  <td>{employee.phone ?? "—"}</td>
                  <td>{employee.position}</td>
                  <td><JalaliDate date={employee.startDate} /></td>
                  <td>{employee.endDate ? <JalaliDate date={employee.endDate} /> : "—"}</td>
                  <td className="no-print">
                    <div style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <Link className="btn btn-outline btn-sm" to={`/employees/${employee.id}`} style={{ textDecoration: "none" }}>
                        <BookOpen size={13} /> کهاته لیدل
                      </Link>
                      <button className="btn btn-outline btn-sm" type="button" onClick={() => startEditEmployee(employee)}>
                        <Edit2 size={13} /> ایډیټ
                      </button>
                      <button className="btn btn-outline btn-sm" type="button" onClick={() => deleteEmployee(employee)} disabled={deleteMutation.isPending}>
                        <Trash2 size={13} /> ډیلیټ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!visibleEmployees.length && <tr><td colSpan={12} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>تر اوسه هېڅ کارکوونکی نشته.</td></tr>}
            </tbody>
            {visibleEmployees.length ? (
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ fontWeight: 900 }}>ټول</td>
                  <td style={{ fontWeight: 900 }}>{earnedTotals}</td>
                  <td style={{ fontWeight: 900 }}>{paidTotals}</td>
                  <td style={{ fontWeight: 900 }}>
                    <div style={{ display: "grid", gap: 4 }}>
                      <span>طلب: {receivableTotals}</span>
                      <span>پور: {debtTotals}</span>
                    </div>
                  </td>
                  <td colSpan={4}></td>
                  <td className="no-print"></td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={closeForm}>
          <div className="card modal-card employee-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <span>{editingEmployee ? "د کارکوونکي ایډیټ" : form.workerType === "misc" ? "نوی متفرقه کاریګر" : "نوی کارکوونکی"}</span>
              <button className="btn btn-outline btn-sm" onClick={closeForm}><X size={14} /></button>
            </div>
            {phoneError && <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{phoneError}</div>}
            {error && <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}
            <div style={{ overflowX: "auto", paddingBottom: 4 }}>
              <table className="fl-table compact-table employee-entry-table">
                <colgroup>
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "14%" }} />
                </colgroup>
                <thead><tr><th>نوم</th><th>د پلار نوم</th><th>معاش</th><th>تماس شمېره</th><th>وظیفه</th><th>د معاش ډول</th><th>شروع تاریخ</th><th>ختم تاریخ</th></tr></thead>
                <tbody>
                  <tr>
                    <td><input className="form-input" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} /></td>
                    <td><input className="form-input" value={form.fatherName} onChange={(e) => setForm((current) => ({ ...current, fatherName: e.target.value }))} /></td>
                    <td>
                      <input className="form-input" type="text" inputMode="decimal" value={form.wageAmount} onChange={(e) => setForm((current) => ({ ...current, wageAmount: e.target.value }))} />
                      <select className="form-input" value={form.currencyCode} onChange={(e) => setForm((current) => ({ ...current, currencyCode: e.target.value }))} style={{ marginTop: 4 }}>
                        <option value="AFN">افغانی</option><option value="USD">ډالر</option><option value="PKR">کلداره</option>
                      </select>
                    </td>
                    <td>
                      <input
                        className="form-input"
                        inputMode="numeric"
                        maxLength={10}
                        pattern="\d{10}"
                        title={phoneRestrictionMessage("تماس شمېره")}
                        value={form.phone}
                        onChange={(e) => setForm((current) => ({ ...current, phone: phoneDigits(e.target.value) }))}
                      />
                    </td>
                    <td><input className="form-input" value={form.position} onChange={(e) => setForm((current) => ({ ...current, position: e.target.value }))} /></td>
                    <td>
                      <select className="form-input" value={form.wageType} onChange={(e) => setForm((current) => ({ ...current, wageType: e.target.value as EmployeeWageType }))}>
                        <option value="daily">ورځنی</option><option value="monthly">میاشتنی</option>
                      </select>
                    </td>
                    <td><ShamsiDateInput className="form-input" value={form.startDate} onChange={(startDate) => setForm((current) => ({ ...current, startDate }))} /></td>
                    <td><ShamsiDateInput className="form-input" value={form.endDate} onChange={(endDate) => setForm((current) => ({ ...current, endDate }))} placeholder="اختیاري" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
            {form.workerType === "regular" ? (
              <div className="no-enter-navigation" style={{ marginTop: 8, border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--surface-2)" }}>
                <label className="form-label">اسناد پورته کول (اختیاري)</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <label className="btn btn-outline btn-sm" style={{ cursor: "pointer" }}>
                    <Upload size={14} /> اسناد انتخاب
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      multiple
                      style={{ display: "none" }}
                      onChange={(event) => {
                        const files = Array.from(event.target.files ?? []);
                        const validationError = validateEmployeeDocumentFiles(files);
                        if (validationError) {
                          setError(validationError);
                          setSelectedDocumentFiles([]);
                          event.target.value = "";
                          return;
                        }
                        setSelectedDocumentFiles(files);
                        setError(null);
                      }}
                    />
                  </label>
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>یوازې JPG/PNG، هر عکس تر ۵MB، ټول تر درې اسنادو.</span>
                </div>
                {selectedDocumentFiles.length ? (
                  <div style={{ display: "grid", gap: 6, marginTop: 10, fontSize: 12, color: "var(--text)" }}>
                    {selectedDocumentFiles.map((file) => (
                      <span key={`${file.name}-${file.size}`}>{file.name} - {(file.size / 1024 / 1024).toFixed(2)} MB</span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {editingEmployee && (
              <div style={{ marginTop: 8 }}>
                <label className="form-label">حالت</label>
                <select className="form-input" value={form.status} onChange={(e) => setForm((current) => ({ ...current, status: e.target.value as EmployeeStatus }))}>
                  <option value="active">فعال</option>
                  <option value="inactive">غیر فعال</option>
                </select>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button className="btn btn-primary" disabled={!form.name || !form.position || !form.wageAmount || Boolean(phoneError) || saveMutation.isPending} onClick={() => saveMutation.mutate()}>{editingEmployee ? "ساتل" : "ثبت کول"}</button>
              <button className="btn btn-outline" onClick={closeForm}>لغوه</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
