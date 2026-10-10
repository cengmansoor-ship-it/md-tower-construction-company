import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { BookOpen, Eye, EyeOff, Pencil, Plus, Power, Printer, RotateCcw, Save, ShieldCheck, Trash2, UserCheck, X } from "lucide-react";
import ShamsiDateInput from "../components/ShamsiDateInput";
import ViewModeToggle, { type ViewMode } from "../components/ViewModeToggle";
import { api, type GeneralReportRow, type GeneralReportSectionSummary, type ManagedUser, type RoleWithPermissions } from "../lib/api";
import { isoToJalaliString } from "../lib/jalali";
import { currencyLabel, permissionLabel, userDisplayName } from "../lib/labels";
import { PASSWORD_POLICY_TEXT, passwordValidationMessage } from "../lib/passwordPolicy";

interface KafilDelegation {
  id: number;
  delegatedUserId: number;
  delegatedUserName: string;
  delegatedUsername: string;
  delegatedByUserId: number | null;
  delegatedByName: string | null;
  delegatedRole: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  isActive: boolean;
  isCurrentlyActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface KafilForm {
  delegatedUserId: string;
  username: string;
  password: string;
  startDate: string;
  endDate: string;
  reason: string;
}

interface KafilLedgerReport {
  delegation: {
    id: number;
    delegatedUserId: number;
    delegatedUserName: string;
    delegatedUsername: string;
    startDate: string;
    endDate: string;
    reason: string | null;
    isActive: boolean;
  } | null;
  rows: GeneralReportRow[];
  summary: GeneralReportSectionSummary;
}

const KAFIL_ROLE = "kafil";

function isoAfterDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function emptyForm(): KafilForm {
  return {
    delegatedUserId: "",
    username: "",
    password: "",
    startDate: isoAfterDays(0),
    endDate: isoAfterDays(7),
    reason: "",
  };
}

function statusText(delegation: KafilDelegation): { label: string; className: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (delegation.isCurrentlyActive) return { label: "فعال", className: "badge-success" };
  if (!delegation.isActive) return { label: "غیر فعال", className: "badge-muted" };
  if (delegation.startDate > today) return { label: "راتلونکی", className: "badge-warning" };
  return { label: "پای ته رسېدلی", className: "badge-danger" };
}

function formatMoney(value: string | number | null | undefined, currencyCode?: string | null): string {
  const amount = String(value ?? "0");
  return currencyCode ? `${amount} ${currencyLabel(currencyCode)}` : amount;
}

function formatSummaryMoney(summary: GeneralReportSectionSummary | undefined, key: keyof GeneralReportSectionSummary["byCurrency"][string]): string {
  if (!summary || Object.keys(summary.byCurrency).length === 0) return "0";
  return Object.entries(summary.byCurrency)
    .map(([currency, values]) => formatMoney(values[key], currency))
    .join(" / ");
}

function delegationMatchesSearch(delegation: KafilDelegation, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    delegation.delegatedUserName,
    delegation.delegatedUsername,
    delegation.delegatedByName,
    delegation.delegatedRole,
    delegation.startDate,
    delegation.endDate,
    delegation.reason,
  ].some((value) => String(value ?? "").toLowerCase().includes(needle));
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default function KafilManagementPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("q") ?? "";
  const [form, setForm] = useState<KafilForm>(() => emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [q, setQ] = useState(urlSearch);
  const [error, setError] = useState<string | null>(null);
  const [ledgerDelegationId, setLedgerDelegationId] = useState<number | null>(null);

  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => api.get<ManagedUser[]>("/users") });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => api.get<RoleWithPermissions[]>("/roles") });
  const { data: delegations, isLoading } = useQuery({
    queryKey: ["delegations"],
    queryFn: () => api.get<KafilDelegation[]>("/delegations"),
  });
  const { data: ledgerReport, isFetching: isLedgerFetching } = useQuery({
    queryKey: ["delegation-ledger", ledgerDelegationId],
    queryFn: () => api.get<KafilLedgerReport>(`/delegations/${ledgerDelegationId}/ledger`),
    enabled: ledgerDelegationId !== null,
  });

  const kafilRole = roles?.find((role) => role.name === KAFIL_ROLE) ?? null;
  const activeUsers = useMemo(() => (users ?? []).filter((user) => user.isActive), [users]);
  const rows = useMemo(() => (delegations ?? []).filter((delegation) => delegationMatchesSearch(delegation, q)), [delegations, q]);
  const activeRows = rows.filter((row) => row.isCurrentlyActive);
  const futureRows = rows.filter((row) => row.isActive && !row.isCurrentlyActive && row.startDate > new Date().toISOString().slice(0, 10));
  const closedRows = rows.filter((row) => !row.isActive || (!row.isCurrentlyActive && row.endDate < new Date().toISOString().slice(0, 10)));
  const passwordError = form.password ? passwordValidationMessage(form.password, form.username) : editingId ? null : "پټنوم اړین دی.";

  useEffect(() => {
    setQ(urlSearch);
  }, [urlSearch]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const delegatedUserId = Number(form.delegatedUserId);
      if (!delegatedUserId || !form.startDate || !form.endDate) throw new Error("اړین معلومات بشپړ کړئ");
      if (!form.username.trim()) throw new Error("کارن نوم ولیکئ");
      const currentPasswordError = form.password ? passwordValidationMessage(form.password, form.username) : editingId ? null : "پټنوم اړین دی.";
      if (currentPasswordError) throw new Error(currentPasswordError);
      if (form.endDate < form.startDate) throw new Error("ختم تاریخ باید د شروع تاریخ وروسته وي");
      const payload = {
        delegatedUserId,
        username: form.username.trim(),
        password: form.password,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason,
        isActive: true,
      };
      return editingId ? api.put<KafilDelegation>(`/delegations/${editingId}`, payload) : api.post<KafilDelegation>("/delegations", payload);
    },
    onSuccess: () => {
      setForm(emptyForm());
      setEditingId(null);
      setShowForm(false);
      setError(null);
      qc.invalidateQueries({ queryKey: ["delegations"] });
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "ثبت ونه شو"),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "activate" | "deactivate" | "delete" }) => {
      if (action === "delete") return api.delete(`/delegations/${id}`);
      return api.put(`/delegations/${id}/${action}`, {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delegations"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  function openNewForm() {
    setForm(emptyForm());
    setEditingId(null);
    setShowPassword(false);
    setError(null);
    setShowForm(true);
  }

  function selectDelegatedUser(value: string) {
    const selected = activeUsers.find((user) => String(user.id) === value);
    setForm((current) => ({
      ...current,
      delegatedUserId: value,
      username: selected?.username ?? "",
    }));
  }

  function openEditForm(delegation: KafilDelegation) {
    setForm({
      delegatedUserId: String(delegation.delegatedUserId),
      username: delegation.delegatedUsername,
      password: "",
      startDate: delegation.startDate,
      endDate: delegation.endDate,
      reason: delegation.reason ?? "",
    });
    setEditingId(delegation.id);
    setShowPassword(false);
    setError(null);
    setShowForm(true);
  }

  function removeDelegation(delegation: KafilDelegation) {
    if (!window.confirm("دا کفالت حذف شي؟")) return;
    actionMutation.mutate({ id: delegation.id, action: "delete" });
  }

  function printKafilLedger() {
    if (!ledgerReport) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const summary = ledgerReport.summary;
    const summaryItems = [
      ["جمله", formatSummaryMoney(summary, "totalAmount")],
      ["رسیده", formatSummaryMoney(summary, "moneyReceived")],
      ["ورکړه", formatSummaryMoney(summary, "moneyPaid")],
      ["طلب", formatSummaryMoney(summary, "owedToCompany")],
      ["پور", formatSummaryMoney(summary, "owedByCompany")],
    ];
    const summaryHtml = summaryItems
      .map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`)
      .join("");
    const rowsHtml = ledgerReport.rows.length
      ? ledgerReport.rows
          .map(
            (row) => `<tr>
              <td>${escapeHtml(row.date ? isoToJalaliString(row.date) : "-")}</td>
              <td>${escapeHtml(row.reference || "-")}</td>
              <td>${escapeHtml(row.itemName || "-")}</td>
              <td class="detail">${escapeHtml(row.note || "")}</td>
              <td>${escapeHtml(formatMoney(row.totalAmount, row.currencyCode))}</td>
              <td>${escapeHtml(formatMoney(row.moneyReceived, row.currencyCode))}</td>
              <td>${escapeHtml(formatMoney(row.moneyPaid, row.currencyCode))}</td>
              <td>${escapeHtml(formatMoney(row.owedToCompany, row.currencyCode))}</td>
              <td>${escapeHtml(formatMoney(row.owedByCompany, row.currencyCode))}</td>
            </tr>`,
          )
          .join("")
      : `<tr><td colspan="9" class="empty">ددې کفیل په موده کې ریکارډ نشته.</td></tr>`;
    const delegationName = ledgerReport.delegation?.delegatedUserName || ledgerReport.delegation?.delegatedUsername || "کفیل";
    const period = ledgerReport.delegation ? `${ledgerReport.delegation.startDate} - ${ledgerReport.delegation.endDate}` : "";

    printWindow.document.write(`<!doctype html>
      <html lang="ps" dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(delegationName)} - کفیل کهاته</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body { margin: 0; font-family: "Bahij Zar", "Noto Naskh Arabic", "Segoe UI", system-ui, sans-serif; color: #0f172a; background: #eaf3ff; direction: rtl; }
            .sheet {
              min-height: 100vh;
              padding: 12mm;
              background: linear-gradient(135deg, #f8fbff 0%, #eef8f3 100%);
              border: 1px solid #cbd5e1;
            }
            h1 { margin: 0 0 4mm; text-align: center; font-size: 22px; font-weight: 900; }
            .subtitle { text-align: center; margin-bottom: 8mm; color: #475569; font-size: 13px; font-weight: 800; }
            .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4mm; margin-bottom: 7mm; }
            .summary div { display: grid; gap: 2mm; padding: 4mm; border: 1px solid #bfdbfe; border-radius: 6px; background: #eff6ff; font-weight: 900; }
            .summary span { color: #166534; }
            table { width: 100%; border-collapse: collapse; background: #fff; font-size: 13px; }
            th, td { border: 1px solid #111827; padding: 6px 7px; text-align: center; vertical-align: middle; }
            th { background: #dbeafe; font-size: 14px; font-weight: 900; }
            .detail { text-align: right; min-width: 160px; }
            .empty { padding: 16px; color: #64748b; font-weight: 800; }
            @media print {
              body { background: #fff; }
              .sheet { min-height: auto; border: 0; }
            }
          </style>
        </head>
        <body>
          <main class="sheet">
            <h1>کفیل کهاته</h1>
            <div class="subtitle">${escapeHtml(delegationName)}${period ? ` | ${escapeHtml(period)}` : ""}</div>
            <section class="summary">${summaryHtml}</section>
            <table>
              <thead>
                <tr>
                  <th>تاریخ</th>
                  <th>حواله</th>
                  <th>برخه</th>
                  <th>تفصیل</th>
                  <th>جمله</th>
                  <th>رسیده</th>
                  <th>ورکړه</th>
                  <th>طلب</th>
                  <th>پور</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </main>
          <script>
            window.addEventListener("load", () => {
              window.focus();
              setTimeout(() => window.print(), 150);
            });
          </script>
        </body>
      </html>`);
    printWindow.document.close();
  }

  function renderActions(delegation: KafilDelegation) {
    return (
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setLedgerDelegationId(delegation.id)} title="کهاته لیدل">
          <BookOpen size={14} /> کهاته لیدل
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => openEditForm(delegation)} title="تغیرول">
          <Pencil size={14} /> تغیرول
        </button>
        {delegation.isActive ? (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={actionMutation.isPending}
            onClick={() => actionMutation.mutate({ id: delegation.id, action: "deactivate" })}
            title="غیر فعالول"
          >
            <Power size={14} /> غیر فعالول
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={actionMutation.isPending}
            onClick={() => actionMutation.mutate({ id: delegation.id, action: "activate" })}
            title="بیا فعالول"
          >
            <RotateCcw size={14} /> بیا فعالول
          </button>
        )}
        <button type="button" className="btn btn-danger btn-sm" disabled={actionMutation.isPending} onClick={() => removeDelegation(delegation)} title="حذف">
          <Trash2 size={14} /> حذف
        </button>
      </div>
    );
  }

  function renderCard(delegation: KafilDelegation) {
    const status = statusText(delegation);
    return (
      <div className="card interactive-card" key={delegation.id}>
        <div className="card-body" style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <strong style={{ fontSize: 16 }}>{userDisplayName(delegation.delegatedUserName, null)}</strong>
            <span className={`badge ${status.className}`}>{status.label}</span>
          </div>
          <div style={{ display: "grid", gap: 8, color: "var(--muted)", fontWeight: 800 }}>
            <span>کارن نوم: {delegation.delegatedUsername}</span>
            <span>شروع تاریخ: {isoToJalaliString(delegation.startDate)}</span>
            <span>ختم تاریخ: {isoToJalaliString(delegation.endDate)}</span>
            <span>ټاکونکی: {userDisplayName(delegation.delegatedByName, null)}</span>
            <span>یادښت: {delegation.reason || "نشته"}</span>
          </div>
          {renderActions(delegation)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">د کفیل مدیریت</h1>
          <p className="page-sub">د وخت له مخې د کفیل ټاکل، حالت او واکونه.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openNewForm}>
          <Plus size={18} /> نوی کفیل
        </button>
      </div>

      <div className="kafil-summary-grid">
        <div className="kafil-summary-card">
          <div className="kafil-summary-label">فعال کفالتونه</div>
          <div className="kafil-summary-value">{activeRows.length}</div>
        </div>
        <div className="kafil-summary-card">
          <div className="kafil-summary-label">راتلونکي کفالتونه</div>
          <div className="kafil-summary-value">{futureRows.length}</div>
        </div>
        <div className="kafil-summary-card">
          <div className="kafil-summary-label">ټول ثبتونه</div>
          <div className="kafil-summary-value">{rows.length}</div>
        </div>
        <div className="kafil-summary-card">
          <div className="kafil-summary-label">تړل شوي کفالتونه</div>
          <div className="kafil-summary-value">{closedRows.length}</div>
        </div>
      </div>

      {showForm ? (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <UserCheck size={18} /> {editingId ? "د کفالت تغیر" : "د نوي کفیل معلومات"}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)} title="بندول">
              <X size={16} />
            </button>
          </div>
          <div className="card-body">
            {error ? <div className="alert alert-danger" style={{ marginBottom: 14 }}>{error}</div> : null}
            <div className="kafil-form-grid">
              <div>
                <label className="form-label">کفیل</label>
                <select className="form-input" value={form.delegatedUserId} onChange={(event) => selectDelegatedUser(event.target.value)}>
                  <option value="">کفیل وټاکئ</option>
                  {activeUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {userDisplayName(user.fullName, user.username)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">کارن نوم</label>
                <input
                  className="form-input"
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                />
              </div>
              <div>
                <label className="form-label">پټنوم</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="form-input"
                    style={{ paddingLeft: 44 }}
                    name="arabian-kafil-secret"
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder={editingId ? "که بدلوئ نو قوي پټنوم ولیکئ" : "قوي پټنوم"}
                    autoComplete="new-password"
                    autoCorrect="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    title={showPassword ? "پټنوم پټول" : "پټنوم ښکاره کول"}
                    aria-label={showPassword ? "پټنوم پټول" : "پټنوم ښکاره کول"}
                    style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted-light)", cursor: "pointer", border: "none", background: "transparent", padding: 4, display: "flex" }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <div className={`password-policy-hint ${passwordError ? "is-error" : "is-ok"}`}>
                  {passwordError || PASSWORD_POLICY_TEXT}
                </div>
              </div>
              <div>
                <label className="form-label">شروع تاریخ</label>
                <ShamsiDateInput className="form-input" value={form.startDate} onChange={(startDate) => setForm((current) => ({ ...current, startDate }))} />
              </div>
              <div>
                <label className="form-label">ختم تاریخ</label>
                <ShamsiDateInput className="form-input" value={form.endDate} onChange={(endDate) => setForm((current) => ({ ...current, endDate }))} />
              </div>
              <div>
                <label className="form-label">یادښت</label>
                <input className="form-input" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
                <X size={16} /> لغوه
              </button>
              <button type="button" className="btn btn-primary" disabled={saveMutation.isPending || !!passwordError} onClick={() => saveMutation.mutate()}>
                <Save size={16} /> {editingId ? "تغیر ثبتول" : "ثبتول"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 0.35fr)", gap: 18, alignItems: "start" }}>
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="card-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <UserCheck size={18} /> د کفالت لیست
            </div>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
          <div className="card-body" style={{ padding: viewMode === "list" ? 0 : 18 }}>
            {isLoading ? (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontWeight: 800 }}>بارېدل...</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontWeight: 800 }}>تر اوسه کفیل نه دی ثبت شوی.</div>
            ) : viewMode === "grid" ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
                {rows.map(renderCard)}
              </div>
            ) : (
              <table className="fl-table">
                <thead>
                  <tr>
                    <th>حالت</th>
                    <th>کفیل</th>
                    <th>کارن نوم</th>
                    <th>شروع تاریخ</th>
                    <th>ختم تاریخ</th>
                    <th>ټاکونکی</th>
                    <th>یادښت</th>
                    <th>کړنه</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((delegation) => {
                    const status = statusText(delegation);
                    return (
                      <tr key={delegation.id}>
                        <td><span className={`badge ${status.className}`}>{status.label}</span></td>
                        <td style={{ fontWeight: 900 }}>{userDisplayName(delegation.delegatedUserName, null)}</td>
                        <td>{delegation.delegatedUsername}</td>
                        <td>{isoToJalaliString(delegation.startDate)}</td>
                        <td>{isoToJalaliString(delegation.endDate)}</td>
                        <td>{userDisplayName(delegation.delegatedByName, null)}</td>
                        <td>{delegation.reason || "نشته"}</td>
                        <td>{renderActions(delegation)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={18} /> د کفیل واکونه
            </div>
            <span className="badge badge-muted">{kafilRole?.permissions.length ?? 0} واکونه</span>
          </div>
          <div className="card-body" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {kafilRole?.permissions.map((permission) => (
              <span key={permission} className="badge badge-muted">{permissionLabel(permission)}</span>
            ))}
            {!kafilRole ? <span style={{ color: "var(--muted)", fontWeight: 800 }}>د کفیل واک لا نه دی جوړ شوی.</span> : null}
          </div>
        </div>
      </div>

      {ledgerDelegationId !== null ? (
        <div className="modal-backdrop no-print kafil-ledger-backdrop" onClick={() => setLedgerDelegationId(null)}>
          <div className="modal-card kafil-ledger-modal" onClick={(event) => event.stopPropagation()} style={{ width: "min(1100px, 96vw)", maxHeight: "88vh", overflow: "auto" }}>
            <div className="card-header" style={{ margin: "-24px -24px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <BookOpen size={18} /> کفیل کهاته
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={printKafilLedger} disabled={isLedgerFetching || !ledgerReport} title="چاپ">
                  <Printer size={14} /> چاپ
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLedgerDelegationId(null)} title="بندول">
                  <X size={16} />
                </button>
              </div>
            </div>
            {isLedgerFetching ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontWeight: 800 }}>بارېدل...</div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <div className="ledger-balance-alert" style={{ margin: 0 }}>
                  <span>جمله: {formatSummaryMoney(ledgerReport?.summary, "totalAmount")}</span>
                  <span>رسیده: {formatSummaryMoney(ledgerReport?.summary, "moneyReceived")}</span>
                  <span>ورکړه: {formatSummaryMoney(ledgerReport?.summary, "moneyPaid")}</span>
                  <span>طلب: {formatSummaryMoney(ledgerReport?.summary, "owedToCompany")}</span>
                  <span>پور: {formatSummaryMoney(ledgerReport?.summary, "owedByCompany")}</span>
                </div>
                <div className="ledger-list-surface kafil-ledger-print-surface" style={{ overflow: "auto" }}>
                  <table className="fl-table ledger-table" style={{ minWidth: 980, fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th>تاریخ</th>
                        <th>حواله</th>
                        <th>برخه</th>
                        <th>تفصیل</th>
                        <th>جمله</th>
                        <th>رسیده</th>
                        <th>ورکړه</th>
                        <th>طلب</th>
                        <th>پور</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerReport?.rows.map((row, index) => (
                        <tr key={`${row.reference}-${index}`}>
                          <td>{row.date ? isoToJalaliString(row.date) : "—"}</td>
                          <td>{row.reference}</td>
                          <td>{row.itemName || "—"}</td>
                          <td style={{ textAlign: "right" }}>{row.note || ""}</td>
                          <td>{formatMoney(row.totalAmount, row.currencyCode)}</td>
                          <td>{formatMoney(row.moneyReceived, row.currencyCode)}</td>
                          <td>{formatMoney(row.moneyPaid, row.currencyCode)}</td>
                          <td>{formatMoney(row.owedToCompany, row.currencyCode)}</td>
                          <td>{formatMoney(row.owedByCompany, row.currencyCode)}</td>
                        </tr>
                      ))}
                      {!ledgerReport?.rows.length ? (
                        <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--muted)", padding: 22 }}>ددې کفیل په موده کې ریکارډ نشته.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
