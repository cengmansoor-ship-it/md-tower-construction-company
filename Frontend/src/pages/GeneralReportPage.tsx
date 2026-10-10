import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, Printer } from "lucide-react";
import { api, type GeneralReport, type GeneralReportSectionSummary } from "../lib/api";
import PrintHeader from "../components/PrintHeader";
import ShamsiDateInput from "../components/ShamsiDateInput";
import DateFilterButton from "../components/DateFilterButton";
import { exportCsv } from "../lib/exportCsv";
import { isoToJalaliString } from "../lib/jalali";
import { currencyLabel, visibleText } from "../lib/labels";

type ReportRowsKey = "purchasing" | "expenses" | "exchange" | "marketIndividualCustomers" | "propertySales" | "rentals" | "employees" | "miscWorkers" | "kafil";

const SECTIONS: { key: ReportRowsKey; label: string; note: string; to: string }[] = [
  { key: "purchasing", label: "۱. خریداري برخه", note: "اجناس، عرضه کوونکي، رسیده ګي او پاته حساب", to: "/purchases/list" },
  { key: "propertySales", label: "۲. فروشات برخه", note: "خرڅ شوي ملکیتونه، وصول او پاته پور", to: "/sales?customerType=sales_customer&salesDetail=1&allDates=1" },
  { key: "expenses", label: "۳. مصارفاتو برخه", note: "د دفتر او پروژې مصرفونه", to: "/expenses" },
  { key: "exchange", label: "۴. صرافي برخه", note: "صراف ته جمع، رسیده ګي او الباقي حساب", to: "/parties?type=exchange_dealer" },
  { key: "marketIndividualCustomers", label: "۵. بازار / انفرادي مشتریانو برخه", note: "د بازار او انفرادي مشتریانو کهاتې، رسیده ګي او الباقي حساب", to: "/parties?type=market_individual" },
  { key: "rentals", label: "۶. کرایه برخه", note: "کرایه شوي ملکیتونه او رسیدات", to: "/rentals?unitType=shop" },
  { key: "employees", label: "۷. کارکوونکي برخه", note: "د حاضري کارکوونکو مستحق حساب او ورکړل شوې پیسې", to: "/employees" },
  { key: "miscWorkers", label: "۸. متفرقه کاریګر", note: "د متفرقه کارکوونکو مزدوري، رسیده ګي او الباقي", to: "/misc-workers" },
  { key: "kafil", label: "۹. کفیل برخه", note: "د کفیل راتګ، د صلاحیت موده او ثبت شوي کارونه", to: "/kafil" },
];

function isZero(value: string | number | null | undefined): boolean {
  return Number(value ?? 0) === 0;
}

function addDecimal(left: string | number | null | undefined, right: string | number | null | undefined): string {
  const values = [String(left ?? "0"), String(right ?? "0")];
  const scale = Math.max(...values.map((value) => (value.split(".")[1] ?? "").length));
  const toBig = (value: string) => {
    const trimmed = value.trim();
    const negative = trimmed.startsWith("-");
    const [whole, fraction = ""] = trimmed.replace(/^[-+]/, "").split(".");
    const digits = `${whole || "0"}${fraction.padEnd(scale, "0")}`.replace(/^0+(?=\d)/, "") || "0";
    return (negative ? -1n : 1n) * BigInt(digits);
  };
  const total = toBig(values[0]) + toBig(values[1]);
  const negative = total < 0n;
  const absolute = negative ? -total : total;
  if (scale === 0) return `${negative ? "-" : ""}${absolute.toString()}`;
  const padded = absolute.toString().padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale) || "0";
  const fraction = padded.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function formatMoney(value: string | number | null | undefined, currency?: string): string {
  const raw = String(value ?? "0");
  const trimmed = raw.trim();
  const sign = trimmed.startsWith("-") ? "-" : "";
  const unsigned = trimmed.replace(/^[-+]/, "");
  const [integerPart, decimalPart] = unsigned.split(".", 2);
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const clean = `${sign}${groupedInteger || "0"}${decimalPart !== undefined ? `.${decimalPart}` : ""}`;
  return currency ? `${clean} ${currencyLabel(currency)}` : clean;
}

