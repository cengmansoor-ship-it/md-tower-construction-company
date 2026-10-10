import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Printer, Trash2, X } from "lucide-react";
import { api, type Sale, type SaleReceipt, type SaleStatus } from "../lib/api";
import PrintHeader from "../components/PrintHeader";
import LedgerIdentityBar from "../components/LedgerIdentityBar";
import JalaliDate from "../components/JalaliDate";
import ShamsiDateInput from "../components/ShamsiDateInput";
import { currencyLabel, visibleText } from "../lib/labels";

const STATUS_LABELS: Record<SaleStatus, string> = {
  draft: "مسوده", reserved: "ساتل شوی", active: "فعال",
  fully_paid: "بشپړ تادیه شوی", cancelled: "لغوه شوی", reversed: "بېرته شوی",
};
const METHOD_LABELS: Record<string, string> = { cash: "نغدي", bank_transfer: "بانکي" };

export default function SaleDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [allowOverpayment, setAllowOverpayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState<Record<number, string>>({});

  const { data: sale } = useQuery({ queryKey: ["sale", id], queryFn: () => api.get<Sale>(`/sales/${id}`) });

  const addReceiptMutation = useMutation({
    mutationFn: () =>
      api.post<SaleReceipt>(`/sales/${id}/receipts`, {
        amount, currencyCode: sale?.currencyCode, receiptDate, method, note: note || null, allowOverpayment,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sale", id] });
      setShowReceiptForm(false);
      setAmount(""); setNote(""); setAllowOverpayment(false); setError(null);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "ناکامي"),
  });

  const reverseMutation = useMutation({
    mutationFn: (receiptId: number) =>
      api.post(`/sales/${id}/receipts/${receiptId}/reverse`, { reason: reverseReason[receiptId] || "بېرته اخیستل شوی" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sale", id] }),
  });

  if (!sale) return null;

  return (
    <div>
      <PrintHeader title={`${visibleText(sale.saleNumber, "فروش")} رسید سند`} />

      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Link to="/sales" style={{ color: "var(--muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
          پلورنې <ArrowRight size={13} />
        </Link>
        <span style={{ color: "var(--muted)" }}>/</span>
        <span style={{ fontSize: 13 }}>{visibleText(sale.saleNumber, "فروش")}</span>
      </div>
      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <p className="page-title" style={{ margin: 0 }}>{visibleText(sale.saleNumber, "فروش")}</p>
        <span className="badge badge-info">{STATUS_LABELS[sale.status]}</span>
      </div>
      <p className="page-sub no-print">
        مشتري: {sale.party?.name} - ملکیت: {visibleText(sale.unit?.floor?.block?.name, "بلاک")} / {sale.unit?.unitNumber}
      </p>

      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn btn-outline" onClick={() => window.print()}><Printer size={16} /> رسید چاپ</button>
      </div>

      <LedgerIdentityBar subtitle={`${sale.party?.name ?? "مشتري"} / ${currencyLabel(sale.currencyCode)} کهاته`} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, margin: "16px 0" }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>نرخ</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{sale.price} {currencyLabel(sale.currencyCode)}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>تخفیف</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{sale.discount}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>وروستی نرخ</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{sale.finalPrice}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>پاتې حساب</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: Number(sale.balance ?? 0) > 0 ? "var(--danger)" : "var(--success)" }}>
            {sale.balance}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>رسیدونه (تادیات)</div>
          {sale.status !== "cancelled" && sale.status !== "reversed" && Number(sale.balance ?? 0) !== 0 && (
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
            {sale.receipts?.map((r) => (
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
                        if (reason) {
                          setReverseReason((m) => ({ ...m, [r.id]: reason }));
                          reverseMutation.mutate(r.id);
                        }
                      }}
                    >
                      <Trash2 size={12} /> حذف
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!sale.receipts?.length && (
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
                زیاته تادیه ومنئ (د مشتری په حساب کې اضافه پاتې ثبتېږي)
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
