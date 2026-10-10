import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { api, type CompanySettings } from "../lib/api";
import { isoToJalaliString } from "../lib/jalali";
import { cleanCompanyName } from "../lib/companyName";

interface DebtPartyPrintHeaderProps {
  partyName: string;
  partyCompanyName?: string | null;
  partyAddress?: string | null;
  partyPhone?: string | null;
  typeLabel: string;
}

function localIsoDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function DebtPartyPrintHeader({
  partyName,
  partyCompanyName,
  partyAddress,
  partyPhone,
  typeLabel,
}: DebtPartyPrintHeaderProps) {
  const [printDate, setPrintDate] = useState(() => localIsoDate());
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<CompanySettings>("/settings"),
  });

  useEffect(() => {
    const scrolledElements = new Map<HTMLElement, { left: number; top: number }>();

    const updatePrintDateTime = () => {
      setPrintDate(localIsoDate());
    };

    const resetPrintScroll = () => {
      updatePrintDateTime();
      scrolledElements.clear();
      document
        .querySelectorAll(".ledger-list-surface, .print-report-surface, .ledger-table-top-scroll, .app-main-content")
        .forEach((element) => {
          if (!(element instanceof HTMLElement)) return;
          scrolledElements.set(element, { left: element.scrollLeft, top: element.scrollTop });
          element.scrollLeft = 0;
          element.scrollTop = 0;
        });
    };

    const restorePrintScroll = () => {
      scrolledElements.forEach((position, element) => {
        element.scrollLeft = position.left;
        element.scrollTop = position.top;
      });
      scrolledElements.clear();
    };

    window.addEventListener("beforeprint", resetPrintScroll);
    window.addEventListener("afterprint", restorePrintScroll);
    return () => {
      window.removeEventListener("beforeprint", resetPrintScroll);
      window.removeEventListener("afterprint", restorePrintScroll);
    };
  }, []);

  const companyName = cleanCompanyName(settings?.companyName);
  const slogan = settings?.slogan?.trim();

  const footerRows = [
    settings?.address,
    settings?.website ? `وېب پاڼه: ${settings.website}` : null,
    settings?.phone ? `تلیفون: ${settings.phone}` : null,
    settings?.whatsapp ? `پیغام شمېره: ${settings.whatsapp}` : null,
    settings?.email ? `برېښنالیک: ${settings.email}` : null,
  ].filter((row): row is string => Boolean(row));

  return (
    <>
      <div className="print-header debt-print-header">
        <div className="debt-print-header-grid">
          <div className="debt-print-office-block">
            <div className="debt-print-office-name">{companyName}</div>
            {slogan ? <div className="debt-print-slogan">{slogan}</div> : null}
          </div>

          <div className="debt-print-logo-block">
            {settings?.logoUrl ? (
              <img className="debt-print-logo" src={settings.logoUrl} alt="لوګو" />
            ) : (
              <div className="debt-print-logo-fallback" aria-label="لوګو">
                <Building2 size={30} />
              </div>
            )}
          </div>

          <div className="debt-print-customer-block">
            <table className="debt-print-customer-table">
              <tbody>
                <tr>
                  <td className="debt-print-customer-label">د مشتري د شرکت نوم</td>
                  <td>{partyCompanyName || "—"}</td>
                </tr>
                <tr>
                  <td className="debt-print-customer-label">د مشتري نوم</td>
                  <td>{partyName}</td>
                </tr>
                <tr>
                  <td className="debt-print-customer-label">د حساب ډول</td>
                  <td>{typeLabel}</td>
                </tr>
                <tr>
                  <td className="debt-print-customer-label">د مشتري آدرس</td>
                  <td>{partyAddress || "—"}</td>
                </tr>
                <tr>
                  <td className="debt-print-customer-label">د مشتري د تماس شمېره</td>
                  <td>{partyPhone || "—"}</td>
                </tr>
                <tr>
                  <td className="debt-print-customer-label">هجري شمسي تاریخ</td>
                  <td>{isoToJalaliString(printDate)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="print-footer">
        {footerRows.length ? footerRows.join(" | ") : companyName}
      </div>
    </>
  );
}
