export function currencyLabel(code: string | null | undefined): string {
  switch (code) {
    case "AFN":
      return "افغانی";
    case "USD":
      return "ډالر";
    case "PKR":
      return "کلداره";
    default:
      return code ?? "";
  }
}

export function userDisplayName(fullName: string | null | undefined, username: string | null | undefined): string {
  const name = fullName?.trim();
  if (name) {
    if (username === "admin" || name === "System Administrator") return "د سیستم اداره کوونکی";
    return name;
  }
  if (username && !/[A-Za-z]/.test(username)) return username;
  return "د سیستم کاروونکی";
}

export function roleLabel(name: string | null | undefined): string {
  switch (name) {
    case "admin":
      return "اداره کوونکی";
    case "manager":
      return "مسوول";
    case "accountant":
      return "محاسب";
    case "cashier":
      return "خزانه دار";
    case "project_manager":
      return "د پروژې مسوول";
    case "purchase_manager":
      return "د خریداري مسوول";
    case "sales_manager":
      return "د فروشاتو مسوول";
    case "expenses_manager":
      return "د مصارفاتو مسوول";
    case "hr_manager":
      return "د کارکوونکو مسوول";
    case "exchange_manager":
      return "د صرافۍ مسوول";
    case "partners_manager":
      return "د شریکانو مسوول";
    case "reports_viewer":
      return "د راپورونو لیدونکی";
    case "auditor":
      return "څارونکی";
    case "kafil":
      return "کفیل";
    case "viewer":
      return "لیدونکی";
    default:
      return name && !/[A-Za-z]/.test(name) ? name : "رول";
  }
}

export function primaryRoleLabel(roles: string[] | null | undefined, fallback = "کاروونکی", activeRole?: string | null): string {
  if (activeRole) return activeRole === "admin" || activeRole === "super_admin" ? "سوپر آډمین" : roleLabel(activeRole);
  if (!roles?.length) return fallback;
  if (roles.includes("admin") || roles.includes("super_admin")) return "سوپر آډمین";
  if (roles.includes("kafil")) return "کفیل";
  const primaryRole = roles.find((role) => role !== "viewer") ?? roles[0];
  return roleLabel(primaryRole);
}

export function permissionLabel(key: string): string {
  const [area, action] = key.split(".");
  const areaLabels: Record<string, string> = {
    dashboard: "ډشبورډ",
    journal: "روزنامچه",
    parties: "مشتریان",
    projects: "پروژې",
    purchases: "خریداري",
    sales: "فروشات",
    rentals: "کرایه",
    expenses: "مصارفات",
    partners: "شریکان",
    reports: "راپورونه",
    settings: "عمومي تنظیمات",
    users: "کاروونکي",
    roles: "رولونه",
    exchange: "صرافي",
    employees: "کارکوونکي",
    attendance: "حاضري",
    cash_accounts: "صندوقونه",
    unit_types: "واحدونه",
    haji_ledger: "د حاجي صاحب کهاته",
    delegations: "کفیل",
    audit: "د بدلونونو راپور",
    trash: "حذف شوي ریکارډونه",
  };
  const actionLabels: Record<string, string> = {
    view: "لیدل",
    create: "جوړول",
    update: "تغیر",
    delete: "حذف",
    manage: "اداره",
    print: "چاپ",
    export: "راایستل",
  };
  return `${areaLabels[area ?? ""] ?? "برخه"} - ${actionLabels[action ?? ""] ?? "واک"}`;
}

export function visibleText(value: string | null | undefined, fallback = "ثبت شوی"): string {
  if (!value) return fallback;
  return /[A-Za-z]/.test(value) ? fallback : value;
}
