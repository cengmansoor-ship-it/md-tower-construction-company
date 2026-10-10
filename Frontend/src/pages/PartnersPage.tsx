import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Edit2, Plus, Printer, Trash2, X } from "lucide-react";
import { api, type CompanyPartner } from "../lib/api";
import ShamsiDateInput from "../components/ShamsiDateInput";
import ViewModeToggle, { type ViewMode } from "../components/ViewModeToggle";
import { currencyLabel, visibleText } from "../lib/labels";
import PrintHeader from "../components/PrintHeader";

interface NewPartnerForm {
  name: string;
  initialInvestment: string;
  currencyCode: string;
  ownershipPercent: string;
  joinDate: string;
  notes: string;
}

function emptyForm(): NewPartnerForm {
  return {
    name: "",
    initialInvestment: "",
    currencyCode: "AFN",
    ownershipPercent: "",
    joinDate: new Date().toISOString().slice(0, 10),
    notes: "",
  };
}

function partnerMatchesSearch(partner: CompanyPartner, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    partner.name,
    partner.partnerNumber,
    partner.currencyCode,
    partner.ownershipPercent,
    partner.joinDate,
    partner.notes,
    partner.status,
  ].some((value) => String(value ?? "").toLowerCase().includes(needle));
}

export default function PartnersPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("q") ?? "";
  const [showForm, setShowForm] = useState(false);
  const [editingPartner, setEditingPartner] = useState<CompanyPartner | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [form, setForm] = useState<NewPartnerForm>(emptyForm());
  const [q, setQ] = useState(urlSearch);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQ(urlSearch);
  }, [urlSearch]);

  const { data: partners } = useQuery({
    queryKey: ["company-partners"],
    queryFn: () => api.get<CompanyPartner[]>("/company-partners"),
  });
  const visiblePartners = (partners ?? []).filter((partner) => partnerMatchesSearch(partner, q));

  function closeForm() {
    setShowForm(false);
    setEditingPartner(null);
    setForm(emptyForm());
    setError(null);
  }

  function startCreatePartner() {
    setEditingPartner(null);
    setForm(emptyForm());
    setError(null);
    setShowForm(true);
  }

  function startEditPartner(partner: CompanyPartner) {
    setEditingPartner(partner);
    setForm({
      name: partner.name,
      initialInvestment: partner.initialInvestment ?? "",
      currencyCode: partner.currencyCode,
      ownershipPercent: partner.ownershipPercent ?? "",
      joinDate: partner.joinDate,
      notes: partner.notes ?? "",
    });
    setError(null);
    setShowForm(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      editingPartner
        ? api.put<CompanyPartner>(`/company-partners/${editingPartner.id}`, {
            name: form.name.trim(),
            initialInvestment: form.initialInvestment || 0,
            ownershipPercent: form.ownershipPercent || null,
            joinDate: form.joinDate,
            notes: form.notes || null,
          })
        : api.post<CompanyPartner>("/company-partners", {
            name: form.name.trim(),
            initialInvestment: form.initialInvestment || 0,
            currencyCode: form.currencyCode,
            ownershipPercent: form.ownershipPercent || null,
            joinDate: form.joinDate,
            notes: form.notes || null,
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-partners"] });
      closeForm();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "ناکامي"),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => api.post<CompanyPartner>(`/company-partners/${id}/delete`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-partners"] });
      qc.invalidateQueries({ queryKey: ["trash"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "حذف ناکام شو"),
  });

  function deletePartner(partner: CompanyPartner) {
    const reason = window.prompt("د حذف دلیل ولیکئ:");
    if (!reason?.trim()) return;
    deleteMutation.mutate({ id: partner.id, reason: reason.trim() });
  }

  const canSavePartner = Boolean(form.name.trim()) && !saveMutation.isPending;

  return (
    <div className="print-report-page">
      <PrintHeader title="شریکان راپور" />
      <div className="page-header">
        <div>
          <h1 className="page-title">شریکان</h1>
          <p className="page-sub">د شریکانو ثبت، لومړنۍ سرمایه او د پانګې فیصدي</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <button className="btn btn-outline" onClick={() => window.print()}>
            <Printer size={16} /> چاپ
          </button>
          <button className="btn btn-primary" onClick={startCreatePartner}>
            <Plus size={16} /> نوی شریک
          </button>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="list-grid">
          {visiblePartners.map((partner) => (
            <div key={partner.id} className="list-card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <strong>{partner.name}</strong>
                <span className={`badge ${partner.status === "active" ? "badge-success" : "badge-muted"}`}>
                  {partner.status === "active" ? "فعال" : "غیر فعال"}
                </span>
              </div>
              <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
                {visibleText(partner.partnerNumber, "شریک")}
              </div>
              <div style={{ marginTop: 12, display: "grid", gap: 6, fontSize: 13 }}>
                <span>لومړنۍ سرمایه: {partner.initialInvestment} {currencyLabel(partner.currencyCode)}</span>
                <span>اوسنی حساب: {partner.initialInvestment} {currencyLabel(partner.currencyCode)}</span>
                <span>فیصدي: {partner.ownershipPercent ?? "—"}</span>
              </div>
              <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <button className="btn btn-outline btn-sm" type="button" onClick={() => startEditPartner(partner)}>
                  <Edit2 size={13} /> ایډیټ
                </button>
                <button className="btn btn-outline btn-sm" type="button" onClick={() => deletePartner(partner)} disabled={deleteMutation.isPending}>
                  <Trash2 size={13} /> ډیلیټ
                </button>
              </div>
            </div>
          ))}
          {!visiblePartners.length && (
            <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>
              تر اوسه هېڅ شریک نشته.
            </div>
          )}
        </div>
      ) : (
        <div className="card elevated-card print-report-surface" style={{ padding: 0, overflow: "auto", marginTop: 16 }}>
          <table className="fl-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>شمېره</th>
                <th>نوم</th>
                <th>لومړنۍ سرمایه</th>
                <th>د سرمایه فیصدي</th>
                <th>اوسنی حساب</th>
                <th>حالت</th>
                <th className="no-print">کړنې</th>
              </tr>
            </thead>
            <tbody>
              {visiblePartners.map((partner) => (
                <tr key={partner.id}>
                  <td style={{ fontWeight: 700 }}>{visibleText(partner.partnerNumber, "شریک")}</td>
                  <td>{partner.name}</td>
                  <td>{partner.initialInvestment} {currencyLabel(partner.currencyCode)}</td>
                  <td>{partner.ownershipPercent ?? "—"}</td>
                  <td style={{ fontWeight: 700 }}>{partner.initialInvestment} {currencyLabel(partner.currencyCode)}</td>
                  <td>
                    <span className={`badge ${partner.status === "active" ? "badge-success" : "badge-muted"}`}>
                      {partner.status === "active" ? "فعال" : "غیر فعال"}
                    </span>
                  </td>
                  <td className="no-print">
                    <div style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <button className="btn btn-outline btn-sm" type="button" onClick={() => startEditPartner(partner)}>
                        <Edit2 size={13} /> ایډیټ
                      </button>
                      <button className="btn btn-outline btn-sm" type="button" onClick={() => deletePartner(partner)} disabled={deleteMutation.isPending}>
                        <Trash2 size={13} /> ډیلیټ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!visiblePartners.length && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
                    تر اوسه هېڅ شریک نشته.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop no-print" onClick={closeForm}>
          <div className="card modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <span>{editingPartner ? "د شریک ایډیټ" : "نوی شریک"}</span>
              <button className="btn btn-outline btn-sm" onClick={closeForm}><X size={14} /></button>
            </div>
            {error && (
              <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>
                {error}
              </div>
            )}
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="form-label">شریک نوم</label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="form-label">لومړنۍ سرمایه</label>
                  <input className="form-input" type="text" inputMode="decimal" value={form.initialInvestment} onChange={(e) => setForm((current) => ({ ...current, initialInvestment: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">اسعار</label>
                  <select className="form-input" value={form.currencyCode} disabled={Boolean(editingPartner)} onChange={(e) => setForm((current) => ({ ...current, currencyCode: e.target.value }))}>
                    <option value="AFN">افغانی</option>
                    <option value="USD">ډالر</option>
                    <option value="PKR">کلداره</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="form-label">د سرمایه فیصدي</label>
                  <input className="form-input" type="text" inputMode="decimal" value={form.ownershipPercent} onChange={(e) => setForm((current) => ({ ...current, ownershipPercent: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">د ګډون نېټه</label>
                  <ShamsiDateInput className="form-input" value={form.joinDate} onChange={(joinDate) => setForm((current) => ({ ...current, joinDate }))} />
                </div>
              </div>
              <div>
                <label className="form-label">یادداشت</label>
                <textarea className="form-input" rows={2} value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-primary" disabled={!canSavePartner} onClick={() => saveMutation.mutate()}>{editingPartner ? "ساتل" : "ثبتول"}</button>
              <button className="btn btn-outline" onClick={closeForm}>لغوه</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
