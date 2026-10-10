import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Edit2, Plus, Printer, Trash2, X } from "lucide-react";
import { api, type Partner } from "../lib/api";
import { currencyLabel, visibleText } from "../lib/labels";
import PrintHeader from "../components/PrintHeader";
import ShamsiDateInput from "../components/ShamsiDateInput";

interface EditPartnerForm {
  partyName: string;
  initialInvestment: string;
  currencyCode: string;
  ownershipPercent: string;
  joinDate: string;
  notes: string;
}

function emptyHajiForm(): EditPartnerForm {
  return {
    partyName: "",
    initialInvestment: "",
    currencyCode: "AFN",
    ownershipPercent: "",
    joinDate: new Date().toISOString().slice(0, 10),
    notes: "",
  };
}

function partnerEditForm(partner: Partner): EditPartnerForm {
  return {
    partyName: partner.party?.name ?? "",
    initialInvestment: partner.initialInvestment ?? "",
    currencyCode: partner.currencyCode,
    ownershipPercent: partner.ownershipPercent ?? "",
    joinDate: partner.joinDate,
    notes: partner.notes ?? "",
  };
}

function formatBalances(partner: Partner): string {
  const balances = Object.entries(partner.balancesByCurrency ?? {});
  if (balances.length === 0) return `${partner.balance ?? "0"} ${currencyLabel(partner.currencyCode)}`;
  return balances.map(([currencyCode, balance]) => `${balance} ${currencyLabel(currencyCode)}`).join(" | ");
}

function hajiNumber(partnerNumber: string): string {
  return visibleText(partnerNumber.replace(/^حاجي[-\s]*/i, ""), "—");
}

function hajiPartnerMatchesSearch(partner: Partner, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    partner.partnerNumber,
    partner.party?.name,
    partner.party?.fatherName,
    partner.party?.phone1,
    partner.party?.phone2,
    partner.currencyCode,
    partner.initialInvestment,
    partner.balance,
    partner.notes,
    partner.status,
  ].some((value) => String(value ?? "").toLowerCase().includes(needle));
}