function formatCurrencyMap(values: Record<string, string> | undefined): string {
  if (!values || Object.keys(values).length === 0) return "0";
  return Object.entries(values)
    .filter(([, value]) => !isZero(value))
    .map(([currency, value]) => formatMoney(value, currency))
    .join("\n") || "0";
}

function pashtoText(value: string | null | undefined, fallback = "—"): string {
  return visibleText(value, fallback);
}

function valuesMatchSearch(query: string, values: unknown[]): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(needle));
}

function FooterBox({
  to,
  label,
  children,
  className,
}: {
  to: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link to={to} className="general-report-footer-box">
      <span>{label}</span>
      <strong className={className}>{children}</strong>
    </Link>
  );
}

function SectionFooter({ summary, to }: { summary?: GeneralReportSectionSummary; to: string }) {
  if (!summary) return null;
  const totalAmount = Object.fromEntries(Object.entries(summary.byCurrency).map(([currency, value]) => [currency, value.totalAmount]));
  const settlement = Object.fromEntries(Object.entries(summary.byCurrency).map(([currency, value]) => [currency, addDecimal(value.moneyReceived, value.moneyPaid)]));
  const receivable = Object.fromEntries(Object.entries(summary.byCurrency).map(([currency, value]) => [currency, value.owedToCompany]));
  const debt = Object.fromEntries(Object.entries(summary.byCurrency).map(([currency, value]) => [currency, value.owedByCompany]));

  return (
    <div className="general-report-footer">
      <FooterBox to={to} label="شمېر">{summary.rowCount}</FooterBox>
      <FooterBox to={to} label="جمله حساب">{formatCurrencyMap(totalAmount)}</FooterBox>
      <FooterBox to={to} label="رسیده ګي" className="success-text">{formatCurrencyMap(settlement)}</FooterBox>
      <FooterBox to={to} label="پور" className="danger-text">{formatCurrencyMap(debt)}</FooterBox>
      <FooterBox to={to} label="طلب" className="success-text">{formatCurrencyMap(receivable)}</FooterBox>
    </div>
  );
}

