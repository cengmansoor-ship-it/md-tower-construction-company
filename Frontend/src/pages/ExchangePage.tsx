import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { api, type ExchangeTransaction, type Party } from "../lib/api";
import JalaliDate from "../components/JalaliDate";
import ShamsiDateInput from "../components/ShamsiDateInput";
import DateFilterButton from "../components/DateFilterButton";
import { currencyLabel, visibleText } from "../lib/labels";
import ViewModeToggle, { type ViewMode } from "../components/ViewModeToggle";

interface NewExchangeForm {
  partyId: number | null;
  exchangeDate: string;
  currencyGiven: string;
  amountGiven: string;
  currencyReceived: string;
  amountReceived: string;
  rate: string;
  fee: string;
  notes: string;
}

function emptyForm(): NewExchangeForm {
  return { partyId: null, exchangeDate: today(), currencyGiven: "AFN", amountGiven: "", currencyReceived: "USD", amountReceived: "", rate: "", fee: "0", notes: "" };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function ExchangePage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("q") ?? "";
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewExchangeForm>(emptyForm());
  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(today());
  const [q, setQ] = useState(urlSearch);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [partyQuery, setPartyQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQ(urlSearch);
  }, [urlSearch]);

  const { data: exchanges, refetch: refetchExchanges } = useQuery({
    queryKey: ["exchanges", startDate, endDate, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (q) params.set("q", q);
      const query = params.toString();
      return api.get<ExchangeTransaction[]>(`/exchange${query ? `?${query}` : ""}`);
    },
  });

  const { data: dealerList } = useQuery({
    queryKey: ["exchange-dealers-list"],
    queryFn: () => api.get<Party[]>("/parties?type=exchange_dealer"),
  });

  const { data: dealers } = useQuery({
    queryKey: ["parties-search-exchange_dealer", partyQuery],
    queryFn: () => api.get<Party[]>(`/parties?type=exchange_dealer${partyQuery ? `&q=${encodeURIComponent(partyQuery)}` : ""}`),
    enabled: showForm,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<ExchangeTransaction>("/exchange", {
        partyId: form.partyId,
        exchangeDate: form.exchangeDate,
        currencyGiven: form.currencyGiven,
        amountGiven: form.amountGiven,
        currencyReceived: form.currencyReceived,
        amountReceived: form.amountReceived,
        rate: form.rate,
        fee: form.fee || 0,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exchanges"] });
      setShowForm(false);
      setForm(emptyForm());
      setError(null);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "ناکامي"),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <p className="page-title" style={{ margin: 0 }}>صرافي</p>
          <p className="page-sub">د اسعارو تبادله له صرافانو سره</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> نوې تبادله
          </button>
        </div>
      </div>

      <div className="card no-print" style={{ padding: 16, marginTop: 16, display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <label className="form-label">شروع تاریخ</label>
          <ShamsiDateInput className="form-input" value={startDate} onChange={setStartDate} style={{ width: 150 }} />
        </div>
        <div>
          <label className="form-label">ختم تاریخ</label>
          <ShamsiDateInput className="form-input" value={endDate} onChange={setEndDate} style={{ width: 150 }} />
        </div>
        <DateFilterButton onClick={() => void refetchExchanges()} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <label className="form-label filter-search-label">لټون</label>
          <input className="form-input" value={q} onChange={(event) => setQ(event.target.value)} placeholder="صراف، شمېره، اسعار یا یادداشت..." />
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="list-grid" style={{ marginTop: 16 }}>
          {dealerList?.map((dealer) => (
            <div key={dealer.id} className="list-card">
              <div style={{ fontWeight: 900, marginBottom: 8 }}>{dealer.name}</div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>{dealer.phone1 ?? dealer.name}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>{dealer.address ?? "—"}</div>
              <div style={{ fontSize: 13, marginTop: 8 }}>{dealer.phone1 ?? "—"}</div>
            </div>
          ))}
          {!dealerList?.length ? <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>تر اوسه صراف نشته.</div> : null}
        </div>
      ) : (
      <div className="card elevated-card" style={{ padding: 0, overflow: "auto", marginTop: 16 }}>
        <table className="fl-table" style={{ minWidth: 760, fontSize: 13 }}>
          <thead>
            <tr><th>شمیره</th><th>صراف نوم</th><th>صرافی نوم</th><th>صرافی آدرس</th><th>تماس شمیره</th></tr>
          </thead>
          <tbody>
            {dealerList?.map((dealer, index) => (
              <tr key={dealer.id}>
                <td>{index + 1}</td>
                <td>{dealer.name}</td>
                <td>{dealer.phone1 ?? dealer.name}</td>
                <td>{dealer.address ?? "—"}</td>
                <td>{dealer.phone1 ?? "—"}</td>
              </tr>
            ))}
            {!dealerList?.length ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 28, color: "var(--muted)" }}>تر اوسه صراف نشته.</td></tr> : null}
          </tbody>
        </table>
      </div>
      )}

      {viewMode === "grid" ? (
        <div className="list-grid" style={{ marginTop: 16 }}>
          {exchanges?.map((x) => (
            <div key={x.id} className="list-card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                <div style={{ fontWeight: 900 }}>{x.party?.name ?? "—"}</div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}><JalaliDate date={x.exchangeDate} /></div>
              </div>
              <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                <span>ورکړل شوی: {x.amountGiven} {currencyLabel(x.currencyGiven)}</span>
                <span>ترلاسه شوی: {x.amountReceived} {currencyLabel(x.currencyReceived)}</span>
                <span>نرخ: {x.rate}</span>
                <span>اجرت: {x.fee}</span>
              </div>
            </div>
          ))}
          {!exchanges?.length && <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>تر اوسه هیڅ تبادله نشته.</div>}
        </div>
      ) : (
      <div className="card elevated-card" style={{ padding: 0, overflow: "auto", marginTop: 16 }}>
        <table className="fl-table" style={{ fontSize: 13 }}>
          <thead>
            <tr><th>شمېره</th><th>صراف</th><th>نېټه</th><th>ورکړل شوی</th><th>ترلاسه شوی</th><th>نرخ</th><th>اجرت</th></tr>
          </thead>
          <tbody>
            {exchanges?.map((x) => (
              <tr key={x.id}>
                <td style={{ fontWeight: 600 }}>{visibleText(x.exchangeNumber, `شمېره ${x.id}`)}</td>
                <td>{x.party?.name ?? "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}><JalaliDate date={x.exchangeDate} /></td>
                <td style={{ color: "var(--danger)" }}>{x.amountGiven} {currencyLabel(x.currencyGiven)}</td>
                <td style={{ color: "var(--success)" }}>{x.amountReceived} {currencyLabel(x.currencyReceived)}</td>
                <td>{x.rate}</td>
                <td>{x.fee}</td>
              </tr>
            ))}
            {!exchanges?.length && <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>تر اوسه هېڅ تبادله نشته.</td></tr>}
          </tbody>
        </table>
      </div>
      )}

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="card compact-form-modal" style={{ width: 560, maxHeight: "82vh", overflow: "auto", padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>نوې د اسعارو تبادله</div>
              <button className="btn btn-outline btn-sm" onClick={() => setShowForm(false)}><X size={14} /></button>
            </div>
            {error && <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="form-label">صراف (نوم لټون)</label>
                <input className="form-input" value={partyQuery} onChange={(e) => setPartyQuery(e.target.value)} />
                <select className="form-input" style={{ marginTop: 6 }} value={form.partyId ?? ""} onChange={(e) => setForm((f) => ({ ...f, partyId: Number(e.target.value) || null }))}>
                  <option value="">-- صراف وټاکئ --</option>
                  {dealers?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="form-label">ورکړل شوې اسعار</label>
                  <select className="form-input" value={form.currencyGiven} onChange={(e) => setForm((f) => ({ ...f, currencyGiven: e.target.value }))}>
                    <option value="AFN">افغانی</option><option value="USD">ډالر</option><option value="PKR">کلداره</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">ورکړل شوې اندازه</label>
                  <input className="form-input" type="text" inputMode="decimal" value={form.amountGiven} onChange={(e) => setForm((f) => ({ ...f, amountGiven: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="form-label">ترلاسه شوې اسعار</label>
                  <select className="form-input" value={form.currencyReceived} onChange={(e) => setForm((f) => ({ ...f, currencyReceived: e.target.value }))}>
                    <option value="AFN">افغانی</option><option value="USD">ډالر</option><option value="PKR">کلداره</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">ترلاسه شوې اندازه</label>
                  <input className="form-input" type="text" inputMode="decimal" value={form.amountReceived} onChange={(e) => setForm((f) => ({ ...f, amountReceived: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <label className="form-label">نرخ</label>
                  <input className="form-input" type="text" inputMode="decimal" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">اجرت (اختیاري)</label>
                  <input className="form-input" type="text" inputMode="decimal" value={form.fee} onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">نېټه</label>
                  <ShamsiDateInput className="form-input" value={form.exchangeDate} onChange={(exchangeDate) => setForm((f) => ({ ...f, exchangeDate }))} />
                </div>
              </div>
              <div>
                <label className="form-label">یادداشتونه</label>
                <textarea className="form-input" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-primary" disabled={!form.partyId || !form.amountGiven || !form.amountReceived || !form.rate || createMutation.isPending} onClick={() => createMutation.mutate()}>ثبتول</button>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>لغوه</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