export default function HajiLedgerPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("q") ?? "";
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<EditPartnerForm>(emptyHajiForm());
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [form, setForm] = useState<EditPartnerForm | null>(null);
  const [q, setQ] = useState(urlSearch);
  const [error, setError] = useState<string | null>(null);
  const { data: partners } = useQuery({
    queryKey: ["partners", "haji-ledger", "active"],
    queryFn: () => api.get<Partner[]>("/partners?status=active"),
  });
  const visiblePartners = (partners ?? []).filter((partner) => hajiPartnerMatchesSearch(partner, q));

  useEffect(() => {
    setQ(urlSearch);
  }, [urlSearch]);

  function closeCreate() {
    setShowCreateForm(false);
    setCreateForm(emptyHajiForm());
    setError(null);
  }

  function closeEdit() {
    setEditingPartner(null);
    setForm(null);
    setError(null);
  }

  function startEditPartner(partner: Partner) {
    setEditingPartner(partner);
    setForm(partnerEditForm(partner));
    setError(null);
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<Partner>("/partners", {
        partyName: createForm.partyName.trim(),
        initialInvestment: createForm.initialInvestment || 0,
        currencyCode: createForm.currencyCode,
        joinDate: createForm.joinDate,
        notes: createForm.notes || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partners"] });
      closeCreate();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "ثبت ناکام شو"),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put<Partner>(`/partners/${editingPartner?.id}`, {
        partyName: form?.partyName.trim(),
        initialInvestment: form?.initialInvestment || 0,
        ownershipPercent: form?.ownershipPercent || null,
        joinDate: form?.joinDate,
        notes: form?.notes || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partners"] });
      if (editingPartner) qc.invalidateQueries({ queryKey: ["partner", String(editingPartner.id)] });
      closeEdit();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "ایډیټ ناکام شو"),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => api.post<Partner>(`/partners/${id}/delete`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partners"] });
      qc.invalidateQueries({ queryKey: ["trash"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "حذف ناکام شو"),
  });

  function deletePartner(partner: Partner) {
    const reason = window.prompt("د حذف دلیل ولیکئ:");
    if (!reason?.trim()) return;
    deleteMutation.mutate({ id: partner.id, reason: reason.trim() });
  }

  return (
    <div className="print-report-page">
      <PrintHeader title="د حاجي صاحب کهاته راپور" />
      <div className="page-header">
        <div>
          <h1 className="page-title">د حاجي صاحب کهاته</h1>
          <p className="page-sub">د حاجي صاحب راکړه/ورکړه، رسیدات او موجوده پیسې</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn btn-outline" onClick={() => window.print()}>
            <Printer size={16} /> چاپ
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreateForm(true)}>
            <Plus size={16} /> نوی حاجي صاحب
          </button>
        </div>
      </div>

      <div className="card elevated-card print-report-surface" style={{ padding: 0, overflow: "auto", marginTop: 16 }}>
        <table className="fl-table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th>شمېره</th>
              <th>نوم</th>
              <th>لومړنۍ سرمایه</th>
              <th>اوسنی حساب</th>
              <th>حالت</th>
              <th className="no-print">کړنې</th>
            </tr>
          </thead>
          <tbody>
            {visiblePartners.map((partner) => (
              <tr key={partner.id}>
                <td style={{ fontWeight: 700 }}>{hajiNumber(partner.partnerNumber)}</td>
                <td>{partner.party?.name ?? "—"}</td>
                <td>{partner.initialInvestment} {currencyLabel(partner.currencyCode)}</td>
                <td style={{ fontWeight: 700 }}>{formatBalances(partner)}</td>
                <td>
                  <span className={`badge ${partner.status === "active" ? "badge-success" : "badge-muted"}`}>
                    {partner.status === "active" ? "فعال" : "غیر فعال"}
                  </span>
                </td>
                <td className="no-print">
                  <div style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <Link className="btn btn-outline btn-sm" to={`/haji-ledger/${partner.id}`} style={{ textDecoration: "none" }}>
                      <BookOpen size={13} /> کهاته لیدل
                    </Link>
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
                <td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
                  تر اوسه هېڅ د حاجي صاحب کهاته نشته.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreateForm && (
        <div className="modal-backdrop no-print" onClick={closeCreate}>
          <div className="card modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <span>نوی حاجي صاحب</span>
              <button className="btn btn-outline btn-sm" onClick={closeCreate}><X size={14} /></button>
            </div>
            {error && (
              <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>
                {error}
              </div>
            )}
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="form-label">نوم</label>
                <input className="form-input" value={createForm.partyName} onChange={(event) => setCreateForm((current) => ({ ...current, partyName: event.target.value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="form-label">لومړنۍ پیسې</label>
                  <input className="form-input" type="text" inputMode="decimal" value={createForm.initialInvestment} onChange={(event) => setCreateForm((current) => ({ ...current, initialInvestment: event.target.value }))} />
                </div>
                <div>
                  <label className="form-label">اسعار</label>
                  <select className="form-input" value={createForm.currencyCode} onChange={(event) => setCreateForm((current) => ({ ...current, currencyCode: event.target.value }))}>
                    <option value="AFN">افغانی</option>
                    <option value="USD">ډالر</option>
                    <option value="PKR">کلداره</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">د شروع نېټه</label>
                <ShamsiDateInput className="form-input" value={createForm.joinDate} onChange={(joinDate) => setCreateForm((current) => ({ ...current, joinDate }))} />
              </div>
              <div>
                <label className="form-label">یادداشت</label>
                <textarea className="form-input" rows={2} value={createForm.notes} onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-primary" disabled={!createForm.partyName.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>ثبتول</button>
              <button className="btn btn-outline" onClick={closeCreate}>لغوه</button>
            </div>
          </div>
        </div>
      )}

      {editingPartner && form && (
        <div className="modal-backdrop no-print" onClick={closeEdit}>
          <div className="card modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <span>د کهاتې ایډیټ</span>
              <button className="btn btn-outline btn-sm" onClick={closeEdit}><X size={14} /></button>
            </div>
            {error && (
              <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>
                {error}
              </div>
            )}
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="form-label">نوم</label>
                <input className="form-input" value={form.partyName} onChange={(event) => setForm((current) => current ? { ...current, partyName: event.target.value } : current)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="form-label">لومړنۍ سرمایه</label>
                  <input className="form-input" type="text" inputMode="decimal" value={form.initialInvestment} onChange={(event) => setForm((current) => current ? { ...current, initialInvestment: event.target.value } : current)} />
                </div>
                <div>
                  <label className="form-label">اسعار</label>
                  <select className="form-input" value={form.currencyCode} disabled>
                    <option value="AFN">افغانی</option>
                    <option value="USD">ډالر</option>
                    <option value="PKR">کلداره</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="form-label">د سرمایه فیصدي</label>
                  <input className="form-input" type="text" inputMode="decimal" value={form.ownershipPercent} onChange={(event) => setForm((current) => current ? { ...current, ownershipPercent: event.target.value } : current)} />
                </div>
                <div>
                  <label className="form-label">د ګډون نېټه</label>
                  <ShamsiDateInput className="form-input" value={form.joinDate} onChange={(joinDate) => setForm((current) => current ? { ...current, joinDate } : current)} />
                </div>
              </div>
              <div>
                <label className="form-label">یادداشت</label>
                <textarea className="form-input" rows={2} value={form.notes} onChange={(event) => setForm((current) => current ? { ...current, notes: event.target.value } : current)} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-primary" disabled={!form.partyName.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()}>ساتل</button>
              <button className="btn btn-outline" onClick={closeEdit}>لغوه</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
