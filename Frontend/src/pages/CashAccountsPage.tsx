import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Account, type CashAccountEntry } from "../lib/api";
import { Wallet, Plus } from "lucide-react";
import { currencyLabel } from "../lib/labels";

export default function CashAccountsPage() {
  const qc = useQueryClient();
  const { data: cashAccounts } = useQuery({ queryKey: ["cash-accounts"], queryFn: () => api.get<CashAccountEntry[]>("/cash-accounts") });
  const { data: accounts } = useQuery({ queryKey: ["accounts"], queryFn: () => api.get<Account[]>("/journal/accounts") });

  const [form, setForm] = useState({ name: "", currencyCode: "AFN", accountId: 0 });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => api.post("/cash-accounts", form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cash-accounts"] }); setForm({ name: "", currencyCode: "AFN", accountId: 0 }); setError(null); },
    onError: (err) => setError(err instanceof Error ? err.message : "ستونزه رامنځته شوه"),
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">د کیش حسابونه</h1>
        <div className="page-breadcrumb">
          <span>ډشبورډ</span>
          <span>/</span>
          <span>مالیه</span>
          <span>/</span>
          <span>کیش حسابونه</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 28 }}>
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Plus size={18} /> نوی حساب
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            <div style={{ flex: "1 1 200px" }}>
              <label className="form-label">نوم</label>
              <input className="form-input" placeholder="د کیش نوم" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div style={{ width: 120 }}>
              <label className="form-label">پیسه</label>
              <select className="form-select" value={form.currencyCode} onChange={(e) => setForm((f) => ({ ...f, currencyCode: e.target.value }))}>
                <option value="AFN">افغانی</option><option value="USD">ډالر</option><option value="PKR">کلداره</option>
              </select>
            </div>
            <div style={{ flex: "2 1 250px" }}>
              <label className="form-label">د کتاب حساب</label>
              <select className="form-select" value={form.accountId} onChange={(e) => setForm((f) => ({ ...f, accountId: Number(e.target.value) }))}>
                <option value={0}>حساب وټاکئ</option>
                {accounts?.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button className="btn btn-primary" onClick={() => createMutation.mutate()} disabled={!form.name.trim() || !form.accountId || createMutation.isPending}>
                <Plus size={16} /> جوړول
              </button>
            </div>
          </div>
          {error && <div style={{ color: "var(--danger)", fontSize: 14, marginTop: 16 }}>{error}</div>}
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <table className="fl-table">
          <thead>
            <tr><th>نوم</th><th>پیسه</th><th>د کتاب حساب</th></tr>
          </thead>
          <tbody>
            {cashAccounts?.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 500 }}><Wallet size={16} style={{ display: "inline", marginLeft: 8, verticalAlign: "text-bottom", color: "var(--muted)" }} />{c.name}</td>
                <td><span className="badge badge-info">{currencyLabel(c.currencyCode)}</span></td>
                <td style={{ color: "var(--muted)" }}>{c.account?.name ?? "—"}</td>
              </tr>
            ))}
            {cashAccounts?.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>هیڅ حساب نشته.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
