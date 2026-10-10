import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Plus, Printer, Save, Search, Trash2, X } from "lucide-react";
import { api, type Employee, type EmployeePayment, type EmployeePaymentType, type EmployeeStatus } from "../lib/api";
import PrintHeader from "../components/PrintHeader";
import JalaliDate from "../components/JalaliDate";
import ShamsiDateInput from "../components/ShamsiDateInput";
import { currencyLabel, visibleText } from "../lib/labels";
import { isValidOptionalPhone, phoneDigits, phoneRestrictionMessage } from "../lib/phone";

type TabKey = "register" | "payments" | "report";

interface MiscWorkerForm {
  name: string;
  fatherName: string;
  phone: string;
  wageAmount: string;
  currencyCode: string;
  startDate: string;
  endDate: string;
  notes: string;
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "register", label: "عمومي ثبت" },
  { key: "payments", label: "رسیدګي ثبت" },
  { key: "report", label: "د چاپ راپور" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(): MiscWorkerForm {
  return {
    name: "",
    fatherName: "",
    phone: "",
    wageAmount: "",
    currencyCode: "AFN",
    startDate: today(),
    endDate: "",
    notes: "",
  };
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

function addDays(value: string, days: number): string {
  const date = parseIsoDate(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function exclusiveDays(startValue: string | null | undefined, endValue: string | null | undefined): number {
  const start = parseIsoDate(startValue);
  const end = parseIsoDate(endValue);
  if (!start || !end || start.getTime() >= end.getTime()) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

function workerDays(worker: Employee): number {
  return exclusiveDays(worker.startDate, worker.endDate ?? addDays(today(), 1));
}

function shortWorkerNumber(worker: Employee, index = 0): string {
  return visibleText(worker.employeeNumber, `MISC${String(index + 1).padStart(3, "0")}`).replace(/^کارکوونکی[-\s]*/u, "");
}

function shortPaymentNumber(payment: EmployeePayment, index: number): string {
  return visibleText(payment.paymentNumber, `رسید ${index + 1}`).replace(/^معاش[-\s]*/u, "").replace(/^employee[_-]?payment[-\s]*/iu, "");
}

function paymentTypeLabel(type: EmployeePaymentType): string {
  if (type === "salary") return "معاش";
  if (type === "advance") return "پیشکي";
  return "د قرضداري تادیه";
}

function isClosed(worker: Employee): boolean {
  return Boolean(worker.endDate && worker.endDate <= today());
}

function stateLabel(worker: Employee): string {
  if (isClosed(worker)) return "حساب بند";
  if (worker.endDate) return "د ختم په تمه";
  return "روان";
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

function scaledToDecimal(value: bigint, scale: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
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
  const value = left.amount * 10n ** BigInt(scale - left.scale) + right.amount * 10n ** BigInt(scale - right.scale);
  return scaledToDecimal(value, scale);
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

function totalsByCurrency(workers: Employee[] | undefined, field: (worker: Employee) => string, filter?: (worker: Employee) => boolean): string {
  const totals: Record<string, string> = {};
  for (const worker of workers ?? []) {
    if (filter && !filter(worker)) continue;
    totals[worker.currencyCode] = addDecimal(totals[worker.currencyCode] ?? "0", field(worker));
  }
  return Object.entries(totals)
    .filter(([, amount]) => compareDecimal(amount, "0") !== 0)
    .map(([currency, amount]) => `${amount} ${currencyLabel(currency)}`)
    .join("، ") || "0";
}

function workerOwesCompany(worker: Employee): boolean {
  return compareDecimal(worker.balance ?? "0", "0") < 0;
}

function companyOwesWorker(worker: Employee): boolean {
  return compareDecimal(worker.balance ?? "0", "0") > 0;
}

function workerBalanceLabel(worker: Employee): string {
  return companyOwesWorker(worker) ? "پور" : "طلب";
}

function workerBalanceColor(worker: Employee): string {
  return companyOwesWorker(worker) ? "var(--danger)" : "var(--success)";
}

export default function MiscWorkersPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("register");
  const [showForm, setShowForm] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Employee | null>(null);
  const [form, setForm] = useState<MiscWorkerForm>(emptyForm());
  const [paymentWorkerId, setPaymentWorkerId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentType, setPaymentType] = useState<EmployeePaymentType>("salary");
  const [paymentNote, setPaymentNote] = useState("");
  const [editingPayment, setEditingPayment] = useState<EmployeePayment | null>(null);
  const [editPaymentAmount, setEditPaymentAmount] = useState("");
  const [editPaymentDate, setEditPaymentDate] = useState(today());
  const [editPaymentType, setEditPaymentType] = useState<EmployeePaymentType>("salary");
  const [editPaymentNote, setEditPaymentNote] = useState("");
  const [reportInput, setReportInput] = useState("");
  const [reportWorkerId, setReportWorkerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const phoneError = !isValidOptionalPhone(form.phone) ? phoneRestrictionMessage("تماس شمېره") : null;

  const { data: workers } = useQuery({
    queryKey: ["employees", "misc-workers"],
    queryFn: () => api.get<Employee[]>("/employees?workerType=misc"),
  });
  const receivableTotals = totalsByCurrency(workers, (worker) => absDecimal(worker.balance ?? "0"), workerOwesCompany);
  const debtTotals = totalsByCurrency(workers, (worker) => worker.balance ?? "0", companyOwesWorker);

  const selectedPaymentWorkerId = paymentWorkerId || String(workers?.[0]?.id ?? "");
  const selectedPaymentWorker = workers?.find((worker) => String(worker.id) === selectedPaymentWorkerId) ?? null;
  const selectedReportWorker = workers?.find((worker) => String(worker.id) === reportWorkerId) ?? null;

  const { data: paymentDetail } = useQuery({
    queryKey: ["employee", "misc-payment", selectedPaymentWorkerId],
    enabled: Boolean(selectedPaymentWorkerId),
    queryFn: () => api.get<Employee>(`/employees/${selectedPaymentWorkerId}`),
  });

  const { data: reportDetail } = useQuery({
    queryKey: ["employee", "misc-report", reportWorkerId],
    enabled: Boolean(reportWorkerId),
    queryFn: () => api.get<Employee>(`/employees/${reportWorkerId}`),
  });

  function closeForm() {
    setShowForm(false);
    setEditingWorker(null);
    setForm(emptyForm());
    setError(null);
  }

  function startCreate() {
    setEditingWorker(null);
    setForm(emptyForm());
    setError(null);
    setShowForm(true);
  }

  function startEdit(worker: Employee) {
    setEditingWorker(worker);
    setForm({
      name: worker.name,
      fatherName: worker.fatherName ?? "",
      phone: worker.phone ?? "",
      wageAmount: worker.wageAmount,
      currencyCode: worker.currencyCode,
      startDate: worker.startDate,
      endDate: worker.endDate ?? "",
      notes: worker.notes ?? "",
    });
    setError(null);
    setShowForm(true);
  }

  const workerMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        fatherName: form.fatherName || null,
        phone: form.phone || null,
        position: "متفرقه کاریګر",
        wageType: "daily",
        wageAmount: form.wageAmount,
        currencyCode: form.currencyCode,
        startDate: form.startDate,
        endDate: form.endDate || null,
        workerType: "misc",
        status: form.endDate ? "inactive" as EmployeeStatus : "active" as EmployeeStatus,
        notes: form.notes || null,
      };
      return editingWorker ? api.put<Employee>(`/employees/${editingWorker.id}`, body) : api.post<Employee>("/employees", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      closeForm();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "ثبت ناکام شو"),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => api.post<Employee>(`/employees/${id}/delete`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["trash"] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "حذف ناکام شو"),
  });

  const paymentMutation = useMutation({
    mutationFn: () => {
      if (!selectedPaymentWorker) throw new Error("متفرقه کاریګر انتخاب کړه");
      return api.post<EmployeePayment>(`/employees/${selectedPaymentWorker.id}/payments`, {
        amount: paymentAmount,
        type: paymentType,
        currencyCode: selectedPaymentWorker.currencyCode,
        paymentDate,
        note: paymentNote || "رسیدګي",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["employee"] });
      setPaymentAmount("");
      setPaymentType("salary");
      setPaymentNote("");
      setError(null);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "رسیدګي ثبت نه شوه"),
  });

  const editPaymentMutation = useMutation({
    mutationFn: () => {
      if (!selectedPaymentWorker || !editingPayment) throw new Error("متفرقه کاریګر انتخاب کړه");
      return api.put<EmployeePayment>(`/employees/${selectedPaymentWorker.id}/payments/${editingPayment.id}`, {
        amount: editPaymentAmount,
        type: editPaymentType,
        paymentDate: editPaymentDate,
        note: editPaymentNote,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["employee"] });
      setEditingPayment(null);
      setEditPaymentAmount("");
      setEditPaymentNote("");
      setError(null);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "د رسیدګي اصلاح ناکامه شوه"),
  });

  const voidPaymentMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: number; reason: string }) => {
      if (!selectedPaymentWorker) throw new Error("متفرقه کاریګر انتخاب کړه");
      return api.post<EmployeePayment>(`/employees/${selectedPaymentWorker.id}/payments/${paymentId}/void`, { reason });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["employee"] });
      qc.invalidateQueries({ queryKey: ["trash"] });
      setError(null);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "د رسیدګي حذف ناکام شو"),
  });

  function startEditPayment(payment: EmployeePayment) {
    setEditingPayment(payment);
    setEditPaymentAmount(payment.amount);
    setEditPaymentDate(payment.paymentDate);
    setEditPaymentType(payment.type);
    setEditPaymentNote(payment.note ?? "");
    setError(null);
  }

  function deletePayment(payment: EmployeePayment) {
    const reason = window.prompt("د رسیدګي د حذف دلیل ولیکئ:");
    if (!reason?.trim()) return;
    voidPaymentMutation.mutate({ paymentId: payment.id, reason: reason.trim() });
  }

  function deleteWorker(worker: Employee) {
    const reason = window.prompt("د حذف دلیل ولیکئ:");
    if (!reason?.trim()) return;
    deleteMutation.mutate({ id: worker.id, reason: reason.trim() });
  }

  function findReportWorker() {
    const query = reportInput.trim();
    const found = workers?.find((worker, index) => {
      const shortNumber = shortWorkerNumber(worker, index);
      return String(worker.id) === query || shortNumber === query || worker.employeeNumber === query || worker.name.trim() === query;
    });
    if (!found) {
      setError("په دې ID یا نوم متفرقه کاریګر ونه موندل شو");
      return;
    }
    setReportWorkerId(String(found.id));
    setError(null);
  }

  function openReport(worker: Employee, index: number) {
    setReportInput(shortWorkerNumber(worker, index));
    setReportWorkerId(String(worker.id));
    setActiveTab("report");
    setError(null);
  }

  return (
    <div className="print-report-page print-wide">
      <PrintHeader title="د متفرقه کاریګرو راپور" />
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">متفرقه کاریګر</h1>
          <p className="page-sub">د ورځنۍ مزدورۍ، رسیدګۍ، چاپ راپور او خلاصې ځانګړې برخه</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-outline" onClick={() => window.print()}>
            <Printer size={16} /> چاپ
          </button>
          <button className="btn btn-primary" onClick={startCreate}>
            <Plus size={16} /> نوی متفرقه کاریګر
          </button>
        </div>
      </div>

      <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
        {tabs.map((tab) => (
          <button key={tab.key} className={`btn btn-sm ${activeTab === tab.key ? "btn-primary" : "btn-outline"}`} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="no-print" style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontWeight: 800 }}>
          {error}
        </div>
      ) : null}

      {activeTab === "register" ? (
        <div className="card elevated-card print-report-surface" style={{ padding: 0, overflow: "auto" }}>
          <table className="fl-table" style={{ minWidth: 1200, fontSize: 13 }}>
            <thead>
              <tr>
                <th>آډي نمبر</th>
                <th>نوم</th>
                <th>د پلار نوم</th>
                <th>د ورځې مزدوري</th>
                <th>شروع تاریخ</th>
                <th>ختم تاریخ</th>
                <th>د ورځو تعداد</th>
                <th>ټول معاش</th>
                <th>ټوله رسیدګي</th>
                <th>الباقي</th>
                <th>حالت</th>
                <th className="no-print">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {workers?.map((worker, index) => (
                <tr key={worker.id}>
                  <td>{shortWorkerNumber(worker, index)}</td>
                  <td>{worker.name}</td>
                  <td>{worker.fatherName ?? "—"}</td>
                  <td>{worker.wageAmount} {currencyLabel(worker.currencyCode)}</td>
                  <td><JalaliDate date={worker.startDate} /></td>
                  <td>{worker.endDate ? <JalaliDate date={worker.endDate} /> : "—"}</td>
                  <td>{workerDays(worker)}</td>
                  <td>{worker.earnedTotal ?? "0"} {currencyLabel(worker.currencyCode)}</td>
                  <td>{worker.paidTotal ?? "0"} {currencyLabel(worker.currencyCode)}</td>
                  <td style={{ fontWeight: 900, color: workerBalanceColor(worker) }}>
                    {workerBalanceLabel(worker)}: {absDecimal(worker.balance ?? "0")} {currencyLabel(worker.currencyCode)}
                  </td>
                  <td>{stateLabel(worker)}</td>
                  <td className="no-print">
                    <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openReport(worker, index)}>راپور</button>
                      <button className="btn btn-outline btn-sm" onClick={() => startEdit(worker)}><Edit2 size={13} /> ایډیټ</button>
                      <button className="btn btn-outline btn-sm" onClick={() => deleteWorker(worker)} disabled={deleteMutation.isPending}><Trash2 size={13} /> ډیلیټ</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!workers?.length ? (
                <tr>
                  <td colSpan={12} style={{ textAlign: "center", padding: 30, color: "var(--muted)" }}>تر اوسه متفرقه کاریګر نشته.</td>
                </tr>
              ) : null}
            </tbody>
            {workers?.length ? (
              <tfoot>
                <tr>
                  <td colSpan={9} style={{ fontWeight: 900 }}>ټول</td>
                  <td style={{ fontWeight: 900 }}>طلب: {receivableTotals} | پور: {debtTotals}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : null}

      {activeTab === "payments" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div className="card elevated-card no-print" style={{ padding: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.2fr) minmax(120px, 1fr) repeat(2, minmax(130px, 1fr)) minmax(140px, 1fr) auto", gap: 12, alignItems: "end" }}>
              <div>
                <label className="form-label">متفرقه کاریګر</label>
                <select className="form-input" value={selectedPaymentWorkerId} onChange={(e) => setPaymentWorkerId(e.target.value)}>
                  {(workers ?? []).map((worker, index) => (
                    <option key={worker.id} value={worker.id}>{shortWorkerNumber(worker, index)} - {worker.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">ډول</label>
                <select className="form-input" value={paymentType} onChange={(e) => setPaymentType(e.target.value as EmployeePaymentType)}>
                  <option value="salary">معاش</option>
                  <option value="advance">پیشکي</option>
                  <option value="debt_repayment">د قرضداري تادیه</option>
                </select>
              </div>
              <div>
                <label className="form-label">رسیدګي</label>
                <input className="form-input" type="text" inputMode="decimal" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
              </div>
              <div>
                <label className="form-label">تاریخ</label>
                <ShamsiDateInput className="form-input" value={paymentDate} onChange={setPaymentDate} />
              </div>
              <div>
                <label className="form-label">یادښت</label>
                <input className="form-input" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} />
              </div>
              <button className="btn btn-primary" disabled={!selectedPaymentWorker || !paymentAmount || paymentMutation.isPending} onClick={() => paymentMutation.mutate()}>
                <Save size={16} /> ثبت
              </button>
            </div>
            {selectedPaymentWorker && isClosed(selectedPaymentWorker) ? (
              <div style={{ marginTop: 12, color: "var(--danger)", fontWeight: 900 }}>د دې کاریګر حساب بند دی؛ یوازې تادیه ثبتېدای شي.</div>
            ) : null}
          </div>

          <div className="card elevated-card print-report-surface" style={{ padding: 0, overflow: "auto" }}>
            <table className="fl-table" style={{ minWidth: 760, fontSize: 13 }}>
              <thead><tr><th>شمېره</th><th>تاریخ</th><th>ډول</th><th>اندازه</th><th>پخوانی حساب</th><th>نوی حساب</th><th>یادښت</th><th className="no-print">عملیات</th></tr></thead>
              <tbody>
                {paymentDetail?.payments?.map((payment, index) => (
                  <tr key={payment.id}>
                    <td>{shortPaymentNumber(payment, index)}</td>
                    <td><JalaliDate date={payment.paymentDate} /></td>
                    <td>{paymentTypeLabel(payment.type)}</td>
                    <td style={{ color: "var(--success)", fontWeight: 900 }}>{payment.amount} {currencyLabel(payment.currencyCode)}</td>
                    <td>{payment.previousBalance ?? "0"}</td>
                    <td>{payment.newBalance ?? "0"}</td>
                    <td>{payment.note ?? "—"}</td>
                    <td className="no-print">
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-outline btn-sm" disabled={voidPaymentMutation.isPending || editPaymentMutation.isPending} onClick={() => startEditPayment(payment)}>اصلاح</button>
                        <button className="btn btn-danger btn-sm" disabled={voidPaymentMutation.isPending || editPaymentMutation.isPending} onClick={() => deletePayment(payment)}>حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!paymentDetail?.payments?.length ? <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>رسیدګي نشته.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeTab === "report" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div className="card elevated-card no-print" style={{ padding: 18 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
              <div>
                <label className="form-label">ID / نوم</label>
                <input className="form-input" value={reportInput} onChange={(e) => setReportInput(e.target.value)} style={{ width: 220 }} />
              </div>
              <button className="btn btn-primary" onClick={findReportWorker}><Search size={16} /> پیدا کول</button>
              <button className="btn btn-outline" onClick={() => window.print()}><Printer size={16} /> چاپ</button>
            </div>
          </div>

          {selectedReportWorker ? (
            <div className="card elevated-card print-report-surface" style={{ padding: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", borderBottom: "1px solid var(--border)", paddingBottom: 14, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{selectedReportWorker.name}</div>
                  <div style={{ color: "var(--muted)", fontWeight: 800 }}>ID: {shortWorkerNumber(selectedReportWorker)}</div>
                </div>
                <div style={{ fontWeight: 900 }}>{stateLabel(selectedReportWorker)}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
                <div><b>د پلار نوم:</b> {selectedReportWorker.fatherName ?? "—"}</div>
                <div><b>د ورځې مزدوري:</b> {selectedReportWorker.wageAmount} {currencyLabel(selectedReportWorker.currencyCode)}</div>
                <div><b>شروع:</b> <JalaliDate date={selectedReportWorker.startDate} /></div>
                <div><b>ختم:</b> {selectedReportWorker.endDate ? <JalaliDate date={selectedReportWorker.endDate} /> : "—"}</div>
                <div><b>ورځې:</b> {workerDays(selectedReportWorker)}</div>
                <div><b>ټول معاش:</b> {selectedReportWorker.earnedTotal ?? "0"} {currencyLabel(selectedReportWorker.currencyCode)}</div>
                <div><b>ټوله رسیدګي:</b> {selectedReportWorker.paidTotal ?? "0"} {currencyLabel(selectedReportWorker.currencyCode)}</div>
                <div><b>الباقي:</b> {selectedReportWorker.balance ?? "0"} {currencyLabel(selectedReportWorker.currencyCode)}</div>
              </div>
              {reportDetail?.workPeriods?.length ? (
                <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: 12, marginBottom: 14, fontWeight: 900 }}>
                  نوی حساب د <JalaliDate date={selectedReportWorker.startDate} /> څخه شروع شو.
                </div>
              ) : null}
              {reportDetail?.workPeriods?.length ? (
                <table className="fl-table" style={{ fontSize: 13, marginBottom: 14 }}>
                  <thead><tr><th>پخوانی شروع</th><th>پخوانی ختم</th><th>د ورځې مزدوري</th><th>یادښت</th></tr></thead>
                  <tbody>
                    {reportDetail.workPeriods.map((period) => (
                      <tr key={period.id}>
                        <td><JalaliDate date={period.startDate} /></td>
                        <td><JalaliDate date={period.endDate} /></td>
                        <td>{period.wageAmount} {currencyLabel(period.currencyCode)}</td>
                        <td>{period.note ?? "پخوانی حساب"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <table className="fl-table" style={{ fontSize: 13 }}>
                <thead><tr><th>شمېره</th><th>تاریخ</th><th>ډول</th><th>رسیدګي</th><th>پخوانی حساب</th><th>نوی حساب</th><th>یادښت</th></tr></thead>
                <tbody>
                  {reportDetail?.payments?.map((payment, index) => (
                    <tr key={payment.id}>
                      <td>{shortPaymentNumber(payment, index)}</td>
                      <td><JalaliDate date={payment.paymentDate} /></td>
                      <td>{paymentTypeLabel(payment.type)}</td>
                      <td>{payment.amount} {currencyLabel(payment.currencyCode)}</td>
                      <td>{payment.previousBalance ?? "0"}</td>
                      <td>{payment.newBalance ?? "0"}</td>
                      <td>{payment.note ?? "—"}</td>
                    </tr>
                  ))}
                  {!reportDetail?.payments?.length ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 22, color: "var(--muted)" }}>رسیدګي نشته.</td></tr> : null}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card elevated-card" style={{ padding: 28, color: "var(--muted)", textAlign: "center" }}>
              د راپور لپاره ID یا نوم ولیکئ.
            </div>
          )}
        </div>
      ) : null}

      {showForm ? (
        <div className="modal-backdrop" onClick={closeForm}>
          <div className="card modal-card" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 720 }}>
            <div className="modal-title">
              <span>{editingWorker ? "د متفرقه کاریګر ایډیټ" : "نوی متفرقه کاریګر"}</span>
              <button className="btn btn-outline btn-sm" onClick={closeForm}><X size={14} /></button>
            </div>
            {phoneError ? <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{phoneError}</div> : null}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              <div><label className="form-label">نوم</label><input className="form-input" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} /></div>
              <div><label className="form-label">د پلار نوم</label><input className="form-input" value={form.fatherName} onChange={(e) => setForm((current) => ({ ...current, fatherName: e.target.value }))} /></div>
              <div>
                <label className="form-label">د ورځې مزدوري</label>
                <input className="form-input" type="text" inputMode="decimal" value={form.wageAmount} onChange={(e) => setForm((current) => ({ ...current, wageAmount: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">اسعار</label>
                <select className="form-input" value={form.currencyCode} onChange={(e) => setForm((current) => ({ ...current, currencyCode: e.target.value }))}>
                  <option value="AFN">افغاني</option>
                  <option value="USD">ډالر</option>
                  <option value="PKR">کلداره</option>
                </select>
              </div>
              <div>
                <label className="form-label">تماس شمېره</label>
                <input className="form-input" inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setForm((current) => ({ ...current, phone: phoneDigits(e.target.value) }))} />
              </div>
              <div><label className="form-label">شروع تاریخ</label><ShamsiDateInput className="form-input" value={form.startDate} onChange={(startDate) => setForm((current) => ({ ...current, startDate }))} /></div>
              <div><label className="form-label">ختم تاریخ</label><ShamsiDateInput className="form-input" value={form.endDate} onChange={(endDate) => setForm((current) => ({ ...current, endDate }))} placeholder="اختیاري" /></div>
              <div><label className="form-label">یادښت</label><input className="form-input" value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-primary" disabled={!form.name || !form.wageAmount || Boolean(phoneError) || workerMutation.isPending} onClick={() => workerMutation.mutate()}>
                <Save size={16} /> ثبت
              </button>
              <button className="btn btn-outline" onClick={closeForm}>لغوه</button>
            </div>
          </div>
        </div>
      ) : null}

      {editingPayment ? (
        <div className="modal-backdrop" onClick={() => setEditingPayment(null)}>
          <div className="card modal-card" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-title">
              <span>د رسیدګي ایډیټ</span>
              <button className="btn btn-outline btn-sm" onClick={() => setEditingPayment(null)}><X size={14} /></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              <div>
                <label className="form-label">ډول</label>
                <select className="form-input" value={editPaymentType} onChange={(e) => setEditPaymentType(e.target.value as EmployeePaymentType)}>
                  <option value="salary">معاش</option>
                  <option value="advance">پیشکي</option>
                  <option value="debt_repayment">د قرضداري تادیه</option>
                </select>
              </div>
              <div>
                <label className="form-label">اندازه</label>
                <input className="form-input" type="text" inputMode="decimal" value={editPaymentAmount} onChange={(e) => setEditPaymentAmount(e.target.value)} />
              </div>
              <div>
                <label className="form-label">تاریخ</label>
                <ShamsiDateInput className="form-input" value={editPaymentDate} onChange={setEditPaymentDate} />
              </div>
              <div>
                <label className="form-label">یادښت</label>
                <input className="form-input" value={editPaymentNote} onChange={(e) => setEditPaymentNote(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-primary" disabled={!editPaymentAmount || editPaymentMutation.isPending} onClick={() => editPaymentMutation.mutate()}>
                <Save size={16} /> ثبت
              </button>
              <button className="btn btn-outline" onClick={() => setEditingPayment(null)}>لغوه</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
