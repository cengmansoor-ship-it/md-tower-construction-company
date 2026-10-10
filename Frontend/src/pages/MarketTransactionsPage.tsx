import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Save, UserRound } from "lucide-react";
import { api, type Party, type PartyLedgerResponse } from "../lib/api";
import DateFilterButton from "../components/DateFilterButton";
import JalaliDate from "../components/JalaliDate";
import ShamsiDateInput from "../components/ShamsiDateInput";
import { currencyLabel, visibleText } from "../lib/labels";

type TransactionKind = "receipt" | "money";

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function firstOfMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function decimalSign(value?: string | null): -1 | 0 | 1 {
  const normalized = String(value ?? "0").trim();
  if (/^-?0*(?:\.0*)?$/.test(normalized)) return 0;
  return normalized.startsWith("-") ? -1 : 1;
}

function isPositiveDecimal(value?: string | null): boolean {
  const normalized = String(value ?? "").trim();
  return /^\d+(?:\.\d+)?$/.test(normalized) && decimalSign(normalized) > 0;
}

function transactionAmount(row: PartyLedgerResponse["rows"][number]): string {
  return decimalSign(row.receipt) !== 0 ? row.receipt : row.money;
}

function transactionKindLabel(row: PartyLedgerResponse["rows"][number]): string {
  return decimalSign(row.receipt) !== 0 ? "راکړه" : "ورکړه";
}

function matchesCustomer(customer: Party, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    customer.name,
    customer.fatherName,
    customer.grandfatherName,
    customer.tazkiraNumber,
    customer.phone1,
    customer.phone2,
    customer.address,
    customer.notes,
  ].some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

