import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, X } from "lucide-react";
import { api, type Purchase, type PurchaseStatus } from "../lib/api";
import LedgerIdentityBar from "../components/LedgerIdentityBar";
import JalaliDate from "../components/JalaliDate";
import PrintHeader from "../components/PrintHeader";
import ShamsiDateInput from "../components/ShamsiDateInput";
import { currencyLabel, visibleText } from "../lib/labels";

const STATUS_LABELS: Record<PurchaseStatus, string> = { open: "پرانیستی", paid: "پیسو رسید شوی", cancelled: "لغوه شوی" };
const METHOD_LABELS: Record<string, string> = { cash: "نغدي", bank_transfer: "بانکي" };
const CURRENCY_OPTIONS = ["AFN", "USD", "PKR"];

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function purchaseDisplayNumber(purchase: Purchase): string {
  return purchase.customerBillNumber || purchase.purchaseNumber;
}

export default function PurchaseDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentCurrencyCode, setPaymentCurrencyCode] = useState("AFN");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: purchase } = useQuery({ queryKey: ["purchase", id], queryFn: () => api.get<Purchase>(`/purchases/${id}`) });

  useEffect(() => {
    if (purchase?.currencyCode) setPaymentCurrencyCode(purchase.currencyCode);
  }, [purchase?.currencyCode]);

  const addPaymentMutation = useMutation({
    mutationFn: () =>
      api.post(`/purchases/${id}/payments`, { amount, currencyCode: paymentCurrencyCode, paymentDate, method, note: note || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase", id] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["party-ledger"] });
      qc.invalidateQueries({ queryKey: ["party-ledger-total"] });
      setShowPaymentForm(false);
      setAmount(""); setNote(""); setError(null);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "ناکامي"),
  });

  if (!purchase) return null;
  const purchaseCurrency = currencyLabel(purchase.currencyCode);
  const purchaseTotalText = `${purchase.totalAmount} ${purchaseCurrency}`;
  const purchaseBalanceText = `${purchase.balance ?? "0"} ${purchaseCurrency}`;
  const purchasePaymentTotalText = purchase.payments?.length
    ? purchase.payments.map((payment) => `${payment.amount} ${currencyLabel(payment.currencyCode)}`).join(" + ")
    : `0 ${purchaseCurrency}`;

  return (
    <div>
      <PrintHeader title={`${purchase.supplier?.name ?? "عرضه کوونکی"} کهاته`} />

      <div className="no-print">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Link to="/purchases" style={{ color: "var(--muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
            د اجناسو خرید <ArrowRight size={13} />
          </Link>
          <span style={{ color: "var(--muted)" }}>/</span>
          <span style={{ fontSize: 13 }}>{visibleText(purchaseDisplayNumber(purchase), "بیل")}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <p className="page-title" style={{ margin: 0 }}>{visibleText(purchaseDisplayNumber(purchase), "بیل")}</p>
          <span className="badge badge-info">{STATUS_LABELS[purchase.status]}</span>
        </div>
        <p className="page-sub">عرضه کوونکی: {purchase.supplier?.name} — توکی: {purchase.itemName} ({purchase.quantity} {purchase.unitOfMeasure ?? ""})</p>
      </div>

      <LedgerIdentityBar subtitle={`${purchase.supplier?.name ?? "عرضه کوونکی"} / ${currencyLabel(purchase.currencyCode)} کهاته`} />

      <div className="no-print" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, margin: "16px 0" }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>ټول مبلغ</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{purchase.totalAmount} {currencyLabel(purchase.currencyCode)}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>پاتې حساب</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: "var(--danger)" }}>{purchaseBalanceText}</div>
        </div>
        <div className="card" style={{ padding: 16, display: "flex", gap: 8, alignItems: "center" }}>
          {purchase.status !== "cancelled" && Number(purchase.balance ?? 0) !== 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowPaymentForm(true)}><Plus size={14} /> پیسو رسید</button>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto", marginBottom: 20 }}>
        <table className="fl-table ledger-table supplier-ledger-table" style={{ minWidth: 1240, fontSize: 13 }}>
          <colgroup>
            <col className="ledger-col-number" />
            <col className="ledger-col-date" />
            <col className="ledger-col-detail" />
            <col className="ledger-col-bill" />
            <col className="ledger-col-quantity" />
            <col className="ledger-col-price" />
            <col className="ledger-col-total" />
            <col className="ledger-col-receipt" />
            <col className="ledger-col-balance" />
          </colgroup>
          <thead>
            <tr>
              <th colSpan={9} className="no-print">
                <span className="print-party-name">{purchase.supplier?.name ?? "—"}</span> حساب ډول « {currencyLabel(purchase.currencyCode)} » مشتری ادرس: {purchase.supplier?.address ?? "—"} مشتری د تماس شمیره : {purchase.supplier?.phone1 ?? "—"}
              </th>
            </tr>
            <tr>
              <th>شمیره</th><th>تاریخ</th><th>تفصیل</th><th>بیل نمبر</th><th>تعداد</th><th>قیمت</th><th>مجموع</th><th>رسید</th><th>الباقی</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td><JalaliDate date={purchase.purchaseDate} /></td>
              <td>{purchase.itemName}</td>
              <td>{visibleText(purchaseDisplayNumber(purchase), "بیل")}</td>
              <td>{purchase.quantity} {purchase.unitOfMeasure ?? ""}</td>
              <td className="ledger-price-cell">{purchase.unitPrice} {purchaseCurrency}</td>
              <td className="ledger-money-cell">{purchaseTotalText}</td>
              <td></td>
              <td className="ledger-balance-cell">{purchaseTotalText}</td>
            </tr>
            {purchase.payments?.map((payment, index) => (
              <tr key={`payment-${payment.id}`}>
                <td>{index + 2}</td>
                <td><JalaliDate date={payment.paymentDate} /></td>
                <td>رسیده د دفتر له طرفه {purchase.supplier?.name ?? ""} ته</td>
                <td>{visibleText(payment.paymentNumber, `رسید ${index + 1}`)}</td>
                <td>0</td>
                <td>0</td>
                <td>0</td>
                <td className="ledger-receipt-cell">{payment.amount} {currencyLabel(payment.currencyCode)}</td>
                <td className="ledger-balance-cell">{payment.newBalance ? `${payment.newBalance} ${currencyLabel(payment.currencyCode)}` : ""}</td>
              </tr>
            ))}
            {purchase.returns?.map((ret, index) => (
              <tr key={`return-${ret.id}`}>
                <td>{(purchase.payments?.length ?? 0) + index + 2}</td>
                <td><JalaliDate date={ret.returnDate} /></td>
                <td>واپسي اجناس: {ret.reason}</td>
                <td>{visibleText(ret.returnNumber, `واپسي ${index + 1}`)}</td>
                <td>-{ret.quantity} {purchase.unitOfMeasure ?? ""}</td>
                <td>—</td>
                <td>0</td>
                <td className="ledger-receipt-cell">{ret.amount} {currencyLabel(ret.currencyCode)}</td>
                <td></td>
              </tr>
            ))}
            <tr className="ledger-summary-row ledger-money-summary-row"><td colSpan={6} className="ledger-summary-label ledger-total-label">مجموع پیسی</td><td className="ledger-total-money-cell">{purchaseTotalText}</td><td></td><td></td></tr>
            <tr className="ledger-summary-row ledger-receipt-summary-row"><td colSpan={6} className="ledger-summary-label ledger-total-receipt-label">ټوټل رسیده ګی</td><td></td><td className="ledger-total-receipt-cell">{purchasePaymentTotalText}</td><td></td></tr>
            <tr className="ledger-summary-row ledger-balance-summary-row"><td colSpan={6} className="ledger-summary-label ledger-balance-label">الباقی حساب</td><td></td><td></td><td className="ledger-balance-total-cell">{purchaseBalanceText}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card no-print" style={{ padding: 22, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>پیسو رسیدونه</div>
        <table className="fl-table" style={{ fontSize: 13 }}>
          <thead><tr><th>د رسید شمېره</th><th>نېټه</th><th>مبلغ</th><th>اسعار</th><th>طریقه</th></tr></thead>
          <tbody>
            {purchase.payments?.map((p) => (
              <tr key={p.id}>
                <td>{visibleText(p.paymentNumber, `رسید ${p.id}`)}</td>
                <td><JalaliDate date={p.paymentDate} /></td>
                <td>{p.amount}</td>
                <td>{currencyLabel(p.currencyCode)}</td>
                <td>{METHOD_LABELS[p.method] ?? "طریقه"}</td>
              </tr>
            ))}
            {!purchase.payments?.length && <tr><td colSpan={5} style={{ textAlign: "center", padding: 20, color: "var(--muted)" }}>تر اوسه هېڅ پیسو رسید نشته.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card no-print" style={{ padding: 22 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>واپس سوي اجناس</div>
        <table className="fl-table" style={{ fontSize: 13 }}>
          <thead><tr><th>د واپسۍ شمېره</th><th>د مشتری بیل نمبر</th><th>نېټه</th><th>جنس</th><th>مقدار</th><th>مبلغ</th><th>دلیل</th></tr></thead>
          <tbody>
            {purchase.returns?.map((r) => (
              <tr key={r.id}><td>{visibleText(r.returnNumber, `واپسي ${r.id}`)}</td><td>{visibleText(r.customerBillNumber, "—")}</td><td><JalaliDate date={r.returnDate} /></td><td>{r.returnedItemName}</td><td>{r.quantity}</td><td>{r.amount}</td><td>{visibleText(r.reason, "دلیل")}</td></tr>
            ))}
            {!purchase.returns?.length && <tr><td colSpan={7} style={{ textAlign: "center", padding: 20, color: "var(--muted)" }}>تر اوسه هېڅ واپس سوی جنس نشته.</td></tr>}
          </tbody>
        </table>
      </div>

      {showPaymentForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="card" style={{ width: 420, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>نوی پیسو رسید</div>
              <button className="btn btn-outline btn-sm" onClick={() => setShowPaymentForm(false)}><X size={14} /></button>
            </div>
            {error && <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}
            <div style={{ display: "grid", gap: 12 }}>
              <div><label className="form-label">مبلغ</label><input className="form-input" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div><label className="form-label">نېټه</label><ShamsiDateInput className="form-input" value={paymentDate} onChange={setPaymentDate} /></div>
              <div>
                <label className="form-label">اسعار</label>
                <select className="form-input" value={paymentCurrencyCode} onChange={(e) => setPaymentCurrencyCode(e.target.value)}>
                  {CURRENCY_OPTIONS.map((code) => <option key={code} value={code}>{currencyLabel(code)}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">طریقه</label>
                <select className="form-input" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="cash">نغدي</option>
                  <option value="bank_transfer">بانکي</option>
                </select>
              </div>
              <div><label className="form-label">یادداشت</label><input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-primary" disabled={!amount || addPaymentMutation.isPending} onClick={() => addPaymentMutation.mutate()}>ثبتول</button>
              <button className="btn btn-outline" onClick={() => setShowPaymentForm(false)}>لغوه</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
