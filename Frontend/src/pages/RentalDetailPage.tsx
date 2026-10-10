import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Trash2, X, Square } from "lucide-react";
import { api, type Rental, type RentalReceipt, type RentalStatus } from "../lib/api";
import LedgerIdentityBar from "../components/LedgerIdentityBar";
import JalaliDate from "../components/JalaliDate";
import ShamsiDateInput from "../components/ShamsiDateInput";
import { currencyLabel, visibleText } from "../lib/labels";

const STATUS_LABELS: Record<RentalStatus, string> = { active: "فعال", ended: "پای ته رسېدلی", cancelled: "لغوه شوی" };
const METHOD_LABELS: Record<string, string> = { cash: "نغدي", bank_transfer: "بانکي" };

export default function RentalDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [allowOverpayment, setAllowOverpayment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: rental } = useQuery({ queryKey: ["rental", id], queryFn: () => api.get<Rental>(`/rentals/${id}`) });

  const addReceiptMutation = useMutation({
    mutationFn: () =>
      api.post<RentalReceipt>(`/rentals/${id}/receipts`, {
        amount, currencyCode: rental?.currencyCode, receiptDate, method, note: note || null, allowOverpayment,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental", id] });
      setShowReceiptForm(false);
      setAmount(""); setNote(""); setAllowOverpayment(false); setError(null);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "ناکامي"),
  });

  const reverseMutation = useMutation({
    mutationFn: ({ receiptId, reason }: { receiptId: number; reason: string }) =>
      api.post(`/rentals/${id}/receipts/${receiptId}/reverse`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rental", id] }),
  });

  const endMutation = useMutation({
    mutationFn: () => api.post(`/rentals/${id}/end`, { endDate: new Date().toISOString().slice(0, 10) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rental", id] }),
  });

  if (!rental) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Link to="/rentals" style={{ color: "var(--muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
          کرایې <ArrowRight size={13} />
        </Link>
        <span style={{ color: "var(--muted)" }}>/</span>
        <span style={{ fontSize: 13 }}>{visibleText(rental.rentalNumber, "کرایه")}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <p className="page-title" style={{ margin: 0 }}>{visibleText(rental.rentalNumber, "کرایه")}</p>
        <span className="badge badge-info">{STATUS_LABELS[rental.status]}</span>
        {rental.status === "active" && (
          <button className="btn btn-outline btn-sm" onClick={() => endMutation.mutate()}>
            <Square size={12} /> د کرایې پای ته رسول
          </button>
        )}
      </div>
      <p className="page-sub">
        کرایه‌دار: {rental.tenant?.name} - ملکیت: {visibleText(rental.unit?.floor?.block?.name, "بلاک")} / {rental.unit?.unitNumber}
      </p>

      <LedgerIdentityBar subtitle={`${rental.tenant?.name ?? "کرایه دار"} / ${currencyLabel(rental.currencyCode)} کهاته`} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, margin: "16px 0" }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>کرایه</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{rental.rentAmount} {currencyLabel(rental.currencyCode)}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>امانت</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{rental.depositAmount}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>پیل نېټه</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}><JalaliDate date={rental.startDate} /></div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>پاتې حساب</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: Number(rental.balance ?? 0) > 0 ? "var(--danger)" : "var(--success)" }}>
            {rental.balance}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>رسیدونه (تادیات)</div>
          {rental.status === "active" && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowReceiptForm(true)}><Plus size={14} /> نوی رسید</button>
          )}
        </div>

        <table className="fl-table ledger-table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th>رسید نمبر</th><th>نېټه</th><th>پخوانی پاتې</th><th>ترلاسه شوی</th>
              <th>نوی پاتې</th><th>طریقه</th><th>حالت</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rental.receipts?.map((r) => (
              <tr key={r.id} style={{ opacity: r.voidedAt ? 0.5 : 1 }}>
                <td>{visibleText(r.receiptNumber, `رسید ${r.id}`)}</td>
                <td style={{ whiteSpace: "nowrap" }}><JalaliDate date={r.receiptDate} /></td>
                <td>{r.previousBalance ?? "—"}</td>
                <td style={{ color: "var(--success)", fontWeight: 600 }}>{r.amount}</td>
                <td>{r.newBalance ?? "—"}</td>
                <td>{METHOD_LABELS[r.method] ?? "طریقه"}</td>
                <td>{r.voidedAt ? <span className="badge badge-danger">لغوه شوی</span> : <span className="badge badge-success">فعال</span>}</td>
                <td>
                  {!r.voidedAt && (
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        const reason = window.prompt("د حذف دلیل ولیکئ:");
                        if (reason) reverseMutation.mutate({ receiptId: r.id, reason });
                      }}
                    >
                      <Trash2 size={12} /> حذف
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!rental.receipts?.length && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>تر اوسه هېڅ رسید نشته.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showReceiptForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="card" style={{ width: 420, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>نوی رسید</div>
              <button className="btn btn-outline btn-sm" onClick={() => setShowReceiptForm(false)}><X size={14} /></button>
            </div>
            {error && (
              <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>
                {error}
              </div>
            )}
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="form-label">مبلغ</label>
                <input className="form-input" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <label className="form-label">نېټه</label>
                <ShamsiDateInput className="form-input" value={receiptDate} onChange={setReceiptDate} />
              </div>
              <div>
                <label className="form-label">طریقه</label>
                <select className="form-input" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="cash">نغدي</option>
                  <option value="bank_transfer">بانکي</option>
                </select>
              </div>
              <div>
                <label className="form-label">یادداشت</label>
                <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={allowOverpayment} onChange={(e) => setAllowOverpayment(e.target.checked)} />
                زیاته تادیه ومنئ
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-primary" disabled={!amount || addReceiptMutation.isPending} onClick={() => addReceiptMutation.mutate()}>ثبتول</button>
              <button className="btn btn-outline" onClick={() => setShowReceiptForm(false)}>لغوه</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
