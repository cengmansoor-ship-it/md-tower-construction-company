import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type CompanySettings } from "../lib/api";
import { isoToJalaliString } from "../lib/jalali";
import { cleanCompanyName } from "../lib/companyName";

interface PrintHeaderProps {
  title: string;
  rangeLabel?: string;
  pashtoOnly?: boolean;
}

function localIsoDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localTime(date = new Date(), pashtoOnly = false): string {
  if (pashtoOnly) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
  }
  const hours = date.getHours();
  const hour12 = hours % 12 || 12;
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${String(hour12).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")} ${suffix}`;
}

export default function PrintHeader({ title, rangeLabel, pashtoOnly = false }: PrintHeaderProps) {
  const [printDate, setPrintDate] = useState(() => localIsoDate());
  const [printTime, setPrintTime] = useState(() => localTime(new Date(), pashtoOnly));
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<CompanySettings>("/settings"),
  });

  useEffect(() => {
    const scrolledElements = new Map<HTMLElement, { left: number; top: number }>();

    const updatePrintDateTime = () => {
      const now = new Date();
      setPrintDate(localIsoDate(now));
      setPrintTime(localTime(now, pashtoOnly));
    };

    const resetPrintScroll = () => {
      updatePrintDateTime();
      scrolledElements.clear();
      document
        .querySelectorAll(".purchase-list-surface, .ledger-list-surface, .expenses-print-surface, .print-report-surface, .purchase-table-top-scroll, .ledger-table-top-scroll, .expenses-table-top-scroll, .sales-table-top-scroll, .app-main-content")
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
  }, [pashtoOnly]);

  const footerRows = [
    settings?.address,
    settings?.website ? `وېب پاڼه: ${settings.website}` : null,
    settings?.phone ? `تلیفون: ${settings.phone}` : null,
    settings?.whatsapp ? `پیغام شمېره: ${settings.whatsapp}` : null,
    settings?.email ? `برېښنالیک: ${settings.email}` : null,
  ].filter((row): row is string => Boolean(row)).filter((row) => !pashtoOnly || !/[A-Za-z]/.test(row));

  return (
    <>
      <div className="print-header">
        <div className="print-header-grid">
          <div className="print-company-block">
            <div className="print-company-name">{cleanCompanyName(settings?.companyName)}</div>
          </div>

          <div className="print-logo-block">
            {settings?.logoUrl ? (
              <img className="print-logo" src={settings.logoUrl} alt="لوګو" />
            ) : null}
          </div>

          <div className="print-date-block">
            <div>هجري شمسي تاریخ: {isoToJalaliString(printDate)}</div>
            {pashtoOnly ? null : <div>عیسوي چاپ تاریخ: {printDate}</div>}
            <div>د چاپ وخت: {printTime}</div>
            {rangeLabel ? <div>موده: {rangeLabel}</div> : null}
          </div>
        </div>
        <div className="print-title-line">{title}</div>
      </div>

      <div className="print-footer">
        {footerRows.length ? footerRows.join(" | ") : cleanCompanyName(settings?.companyName)}
      </div>
    </>
  );
}
