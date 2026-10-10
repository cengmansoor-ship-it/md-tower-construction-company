export const DEFAULT_COMPANY_NAME = "د سیستم اداره";
export const COMPANY_TITLE_STORAGE_KEY = "arabian-d-company-title";

export function cleanCompanyName(name: string | null | undefined, fallback = DEFAULT_COMPANY_NAME): string {
  const trimmed = name?.trim();
  if (!trimmed) return fallback;
  return trimmed;
}

export function readStoredCompanyTitle(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return cleanCompanyName(window.localStorage.getItem(COMPANY_TITLE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function storeCompanyTitle(title: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COMPANY_TITLE_STORAGE_KEY, title);
  } catch {
    // Browsers can block storage; the live title still updates without it.
  }
}

export function applyCompanyTitle(name: string | null | undefined): string {
  const title = cleanCompanyName(name);
  if (typeof document !== "undefined") {
    document.title = title;
  }
  storeCompanyTitle(title);
  return title;
}
