import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Save, UserRound } from "lucide-react";
import { api, type Party, type PartyLedgerResponse } from "../lib/api";
import DateFilterButton from "../components/DateFilterButton";
import JalaliDate from "../components/JalaliDate";
import ShamsiDateInput from "../components/ShamsiDateInput";
import { currencyLabel, visibleText } from "../lib/labels";

type ExchangeLedgerKind = "money" | "receipt";

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

function absDecimal(value?: string | null): string {
  const normalized = String(value ?? "0").trim();
  return normalized.startsWith("-") ? normalized.slice(1) : normalized;
}

function isPositiveDecimal(value?: string | null): boolean {
  const normalized = String(value ?? "").trim();
  return /^\d+(?:\.\d+)?$/.test(normalized) && decimalSign(normalized) > 0;
}

function rowAmount(row: PartyLedgerResponse["rows"][number]): string {
  return decimalSign(row.receipt) !== 0 ? row.receipt : row.money;
}

function rowKindLabel(row: PartyLedgerResponse["rows"][number]): string {
  return decimalSign(row.receipt) !== 0 ? "رسیده" : "صراف ته جمع";
}

function matchesDealer(dealer: Party, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    dealer.name,
    dealer.fatherName,
    dealer.grandfatherName,
    dealer.tazkiraNumber,
    dealer.phone1,
    dealer.phone2,
    dealer.address,
    dealer.notes,
  ].some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

