import { useQuery } from "@tanstack/react-query";
import { Building2, Printer } from "lucide-react";
import { api, type CompanySettings } from "../lib/api";
import { cleanCompanyName } from "../lib/companyName";

interface LedgerIdentityBarProps {
  subtitle?: string;
}

export default function LedgerIdentityBar({ subtitle }: LedgerIdentityBarProps) {
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<CompanySettings>("/settings"),
  });

  const companyName = cleanCompanyName(settings?.companyName);

  return (
    <div className="ledger-identity-bar no-print">
      <div className="ledger-company-block">
        <div className="ledger-company-name">{companyName}</div>
        {subtitle ? <div className="ledger-company-meta">{subtitle}</div> : null}
      </div>
      <div className="ledger-brand-actions">
        <button className="btn btn-outline" onClick={() => window.print()}>
          <Printer size={16} /> کهاته چاپ
        </button>
        {settings?.logoUrl ? (
          <img className="ledger-logo" src={settings.logoUrl} alt="لوګو" />
        ) : (
          <div className="ledger-logo-fallback" aria-label="لوګو">
            <Building2 size={22} />
          </div>
        )}
      </div>
    </div>
  );
}
