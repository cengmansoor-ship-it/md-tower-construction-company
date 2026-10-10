import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, X } from "lucide-react";
import { api, type Partner, type PartnerTransaction, type PartnerTransactionType } from "../lib/api";
import LedgerIdentityBar from "../components/LedgerIdentityBar";
import JalaliDate from "../components/JalaliDate";
import ShamsiDateInput from "../components/ShamsiDateInput";
import PrintHeader from "../components/PrintHeader";
import { currencyLabel, visibleText } from "../lib/labels";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function decimalToScaled(value: string | number | null | undefined): { amount: bigint; scale: number } {
  const raw = String(value ?? "0").trim();
  const negative = raw.startsWith("-");
  const clean = negative ? raw.slice(1) : raw;
  const [whole = "0", fraction = ""] = clean.split(".");
  const digits = `${whole || "0"}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  return { amount: (negative ? -1n : 1n) * BigInt(digits), scale: fraction.length };
}

function addDecimal(a: string | number | null | undefined, b: string | number | null | undefined): string {
  const left = decimalToScaled(a);
  const right = decimalToScaled(b);
  const scale = Math.max(left.scale, right.scale);
  const value = left.amount * 10n ** BigInt(scale - left.scale) + right.amount * 10n ** BigInt(scale - right.scale);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  if (scale === 0) return `${negative ? "-" : ""}${absolute.toString()}`;
  const padded = absolute.toString().padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale) || "0";
  const fraction = padded.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function subtractDecimal(a: string | number | null | undefined, b: string | number | null | undefined): string {
  const value = String(b ?? "0");
  return addDecimal(a, value.startsWith("-") ? value.slice(1) : `-${value}`);
}

function decimalSign(value: string | number | null | undefined): number {
  const scaled = decimalToScaled(value);
  return scaled.amount > 0n ? 1 : scaled.amount < 0n ? -1 : 0;
}

function sumTransactions(transactions: PartnerTransaction[] | undefined, type: PartnerTransactionType): string {
  return (transactions ?? [])
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => addDecimal(sum, transaction.amount), "0");
}

function addCurrencyAmount(totals: Record<string, string>, currencyCode: string, amount: string | number | null | undefined): void {
  totals[currencyCode] = addDecimal(totals[currencyCode] ?? "0", amount);
}

function subtractCurrencyAmount(totals: Record<string, string>, currencyCode: string, amount: string | number | null | undefined): void {
  totals[currencyCode] = subtractDecimal(totals[currencyCode] ?? "0", amount);
}

function sumTransactionsByCurrency(transactions: PartnerTransaction[] | undefined, type: PartnerTransactionType): Record<string, string> {
  const totals: Record<string, string> = {};
  for (const transaction of transactions ?? []) {
    if (transaction.type === type) addCurrencyAmount(totals, transaction.currencyCode, transaction.amount);
  }
  return totals;
}

function subtractCurrencyTotals(left: Record<string, string>, right: Record<string, string>): Record<string, string> {
  const totals: Record<string, string> = {};
  for (const [currencyCode, amount] of Object.entries(left)) addCurrencyAmount(totals, currencyCode, amount);
  for (const [currencyCode, amount] of Object.entries(right)) subtractCurrencyAmount(totals, currencyCode, amount);
  return totals;
}

function formatCurrencyTotals(totals: Record<string, string>): string {
  const entries = Object.entries(totals).filter(([, amount]) => decimalSign(amount) !== 0);
  if (entries.length === 0) return "0";
  return entries.map(([currencyCode, amount]) => `${amount} ${currencyLabel(currencyCode)}`).join(" | ");
}

export default function PartnerDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<PartnerTransactionType>("investment");
  const [amount, setAmount] = useState("");
  const [transactionCurrencyCode, setTransactionCurrencyCode] = useState("AFN");
  const [transactionDate, setTransactionDate] = useState(today());
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: partner } = useQuery({ queryKey: ["partner", id], queryFn: () => api.get<Partner>(`/partners/${id}`) });

  useEffect(() => {
    if (partner?.currencyCode) setTransactionCurrencyCode(partner.currencyCode);
  }, [partner?.currencyCode]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<PartnerTransaction>(`/partners/${id}/transactions`, {
        type, amount, currencyCode: transactionCurrencyCode, transactionDate, description: description.trim() || null, note: note || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner", id] });
      qc.invalidateQueries({ queryKey: ["partners"] });
      setShowForm(false);
      setAmount("");
      setTransactionCurrencyCode(partner?.currencyCode ?? "AFN");
      setDescription("");
      setNote("");
      setError(null);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "ناکامي"),
  });

  if (!partner) return null;
  const currency = currencyLabel(partner.currencyCode);
  const paidToPartner = sumTransactionsByCurrency(partner.transactions, "withdrawal");
  const receivedAtOffice = sumTransactionsByCurrency(partner.transactions, "investment");
  addCurrencyAmount(receivedAtOffice, partner.currencyCode, partner.initialInvestment);
  const currentMoney = subtractCurrencyTotals(paidToPartner, receivedAtOffice);
  const ledgerRows = [
    ...(decimalSign(partner.initialInvestment) > 0
      ? [{
          id: `initial-${partner.id}`,
          date: partner.joinDate,
          detail: "رسیده د حاجي صاحب له طرفه دفتر ته",
          money: "",
          receipt: partner.initialInvestment,
          balance: partner.initialInvestment,
          currencyCode: partner.currencyCode,
          note: partner.notes ?? "",
        }]
      : []),
    ...(partner.transactions ?? []).map((transaction) => ({
      id: transaction.id,
      date: transaction.transactionDate,
      detail: transaction.description || (transaction.type === "investment" ? "رسیده د حاجي صاحب له طرفه دفتر ته" : "رسیده حاجي صاحب ته د دفتر له طرفه"),
      money: transaction.type === "withdrawal" ? transaction.amount : "",
      receipt: transaction.type === "investment" ? transaction.amount : "",
      balance: transaction.newBalance ?? "",
      currencyCode: transaction.currencyCode,
      note: transaction.note ?? "",
    })),
  ];

  return (
    <div className="print-report-page haji-ledger-detail-page">
      <PrintHeader title={`${partner.party?.name ?? "حاجي صاحب"} کهاته`} />

      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Link to="/haji-ledger" style={{ color: "var(--muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
          د حاجي صاحب کهاته <ArrowRight size={13} />
        </Link>
        <span style={{ color: "var(--muted)" }}>/</span>
        <span style={{ fontSize: 13 }}>{visibleText(partner.partnerNumber, "حاجي صاحب")}</span>
      </div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{partner.party?.name}</h1>
          <p className="page-sub">لومړنۍ سرمایه: {partner.initialInvestment} {currency}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> نوې راکړه/ورکړه</button>
      </div>

      <LedgerIdentityBar subtitle={`${partner.party?.name ?? "شریک"} / ${currency} کهاته`} />

      <div className="summary-grid" style={{ marginBottom: 16 }}>
        <div className="summary-card haji-current-balance-card"><span>الباقي</span><strong style={{ color: "var(--danger)" }}>{formatCurrencyTotals(currentMoney)}</strong></div>
        <div className="summary-card success"><span>ټول رسیدګي دفتر ته</span><strong>{formatCurrencyTotals(receivedAtOffice)}</strong></div>
        <div className="summary-card"><span>ټول رسیده ګي حاجي صاحب ته</span><strong>{formatCurrencyTotals(paidToPartner)}</strong></div>
      </div>

      <div className="card elevated-card print-report-surface" style={{ padding: 0, overflow: "auto" }}>
        <table className="fl-table ledger-table" style={{ minWidth: 900, fontSize: 13 }}>
          <thead>
            <tr><th colSpan={7}>حاجي ({partner.party?.name ?? ""}) حساب ډول « څو اسعار »</th></tr>
            <tr><th>شمېره</th><th>تاریخ</th><th>تفصیل</th><th>پیسې</th><th>رسید</th><th>الباقی</th><th>ملاحظات</th></tr>
          </thead>
          <tbody>
            {ledgerRows.map((transaction, index) => (
              <tr key={transaction.id}>
                <td>{index + 1}</td>
                <td><JalaliDate date={transaction.date} /></td>
                <td>{transaction.detail}</td>
                <td style={{ color: "var(--danger)", fontWeight: 800 }}>{transaction.money ? `${transaction.money} ${currencyLabel(transaction.currencyCode)}` : ""}</td>
                <td style={{ color: "var(--success)", fontWeight: 800 }}>{transaction.receipt ? `${transaction.receipt} ${currencyLabel(transaction.currencyCode)}` : ""}</td>
                <td style={{ fontWeight: 900 }}>{transaction.balance ? `${transaction.balance} ${currencyLabel(transaction.currencyCode)}` : ""}</td>
                <td>{transaction.note ?? ""}</td>
              </tr>
            ))}
            {!ledgerRows.length && <tr><td colSpan={7} style={{ textAlign: "center", padding: 20, color: "var(--muted)" }}>تر اوسه هېڅ راکړه/ورکړه نشته.</td></tr>}
            <tr className="ledger-summary-row">
              <td colSpan={3} style={{ fontWeight: 900 }}>ټول رسیده ګي حاجي صاحب ته</td>
              <td style={{ color: "var(--success)", fontWeight: 900 }}>{formatCurrencyTotals(paidToPartner)}</td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
            <tr className="ledger-summary-row">
              <td colSpan={3} style={{ fontWeight: 900 }}>ټول رسیدګي دفتر ته</td>
              <td></td>
              <td style={{ color: "var(--primary)", fontWeight: 900 }}>{formatCurrencyTotals(receivedAtOffice)}</td>
              <td></td>
              <td></td>
            </tr>
            <tr className="ledger-summary-row">
              <td colSpan={3} style={{ fontWeight: 900 }}>الباقي</td>
              <td></td>
              <td></td>
              <td style={{ color: "var(--danger)", fontWeight: 900 }}>{formatCurrencyTotals(currentMoney)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="card modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <span>نوې راکړه/ورکړه</span>
              <button className="btn btn-outline btn-sm" onClick={() => setShowForm(false)}><X size={14} /></button>
            </div>
            {error && <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="form-label">ډول</label>
                <select className="form-input" value={type} onChange={(e) => setType(e.target.value as PartnerTransactionType)}>
                  <option value="investment">رسید دفتر ته</option>
                  <option value="withdrawal">رسید حاجي صاحب ته</option>
                </select>
              </div>
              <div>
                <label className="form-label">اندازه</label>
                <input className="form-input" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <label className="form-label">اسعار</label>
                <select className="form-input" value={transactionCurrencyCode} onChange={(e) => setTransactionCurrencyCode(e.target.value)}>
                  <option value="AFN">افغانی</option>
                  <option value="USD">ډالر</option>
                  <option value="PKR">کلداره</option>
                </select>
              </div>
              <div>
                <label className="form-label">نېټه</label>
                <ShamsiDateInput className="form-input" value={transactionDate} onChange={setTransactionDate} />
              </div>
              <div>
                <label className="form-label">تفصیل</label>
                <textarea className="form-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="تفصیل ولیکئ..." />
              </div>
              <div>
                <label className="form-label">یادداشت</label>
                <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-primary" disabled={!amount || createMutation.isPending} onClick={() => createMutation.mutate()}>ثبتول</button>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>لغوه</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