export default function ExchangeDealerTransactionsPage() {
  const qc = useQueryClient();
  const [dealerQuery, setDealerQuery] = useState("");
  const [selectedPartyId, setSelectedPartyId] = useState<number | null>(null);
  const [entryType, setEntryType] = useState<ExchangeLedgerKind>("money");
  const [entryDate, setEntryDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("AFN");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(today());
  const [error, setError] = useState<string | null>(null);

  const { data: dealers } = useQuery({
    queryKey: ["exchange-dealer-transaction-dealers", dealerQuery],
    queryFn: () => {
      const params = new URLSearchParams({ type: "exchange_dealer", withBalances: "1" });
      if (dealerQuery.trim()) params.set("q", dealerQuery.trim());
      return api.get<Party[]>(`/parties?${params.toString()}`);
    },
  });

  const dealerOptions = useMemo(
    () => (dealers ?? []).filter((dealer) => matchesDealer(dealer, dealerQuery)),
    [dealers, dealerQuery],
  );

  const selectedDealer = useMemo(
    () => dealers?.find((dealer) => dealer.id === selectedPartyId) ?? null,
    [dealers, selectedPartyId],
  );

  const { data: ledger, refetch: refetchLedger } = useQuery({
    queryKey: ["exchange-dealer-transaction-ledger", selectedPartyId, currencyCode, startDate, endDate],
    enabled: selectedPartyId != null,
    queryFn: () => {
      const params = new URLSearchParams({ startDate, endDate });
      if (currencyCode) params.set("currency", currencyCode);
      return api.get<PartyLedgerResponse>(`/parties/${selectedPartyId}/ledger?${params.toString()}`);
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const note = description.trim();
      return api.post(`/parties/${selectedPartyId}/ledger`, {
        date: entryDate,
        description: note,
        entryType,
        amount: amount.trim(),
        currencyCode,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exchange-dealer-transaction-ledger"] });
      qc.invalidateQueries({ queryKey: ["party-ledger"] });
      qc.invalidateQueries({ queryKey: ["party-ledger-total"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      setAmount("");
      setDescription("");
      setError(null);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "ثبت ناکام شو"),
  });

  const canSave = Boolean(selectedPartyId && entryDate && currencyCode && isPositiveDecimal(amount));
  const selectedBalance = ledger?.balances[currencyCode]?.net ?? selectedDealer?.balances?.[currencyCode] ?? "0";
  const selectedBalanceSign = decimalSign(selectedBalance);

  function selectDealer(dealer: Party) {
    setSelectedPartyId(dealer.id);
    setDealerQuery(dealer.name);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">د صرافي راکړه/ورکړه</h1>
          <p className="page-sub">د هر صراف لپاره افغانی، ډالر او کلداره حساب ثبتېږي.</p>
        </div>
        <Link className="btn btn-outline" to="/parties?type=exchange_dealer" style={{ textDecoration: "none" }}>
          <UserRound size={16} /> صرافي مشتریان
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
        <div className="card" style={{ padding: 18, borderRadius: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: 8, background: "rgba(14, 165, 233, 0.12)", color: "#0369A1", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ArrowLeftRight size={22} />
            </div>
            <div style={{ fontWeight: 950, fontSize: 18 }}>نوی صرافي ثبت</div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label className="form-label">صراف لټون</label>
              <input className="form-input" value={dealerQuery} onChange={(event) => setDealerQuery(event.target.value)} placeholder="نوم، تماس یا ادرس..." />
              {dealerQuery.trim() ? (
                <div style={{ marginTop: 8, maxHeight: 190, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)" }}>
                  {dealerOptions.length ? dealerOptions.slice(0, 20).map((dealer) => (
                    <button
                      key={dealer.id}
                      type="button"
                      onClick={() => selectDealer(dealer)}
                      style={{
                        width: "100%",
                        border: 0,
                        borderBottom: "1px solid var(--border)",
                        background: selectedPartyId === dealer.id ? "rgba(14, 165, 233, 0.1)" : "transparent",
                        color: "var(--text)",
                        cursor: "pointer",
                        padding: "10px 12px",
                        textAlign: "right",
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>{dealer.name}</div>
                      <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 3 }}>
                        {[dealer.phone1, dealer.phone2, dealer.address].filter(Boolean).join(" - ") || "معلومات نشته"}
                      </div>
                    </button>
                  )) : (
                    <div style={{ padding: 12, color: "var(--muted)", textAlign: "center" }}>صراف ونه موندل شو</div>
                  )}
                </div>
              ) : null}
            </div>
            <div>
              <label className="form-label">صراف</label>
              <select className="form-input" value={selectedPartyId ?? ""} onChange={(event) => setSelectedPartyId(Number(event.target.value) || null)}>
                <option value="">-- صراف وټاکئ --</option>
                {dealerOptions.map((dealer) => (
                  <option key={dealer.id} value={dealer.id}>{dealer.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                type="button"
                className={`btn ${entryType === "money" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setEntryType("money")}
                style={{ justifyContent: "center", fontWeight: 900 }}
              >
                صراف ته جمع
              </button>
              <button
                type="button"
                className={`btn ${entryType === "receipt" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setEntryType("receipt")}
                style={{ justifyContent: "center", fontWeight: 900 }}
              >
                رسیده
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label className="form-label">نېټه</label>
                <ShamsiDateInput className="form-input" value={entryDate} onChange={setEntryDate} />
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
              <label className="form-label">مبلغ</label>
              <input className="form-input" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0" />
            </div>
            <div>
              <label className="form-label">تفصیل</label>
              <textarea className="form-input" value={description} onChange={(event) => setDescription(event.target.value)} style={{ height: 86, padding: "12px 16px" }} placeholder="د صرافي تفصیل..." />
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
              <div style={{ marginRight: "auto", minWidth: 190 }}>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>اوسنی الباقی</div>
                <div style={{ color: selectedBalanceSign < 0 ? "var(--danger)" : selectedBalanceSign > 0 ? "var(--success)" : "var(--text)", fontWeight: 950, fontSize: 18, direction: "ltr", textAlign: "right" }}>
                  {selectedBalanceSign < 0 ? `-${absDecimal(selectedBalance)}` : selectedBalance} {currencyLabel(currencyCode)}
                </div>
              </div>
            </div>
            {selectedDealer && selectedBalanceSign < 0 ? (
              <div className="ledger-balance-alert" style={{ marginTop: 12, marginBottom: 0 }}>
                پور: دفتر د {selectedDealer.name} قرضداره دي {absDecimal(selectedBalance)} {currencyLabel(currencyCode)}
              </div>
            ) : null}
          </div>

          <div className="card" style={{ padding: 16, borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div style={{ fontWeight: 950, fontSize: 17 }}>{selectedDealer ? selectedDealer.name : "صرافي کهاته"}</div>
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
                    <strong>{rowKindLabel(row)}</strong>
                    <span className="badge badge-muted"><JalaliDate date={row.date} /></span>
                  </div>
                  <div style={{ color: "var(--muted)", lineHeight: 1.7 }}>{visibleText(row.description, "تفصیل")}</div>
                  <div style={{ direction: "ltr", textAlign: "right", fontWeight: 950, color: rowKindLabel(row) === "رسیده" ? "var(--danger)" : "var(--success)" }}>
                    {rowAmount(row)} {currencyLabel(row.currencyCode)}
                  </div>
                </div>
              ))}
              {selectedPartyId && !ledger?.rows.length ? (
                <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>په ټاکل شوې موده کې صرافي ثبت نشته.</div>
              ) : null}
              {!selectedPartyId ? (
                <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>لومړی صراف وټاکئ.</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
