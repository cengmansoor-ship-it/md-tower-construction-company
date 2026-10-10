import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ProfitLossReport } from "../lib/api";
import PrintHeader from "../components/PrintHeader";
import { Printer } from "lucide-react";
import { isoToJalaliString } from "../lib/jalali";
import ShamsiDateInput from "../components/ShamsiDateInput";
import DateFilterButton from "../components/DateFilterButton";
import { currencyLabel } from "../lib/labels";

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const ROWS: { key: keyof ProfitLossReport; label: string; sign?: "pos" | "neg" }[] = [
  { key: "propertySaleIncome", label: "د ملکیت پلور عاید", sign: "pos" },
  { key: "rentalIncome", label: "د کرایې عاید", sign: "pos" },
  { key: "otherIncome", label: "نور عاید", sign: "pos" },
  { key: "totalIncome", label: "ټول عاید", sign: "pos" },
  { key: "purchases", label: "پیرودنې", sign: "neg" },
  { key: "expenses", label: "لګښتونه", sign: "neg" },
  { key: "employeeCosts", label: "د کارکوونکو لګښت", sign: "neg" },
  { key: "totalOutflow", label: "ټول لګښت", sign: "neg" },
  { key: "partnerWithdrawals", label: "د شریکانو وباسل شوي (پانګه، نه د ګټې برخه)" },
  { key: "availableBalance", label: "اوسنی نغدي پاتې" },
];

export default function ProfitLossPage() {
  const [currencyCode, setCurrencyCode] = useState("AFN");
  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(today());

  const { data: report, isFetching, refetch: refetchReport } = useQuery({
    queryKey: ["profit-loss", currencyCode, startDate, endDate],
    queryFn: () => api.get<ProfitLossReport>(`/reports/profit-loss?currencyCode=${currencyCode}&startDate=${startDate}&endDate=${endDate}`),
  });

  return (
    <div>
      <PrintHeader title="د ګټې او تاوان راپور" rangeLabel={`${isoToJalaliString(startDate)} تر ${isoToJalaliString(endDate)} - ${currencyLabel(currencyCode)}`} />
      <div className="page-header no-print">
        <div>
          <p className="page-title" style={{ margin: 0 }}>ګټه او تاوان</p>
          <p className="page-sub">د شرکت د ګټې او تاوان راپور — د اسعارو له مخې جلا</p>
        </div>
        <button className="btn btn-outline" onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Printer size={16} /> چاپ
        </button>
      </div>

      <div className="card no-print" style={{ padding: 18, margin: "16px 0", display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <label className="form-label">اسعار</label>
          <select className="form-input" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
            <option value="AFN">افغانی</option><option value="USD">ډالر</option><option value="PKR">کلداره</option>
          </select>
        </div>
        <div>
          <label className="form-label">د پیل نېټه</label>
          <ShamsiDateInput className="form-input" value={startDate} onChange={setStartDate} />
        </div>
        <div>
          <label className="form-label">د پای نېټه</label>
          <ShamsiDateInput className="form-input" value={endDate} onChange={setEndDate} />
        </div>
        <DateFilterButton onClick={() => void refetchReport()} />
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table className="fl-table" style={{ fontSize: 13 }}>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.key}>
                <td style={{ fontWeight: 600 }}>{r.label}</td>
                <td
                  style={{
                    textAlign: "left",
                    color: r.sign === "pos" ? "var(--success)" : r.sign === "neg" ? "var(--danger)" : undefined,
                    fontWeight: 600,
                  }}
                >
                  {report ? report[r.key] : "…"} {currencyLabel(currencyCode)}
                </td>
              </tr>
            ))}
            {report && (
              <>
                <tr>
                  <td style={{ fontWeight: 700 }}>ګټه</td>
                  <td style={{ textAlign: "left", fontWeight: 700, color: "var(--success)" }}>{report.profit} {currencyLabel(currencyCode)}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700 }}>تاوان</td>
                  <td style={{ textAlign: "left", fontWeight: 700, color: "var(--danger)" }}>{report.loss} {currencyLabel(currencyCode)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
        {isFetching && <div style={{ padding: 12, color: "var(--muted)", fontSize: 13 }}>د پروسس کولو په حال کې...</div>}
      </div>
    </div>
  );
}