export default function GeneralReportPage() {
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("q") ?? "";
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [q, setQ] = useState(urlSearch);

  useEffect(() => {
    setQ(urlSearch);
  }, [urlSearch]);

  const { data: report, error, isFetching, refetch } = useQuery({
    queryKey: ["general-report", startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (!startDate && !endDate) params.set("allDates", "1");
      return api.get<GeneralReport>(`/reports/general?${params.toString()}`);
    },
  });
  const rangeLabel = startDate || endDate
    ? `${startDate ? isoToJalaliString(startDate) : "له پیل"} تر ${endDate ? isoToJalaliString(endDate) : "تر پایه"}`
    : "ټول تاریخونه";
  const visibleSections = useMemo(
    () => SECTIONS.filter((section) => valuesMatchSearch(q, [section.label, section.note, section.key])),
    [q],
  );
  const visibleProjects = useMemo(
    () => (report?.projects ?? []).filter((project) =>
      valuesMatchSearch(q, [
        project.projectName,
        project.blocks,
        project.floors,
        project.totalProperties,
        project.available,
        project.reserved,
        project.sold,
        project.rented,
        project.unavailable,
      ]),
    ),
    [q, report?.projects],
  );
  const showProjectsSection = valuesMatchSearch(q, ["پروژې", "بلاکونه", "منزلونه", "ملکیتونه", "projects"]) || visibleProjects.length > 0;

  function exportSection(key: ReportRowsKey, label: string) {
    if (!report) return;
    const summary = report.sectionSummaries[key];
    if (!summary) return;
    exportCsv(`${label}-${startDate || "ټول"}-${endDate || "تاریخونه"}`, Object.entries(summary.byCurrency).map(([currency, value]) => ({
      "اسعار": currencyLabel(currency),
      "جمله حساب": value.totalAmount,
      "رسیده ګي": addDecimal(value.moneyReceived, value.moneyPaid),
      "پور": value.owedByCompany,
      "طلب": value.owedToCompany,
    })));
  }

  return (
    <div className="general-report-page">
      <PrintHeader title="د شرکت عمومي راپور" rangeLabel={rangeLabel} pashtoOnly />

      <div className="page-header no-print">
        <div>
          <p className="page-title" style={{ margin: 0 }}>عمومي راپور</p>
          <p className="page-sub">د شرکت ټولې راکړې ورکړې، طلب، پور، رسیده ګي او چاپ وړ خلاصه.</p>
        </div>
        <button className="btn btn-outline" onClick={() => window.print()}>
          <Printer size={16} /> چاپ
        </button>
      </div>

      <div className="card general-report-filter no-print">
        <label>
          <span>شروع تاریخ</span>
          <ShamsiDateInput className="form-input" value={startDate} onChange={setStartDate} />
        </label>
        <label>
          <span>ختم تاریخ</span>
          <ShamsiDateInput className="form-input" value={endDate} onChange={setEndDate} />
        </label>
        <button className="btn btn-outline" type="button" onClick={() => { setStartDate(""); setEndDate(""); }}>
          ټول تاریخونه
        </button>
        <DateFilterButton onClick={() => void refetch()} />
      </div>

      {error ? (
        <div className="card general-report-error">
          <AlertTriangle size={20} />
          <div>
            <strong>عمومي راپور جوړ نه شو.</strong>
            <p>{error instanceof Error ? visibleText(error.message, "د راپور په جوړولو کې ستونزه راغله.") : "د راپور په جوړولو کې ستونزه راغله."}</p>
          </div>
        </div>
      ) : isFetching || !report ? (
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>په بارېدو کې...</div>
      ) : (
        <>
          {visibleSections.map((section) => (
            <div className="card general-report-section" key={section.key}>
              <div className="card-header general-report-section-header">
                <div>
                  <div>{section.label}</div>
                  <p>{section.note}</p>
                </div>
                <button className="btn btn-ghost btn-sm no-print" onClick={() => exportSection(section.key, section.label)}>
                  <Download size={14} /> راایستل
                </button>
              </div>
              <SectionFooter summary={report.sectionSummaries[section.key]} to={section.to} />
            </div>
          ))}

          {showProjectsSection ? (
          <div className="card general-report-section">
            <div className="card-header general-report-section-header">
              <div>
                <div>۱۰. پروژې - بلاکونه، منزلونه او ملکیتونه</div>
                <p>د پروژو ساختماني جوړښت او د ملکیتونو حالت</p>
              </div>
            </div>
            <div style={{ overflow: "auto" }}>
              <table className="fl-table general-report-table">
                <thead>
                  <tr>
                    <th>پروژه</th>
                    <th>بلاکونه</th>
                    <th>منزلونه</th>
                    <th>ټول ملکیتونه</th>
                    <th>خالي</th>
                    <th>نیول شوي</th>
                    <th>فروش شوي</th>
                    <th>کرایه شوي</th>
                    <th>بند/غیر فعال</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProjects.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--muted)" }}>هیڅ پروژه نشته.</td></tr>
                  ) : (
                    visibleProjects.map((project) => (
                      <tr key={project.projectId}>
                        <td><Link to={`/projects/${project.projectId}`} className="table-link">{pashtoText(project.projectName, project.projectName)}</Link></td>
                        <td>{project.blocks}</td>
                        <td>{project.floors}</td>
                        <td>{project.totalProperties}</td>
                        <td>{project.available}</td>
                        <td>{project.reserved}</td>
                        <td>{project.sold}</td>
                        <td>{project.rented}</td>
                        <td>{project.unavailable}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          ) : null}
        </>
      )}
    </div>
  );
}