export default function MarketTransactionsPage() {
  const qc = useQueryClient();
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedPartyId, setSelectedPartyId] = useState<number | null>(null);
  const [transactionKind, setTransactionKind] = useState<TransactionKind>("receipt");
  const [transactionDate, setTransactionDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("AFN");
  const [description, setDescription] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(today());
  const [error, setError] = useState<string | null>(null);

  const { data: customers } = useQuery({
    queryKey: ["market-individual-customers", customerQuery],
    queryFn: () => {
      const params = new URLSearchParams({ type: "market_individual", withBalances: "1" });
      if (customerQuery.trim()) params.set("q", customerQuery.trim());
      return api.get<Party[]>(`/parties?${params.toString()}`);
    },
  });

  const customerOptions = useMemo(
    () => (customers ?? []).filter((customer) => matchesCustomer(customer, customerQuery)),
    [customers, customerQuery],
  );

  const selectedCustomer = useMemo(
    () => customers?.find((customer) => customer.id === selectedPartyId) ?? null,
    [customers, selectedPartyId],
  );

  const { data: ledger, refetch: refetchLedger } = useQuery({
    queryKey: ["market-individual-ledger", selectedPartyId, currencyCode, startDate, endDate],
    enabled: selectedPartyId != null,
    queryFn: () => {
      const params = new URLSearchParams({ startDate, endDate });
      if (currencyCode) params.set("currency", currencyCode);
      return api.get<PartyLedgerResponse>(`/parties/${selectedPartyId}/ledger?${params.toString()}`);
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const kindLabel = transactionKind === "receipt" ? "راکړه" : "ورکړه";
      const note = description.trim();
      const bill = billNumber.trim();
      const descriptionParts = [`بازار/انفرادي ${kindLabel}`];
      if (bill) descriptionParts.push(`د مشتری بیل نمبر: ${bill}`);
      if (note) descriptionParts.push(note);
      return api.post(`/parties/${selectedPartyId}/ledger`, {
        date: transactionDate,
        description: descriptionParts.join(" - "),
        entryType: transactionKind,
        amount: amount.trim(),
        currencyCode,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["market-individual-ledger"] });
      qc.invalidateQueries({ queryKey: ["party-ledger"] });
      qc.invalidateQueries({ queryKey: ["party-ledger-total"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      setAmount("");
      setDescription("");
      setBillNumber("");
      setError(null);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "ثبت ناکام شو"),
  });

  const canSave = Boolean(selectedPartyId && transactionDate && currencyCode && isPositiveDecimal(amount));
  const selectedBalance = ledger?.balances[currencyCode]?.net ?? selectedCustomer?.balances?.[currencyCode] ?? "0";

  function selectCustomer(customer: Party) {
    setSelectedPartyId(customer.id);
    setCustomerQuery(customer.name);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">بازار/انفرادي مشتریان</h1>
          <p className="page-sub">راکړه او ورکړه دلته ثبتېږي؛ عمومي کهاته د مشتریانو برخه کې پاتې ده.</p>
        </div>
        <Link className="btn btn-outline" to="/parties?type=market_individual" style={{ textDecoration: "none" }}>
          <UserRound size={16} /> بازار/انفرادي مشتریان
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
        <div className="card" style={{ padding: 18, borderRadius: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: 8, background: "rgba(247, 144, 9, 0.12)", color: "#B45309", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ArrowLeftRight size={22} />
            </div>
            <div style={{ fontWeight: 950, fontSize: 18 }}>نوی راکړه/ورکړه</div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label className="form-label">مشتری لټون</label>
              <input className="form-input" value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="نوم، تماس یا آدرس..." />
              {customerQuery.trim() ? (
                <div style={{ marginTop: 8, maxHeight: 190, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)" }}>
                  {customerOptions.length ? customerOptions.slice(0, 20).map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => selectCustomer(customer)}
                      style={{
                        width: "100%",
                        border: 0,
                        borderBottom: "1px solid var(--border)",
                        background: selectedPartyId === customer.id ? "rgba(34, 197, 94, 0.1)" : "transparent",
                        color: "var(--text)",
                        cursor: "pointer",
                        padding: "10px 12px",
                        textAlign: "right",
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>{customer.name}</div>
                      <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 3 }}>
                        {[customer.phone1, customer.phone2, customer.address].filter(Boolean).join(" - ") || "معلومات نشته"}
                      </div>
                    </button>
                  )) : (
                    <div style={{ padding: 12, color: "var(--muted)", textAlign: "center" }}>مشتری ونه موندل شو</div>
                  )}
                </div>
              ) : null}
            </div>
            <div>
              <label className="form-label">بازار/انفرادي مشتری</label>
              <select className="form-input" value={selectedPartyId ?? ""} onChange={(event) => setSelectedPartyId(Number(event.target.value) || null)}>
                <option value="">-- مشتری وټاکئ --</option>
                {customerOptions.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                type="button"
                className={`btn ${transactionKind === "receipt" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setTransactionKind("receipt")}
                style={{ justifyContent: "center", fontWeight: 900 }}
              >
                راکړه
              </button>
              <button
                type="button"
                className={`btn ${transactionKind === "money" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setTransactionKind("money")}
                style={{ justifyContent: "center", fontWeight: 900 }}
              >
                ورکړه
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label className="form-label">نېټه</label>
                <ShamsiDateInput className="form-input" value={transactionDate} onChange={setTransactionDate} />
              </div>
              <div>
                <label className="form-label">اسعار</label>
                <select className="form-input" value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)}>
                  <option value="AFN">افغانی</option>
                  <option value="USD">ډالر</option>
                  <option value="PKR">کلداره</option>
                </select>
              </div>
            </div>

            <div>
              <label className="form-label">مبلغ / ارزښت</label>
              <input className="form-input" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0" />
            </div>
            <div>
              <label className="form-label">د مشتری بیل نمبر</label>
              <input className="form-input" value={billNumber} onChange={(event) => setBillNumber(event.target.value)} placeholder="د مشتری بیل نمبر ولیکئ" />
            </div>
            <div>
              <label className="form-label">تفصیل</label>
              <textarea className="form-input" value={description} onChange={(event) => setDescription(event.target.value)} style={{ height: 86, padding: "12px 16px" }} placeholder="د راکړې/ورکړې تفصیل..." />
            </div>

            {error ? <div style={{ color: "var(--danger)", fontWeight: 800, fontSize: 13 }}>{error}</div> : null}

            <button className="btn btn-primary" disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()} style={{ justifyContent: "center", fontWeight: 900 }}>
              <Save size={16} /> ثبتول
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div className="card" style={{ padding: 16, borderRadius: 8 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
              <div style={{ minWidth: 150 }}>
                <label className="form-label">شروع تاریخ</label>
                <ShamsiDateInput className="form-input" value={startDate} onChange={setStartDate} />
              </div>
              <div style={{ minWidth: 150 }}>
                <label className="form-label">ختم تاریخ</label>
                <ShamsiDateInput className="form-input" value={endDate} onChange={setEndDate} />
              </div>
              <DateFilterButton onClick={() => { if (selectedPartyId != null) void refetchLedger(); }} />
              <div style={{ marginRight: "auto", minWidth: 170 }}>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>اوسنی الباقی</div>
                <div style={{ color: decimalSign(selectedBalance) === 0 ? "var(--text)" : "var(--danger)", fontWeight: 950, fontSize: 18, direction: "ltr", textAlign: "right" }}>
                  {selectedBalance} {currencyLabel(currencyCode)}
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 16, borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div style={{ fontWeight: 950, fontSize: 17 }}>{selectedCustomer ? selectedCustomer.name : "راکړه/ورکړه"}</div>
              {selectedPartyId ? (
                <Link to={`/parties/${selectedPartyId}`} className="btn btn-outline btn-sm" style={{ textDecoration: "none" }}>
                  عمومي کهاته
                </Link>
              ) : null}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {ledger?.rows.map((row) => (
                <div key={row.id} className="interactive-card" style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <strong>{transactionKindLabel(row)}</strong>
                    <span className="badge badge-muted"><JalaliDate date={row.date} /></span>
                  </div>
                  <div style={{ color: "var(--muted)", lineHeight: 1.7 }}>{visibleText(row.description, "تفصیل")}</div>
                  <div style={{ direction: "ltr", textAlign: "right", fontWeight: 950, color: transactionKindLabel(row) === "راکړه" ? "var(--success)" : "var(--danger)" }}>
                    {transactionAmount(row)} {currencyLabel(row.currencyCode)}
                  </div>
                </div>
              ))}
              {selectedPartyId && !ledger?.rows.length ? (
                <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>په ټاکل شوې موده کې راکړه/ورکړه نشته.</div>
              ) : null}
              {!selectedPartyId ? (
                <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>لومړی بازار/انفرادي مشتری وټاکئ.</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
