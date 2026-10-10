import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type CompanySettings } from "../lib/api";
import { applyCompanyTitle, cleanCompanyName, DEFAULT_COMPANY_NAME, readStoredCompanyTitle } from "../lib/companyName";

export default function AppTitle() {
  const storedTitle = readStoredCompanyTitle() ?? DEFAULT_COMPANY_NAME;
  const { data: settings } = useQuery({
    queryKey: ["settings-public"],
    queryFn: () => api.get<CompanySettings>("/settings/public"),
  });

  const title = settings ? cleanCompanyName(settings.companyName) : storedTitle;

  useEffect(() => {
    applyCompanyTitle(title);
  }, [title]);

  return null;
}
