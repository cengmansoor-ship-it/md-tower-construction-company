const BASE = import.meta.env.VITE_API_BASE || "/api";
export const apiBaseUrl = BASE;

export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const DECIMAL_STRING_PATTERN = /^[+-]?\d+\.\d+$/u;

function trimTrailingDecimalZeros(value: string): string {
  if (!DECIMAL_STRING_PATTERN.test(value)) return value;
  const [integerPart, fractionPart] = value.split(".", 2);
  const trimmedFraction = fractionPart.replace(/0+$/u, "");
  return trimmedFraction ? `${integerPart}.${trimmedFraction}` : integerPart;
}

function normalizeDecimalStrings<T>(value: T): T {
  if (typeof value === "string") return trimTrailingDecimalZeros(value) as T;

  if (Array.isArray(value)) {
    return value.map((item) => normalizeDecimalStrings(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalizeDecimalStrings(item)]),
    ) as T;
  }

  return value;
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const THOUSAND_SEPARATOR_PATTERN = /[,\u060C\u066C'\u00A0\u2009\u202F_ \t]/gu;

function toWesternDigits(value: string): string {
  return value
    .replace(/[۰-۹]/gu, (ch) => String(PERSIAN_DIGITS.indexOf(ch)))
    .replace(/[٠-٩]/gu, (ch) => String(ARABIC_DIGITS.indexOf(ch)));
}

function sanitizeDecimalString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const cleaned = toWesternDigits(trimmed)
    .replace(/[٫]/gu, ".")
    .replace(THOUSAND_SEPARATOR_PATTERN, "");
  if (!/^[+-]?\d*\.?\d+$/u.test(cleaned) && !/^[+-]?\d+\.?\d*$/u.test(cleaned)) return value;
  return cleaned;
}

function sanitizeDecimalInputs<T>(value: T): T {
  if (typeof value === "string") return sanitizeDecimalString(value) as T;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDecimalInputs(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeDecimalInputs(item)]),
    ) as T;
  }

  return value;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const csrfToken = readCookie("csrf_token");
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? normalizeDecimalStrings(await res.json()) : null;

  if (!res.ok) {
    const message = (data && data.error) || res.statusText;
    if (res.status === 401 && path !== "/auth/me" && path !== "/auth/login" && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:expired"));
    }
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(sanitizeDecimalInputs(body)) : undefined }),
  put: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(sanitizeDecimalInputs(body)) : undefined }),
  delete: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
  uploadFile: async <T,>(path: string, file: File, method: "POST" | "PUT" = "POST"): Promise<T> => {
    const csrfToken = readCookie("csrf_token");
    const res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": file.type,
        "X-File-Name": encodeURIComponent(file.name),
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
      body: file,
    });
    const data = res.headers.get("content-type")?.includes("application/json")
      ? normalizeDecimalStrings(await res.json())
      : null;
    if (!res.ok) {
      if (res.status === 401 && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("auth:expired"));
      throw new ApiError(res.status, (data && data.error) || res.statusText, data);
    }
    return data as T;
  },
};

export interface CurrentUser {
  id: number;
  username: string;
  fullName: string;
  roles: string[];
  activeRole?: string | null;
}

export interface CompanySettings {
  id: number;
  companyName: string;
  baseCurrencyCode: string;
  fiscalYearStartMonth: number;
  locale: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  slogan: string | null;
  welcomeTitlePashto: string;
  welcomeSubtitlePashto: string;
  welcomeDescriptionPashto: string;
  welcomeTitleEnglish: string;
  welcomeSubtitleEnglish: string;
  welcomeDescriptionEnglish: string;
}

export interface SystemBackupResult {
  fileName: string;
  latestFileName: string;
  bytes: number;
  createdAt: string;
  message: string;
}

export interface DashboardSummary {
  totalBlocks: number;
  totalFloors: number;
  totalProperties: number;
  unitsByStatus: Record<string, number>;
  unitStatusDetails: Record<string, DashboardDrilldownItem[]>;
  totalCustomers: number;
  drilldowns: {
    blocks: DashboardDrilldownItem[];
    floors: DashboardDrilldownItem[];
    properties: DashboardDrilldownItem[];
    customers: DashboardDrilldownItem[];
    activeRentals: DashboardDrilldownItem[];
  };
  salesTotalsByCurrency: Record<string, string>;
  receivedTotalsByCurrency: Record<string, string>;
  outstandingTotalsByCurrency: Record<string, string>;
  todayIncomingByCurrency: Record<string, string>;
  todayOutgoingByCurrency: Record<string, string>;
  activeRentals: number;
  attendanceToday: {
    present: number;
    absent: number;
    halfDay: number;
    leave: number;
    notRecorded: number;
    totalEmployees: number;
    presentEmployees: DashboardDrilldownItem[];
    absentEmployees: DashboardDrilldownItem[];
    halfDayEmployees: DashboardDrilldownItem[];
    leaveEmployees: DashboardDrilldownItem[];
    notRecordedEmployees: DashboardDrilldownItem[];
  };
  companyReceivablesByCurrency: Record<string, string>;
  companyPayablesByCurrency: Record<string, string>;
  recentTransactions: Array<{ id: number; date: string; memo: string | null; isManual: boolean; sourceUrl: string | null }>;
  alerts: string[];
}

export interface DashboardDrilldownItem {
  id: number;
  label: string;
  detail: string | null;
  to: string;
}

export interface GeneralReportRow {
  date: string;
  reference: string;
  party: string | null;
  itemName?: string | null;
  quantity?: string | null;
  currencyCode: string;
  totalAmount: string;
  moneyReceived: string;
  moneyPaid: string;
  owedToCompany: string;
  owedByCompany: string;
  blockName?: string | null;
  floorName?: string | null;
  unitNumber?: string | null;
  unitTypeName?: string | null;
  sourceUrl?: string | null;
  note: string | null;
}

export interface GeneralReportCurrencySummary {
  totalAmount: string;
  moneyReceived: string;
  moneyPaid: string;
  owedToCompany: string;
  owedByCompany: string;
}

export interface GeneralReportSectionSummary {
  rowCount: number;
  byCurrency: Record<string, GeneralReportCurrencySummary>;
}

export interface GeneralReportSalesSummary {
  soldCount: number;
  remainingCount: number;
  soldLocations: string[];
  remainingLocations: string[];
  totalSoldByCurrency: Record<string, string>;
  receivedByCurrency: Record<string, string>;
  customerDebtByCurrency: Record<string, string>;
}

export interface GeneralReportPurchaseItemSummary {
  itemName: string;
  quantity: string;
  unitOfMeasure: string | null;
  currencyCode: string;
  totalAmount: string;
}

export interface ProjectStructureRow {
  projectId: number;
  projectName: string;
  blocks: number;
  floors: number;
  totalProperties: number;
  available: number;
  reserved: number;
  sold: number;
  rented: number;
  unavailable: number;
}

export interface GeneralReport {
  currencyCode: string | null;
  startDate: string;
  endDate: string;
  purchasing: GeneralReportRow[];
  expenses: GeneralReportRow[];
  customers: GeneralReportRow[];
  marketIndividualCustomers: GeneralReportRow[];
  exchange: GeneralReportRow[];
  propertySales: GeneralReportRow[];
  rentals: GeneralReportRow[];
  employees: GeneralReportRow[];
  miscWorkers: GeneralReportRow[];
  kafil: GeneralReportRow[];
  partners: GeneralReportRow[];
  journal: GeneralReportRow[];
  ledger: GeneralReportRow[];
  purchaseItems: GeneralReportPurchaseItemSummary[];
  purchaseItemTotalsByCurrency: Record<string, string>;
  projects: ProjectStructureRow[];
  sectionSummaries: Record<string, GeneralReportSectionSummary>;
  salesSummary: GeneralReportSalesSummary;
  grandSummary: GeneralReportSectionSummary;
}

export interface Currency {
  id: number;
  code: string;
  name: string;
  isBase: boolean;
}

export interface ManagedUser {
  id: number;
  username: string;
  fullName: string;
  isActive: boolean;
  roles: string[];
  createdAt: string;
  failedLoginAttempts: number;
  isLocked: boolean;
  lockedUntil: string | null;
}

export interface RoleWithPermissions {
  id: number;
  name: string;
  description: string | null;
  permissions: string[];
}

export interface Permission {
  id: number;
  key: string;
  description: string | null;
}

export interface AuditLogEntry {
  id: number;
  username: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface TrashItem {
  id: number;
  entityType: string;
  entityId: string;
  displayName: string;
  sourcePath: string | null;
  snapshot: unknown;
  deleteReason: string;
  deletedByUserId: number | null;
  deletedByUsername: string | null;
  deletedAt: string;
  purgeAfter: string;
  purgedAt: string | null;
  purgedByUserId: number | null;
  purgeReason: string | null;
  restoredAt: string | null;
  restoredByUserId: number | null;
  restoreReason: string | null;
  createdAt: string;
}

export type ProjectStatus = "draft" | "active" | "on_hold" | "completed" | "archived";

export interface Project {
  id: number;
  name: string;
  code: string;
  status: ProjectStatus;
  description: string | null;
  deletedAt: string | null;
  deletedByUserId: number | null;
  deleteReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BlockGroup {
  id: number;
  projectId: number;
  name: string;
  order: number;
}

export interface Block {
  id: number;
  projectId: number;
  blockGroupId: number | null;
  name: string;
  code: string;
  order: number;
  notes: string | null;
}

export type FloorType = "basement" | "ground" | "mezzanine" | "residential" | "commercial" | "parking" | "roof" | "other";
export type FloorPurpose = "for_sale" | "for_rent" | null;

export interface Floor {
  id: number;
  blockId: number;
  name: string;
  levelNumber: number;
  floorType: FloorType;
  unitTypeId: number | null;
  unitType?: UnitType | null;
  purpose: FloorPurpose;
  order: number;
}

export type UnitStatus = "draft" | "available" | "reserved" | "sold" | "rented" | "blocked" | "cancelled" | "inactive";
export type UnitPurpose = "for_sale" | "for_rent" | "both" | "not_available";

export interface UnitType {
  id: number;
  name: string;
  isActive: boolean;
}

export interface Unit {
  id: number;
  floorId: number;
  unitTypeId: number;
  unitNumber: string;
  status: UnitStatus;
  purpose: UnitPurpose;
  roomCount: number | null;
  areaSqm: number | null;
  notes: string | null;
  unitType?: UnitType;
  sales?: Sale[];
  rentals?: Rental[];
}

export interface FloorWithUnits extends Floor {
  units: Unit[];
}

export interface BlockWithFloors extends Block {
  floors: FloorWithUnits[];
}

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export interface Account {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  isSystem: boolean;
  isActive: boolean;
}

export interface CashAccountEntry {
  id: number;
  name: string;
  currencyCode: string;
  accountId: number;
  isActive: boolean;
  account?: Account;
}

export type JournalDirection = "debit" | "credit";
export type DailyCashCategory = "cash_in" | "labor" | "kitchen" | "machinery" | "company" | "customers" | "other";
export type DailyCashEntryType = "in" | "out";
export type DailyCashTargetType =
  | "supplier"
  | "sales_customer"
  | "exchange_dealer"
  | "market_customer"
  | "individual_customer"
  | "regular_employee"
  | "misc_worker"
  | "expense"
  | "company"
  | "other";

export interface JournalLineEntry {
  id: number;
  transactionId: number;
  accountId: number;
  currencyCode: string;
  direction: JournalDirection;
  amount: string;
  description: string | null;
  account?: Account;
  transaction?: JournalTransactionEntry;
}

export interface JournalTransactionEntry {
  id: number;
  idempotencyKey: string;
  transactionDate: string;
  memo: string | null;
  isManual: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  reversalOfId: number | null;
  createdAt: string;
  lines: JournalLineEntry[];
}

export interface DailyCashEntry {
  id: number;
  entryDate: string;
  description: string;
  category: DailyCashCategory;
  entryType: DailyCashEntryType;
  targetType: DailyCashTargetType | null;
  targetId: number | null;
  targetName: string | null;
  amount: string;
  currencyCode: string;
  journalTransactionId: number | null;
  linkedEmployeePaymentId: number | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

export interface DailyCashSummary {
  entries: DailyCashEntry[];
  totals: Record<DailyCashCategory | "total_expenses", string>;
  previousDate: string;
  previousDayCount: number;
}

export interface DailyCashDaySummary {
  entryDate: string;
  currencyCode: string;
  transactionCount: number;
  totalIn: string;
  totalOut: string;
  netTotal: string;
  lastDescription: string | null;
}

export interface DailyCashPartyTarget {
  id: number;
  type: PartyType;
  name: string;
  fatherName: string | null;
  phone1: string | null;
}

export interface DailyCashEmployeeTarget {
  id: number;
  workerType: EmployeeWorkerType;
  name: string;
  fatherName: string | null;
  employeeNumber: string;
  currencyCode: string;
  status: EmployeeStatus;
  endDate: string | null;
}

export interface DailyCashTargets {
  parties: DailyCashPartyTarget[];
  employees: DailyCashEmployeeTarget[];
}

export type PartyType =
  | "individual_customer"
  | "market_customer"
  | "supplier"
  | "sales_customer"
  | "tenant"
  | "exchange_dealer"
  | "employee"
  | "partner"
  | "other";

export interface Party {
  id: number;
  type: PartyType;
  name: string;
  companyName: string | null;
  fatherName: string | null;
  grandfatherName: string | null;
  tazkiraNumber: string | null;
  taxRegNumber: string | null;
  phone1: string | null;
  phone2: string | null;
  address: string | null;
  notes: string | null;
  photoUrl: string | null;
  isActive: boolean;
  deletedAt: string | null;
  deletedByUserId: number | null;
  deleteReason: string | null;
  balances?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface PartyLedgerResponse {
  party: Party;
  lines: JournalLineEntry[];
  rows: Array<{
    id: number;
    lineId: number;
    transactionId: number;
    number: number;
    date: string;
    description: string;
    accountName: string | null;
    money: string;
    receipt: string;
    balance: string;
    currencyCode: string;
    direction: "debit" | "credit";
    sourceModule: string | null;
    sourceId: number | null;
    sourceLabel: string;
    sourceUrl: string | null;
    sourceReference: string | null;
    sourceCustomerBillNumber: string | null;
    sourceItemName: string | null;
    sourceQuantity: string | null;
    sourceUnitOfMeasure: string | null;
    sourceUnitPrice: string | null;
    sourceTotalAmount: string | null;
    isMarketTransaction?: boolean;
    isMarketSettlement?: boolean;
    isMarketBalanceDecrease?: boolean;
    canEdit: boolean;
    canDelete: boolean;
  }>;
  purchaseItemTotals: Array<{
    itemName: string;
    unitOfMeasure: string | null;
    quantity: string;
  }>;
  balances: Record<string, { debit: string; credit: string; net: string }>;
}

export interface UnitWithLocation extends Unit {
  floor?: Floor & { block?: Block };
}

export type SaleStatus = "draft" | "reserved" | "active" | "fully_paid" | "cancelled" | "reversed";

export interface Sale {
  id: number;
  saleNumber: string;
  contractNumber: string | null;
  unitId: number;
  partyId: number;
  price: string;
  discount: string;
  finalPrice: string;
  currencyCode: string;
  saleDate: string;
  paymentType: string | null;
  status: SaleStatus;
  notes: string | null;
  createdAt: string;
  balance?: string;
  ledgerReceived?: string;
  ledgerBalance?: string;
  party?: Party;
  unit?: UnitWithLocation;
  receipts?: SaleReceipt[];
}

export interface SaleDocument {
  id: number;
  saleId: number;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByUserId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaleReceipt {
  id: number;
  receiptNumber: string;
  saleId: number;
  receiptDate: string;
  amount: string;
  previousBalance: string | null;
  newBalance: string | null;
  currencyCode: string;
  method: string;
  cashAccountId: number | null;
  reference: string | null;
  note: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

export type RentalStatus = "active" | "ended" | "cancelled";
export type RentalFrequency = "monthly" | "quarterly" | "yearly";

export interface Rental {
  id: number;
  rentalNumber: string;
  unitId: number;
  tenantPartyId: number;
  startDate: string;
  endDate: string | null;
  rentAmount: string;
  frequency: RentalFrequency;
  depositAmount: string;
  currencyCode: string;
  status: RentalStatus;
  notes: string | null;
  createdAt: string;
  balance?: string;
  tenant?: Party;
  unit?: UnitWithLocation;
  receipts?: RentalReceipt[];
}

export interface RentalReceipt {
  id: number;
  receiptNumber: string;
  rentalId: number;
  receiptDate: string;
  amount: string;
  previousBalance: string | null;
  newBalance: string | null;
  currencyCode: string;
  method: string;
  cashAccountId: number | null;
  reference: string | null;
  note: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

export type ExpenseCategory = "kitchen" | "office" | "transport" | "utilities" | "salaries" | "maintenance" | "other";

export interface Expense {
  id: number;
  expenseNumber: string;
  category: ExpenseCategory;
  categoryName: string | null;
  expenseDate: string;
  description: string;
  amount: string;
  currencyCode: string;
  payeePartyId: number | null;
  payeeName: string | null;
  projectId: number | null;
  cashAccountId: number | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  payeeParty?: Party;
  project?: Project;
}

export type PurchaseStatus = "open" | "paid" | "cancelled";

export interface Purchase {
  id: number;
  purchaseNumber: string;
  customerBillNumber: string | null;
  supplierPartyId: number;
  purchaseDate: string;
  itemName: string;
  quantity: string;
  unitOfMeasure: string | null;
  unitPrice: string;
  totalAmount: string;
  currencyCode: string;
  status: PurchaseStatus;
  notes: string | null;
  createdAt: string;
  balance?: string;
  supplier?: Party;
  payments?: PurchasePayment[];
  returns?: PurchaseReturn[];
}

export interface PurchasePayment {
  id: number;
  paymentNumber: string;
  purchaseId: number;
  paymentDate: string;
  amount: string;
  previousBalance: string | null;
  newBalance: string | null;
  currencyCode: string;
  method: string;
  reference: string | null;
  note: string | null;
  voidedAt: string | null;
  createdAt: string;
}

export interface PurchaseReturn {
  id: number;
  returnNumber: string;
  customerBillNumber: string | null;
  purchaseId: number;
  returnDate: string;
  returnedItemName: string;
  quantity: string;
  amount: string;
  currencyCode: string;
  reason: string;
  createdAt: string;
  purchase?: Purchase;
}

export type EmployeeWageType = "daily" | "monthly";
export type EmployeeStatus = "active" | "inactive";
export type EmployeeWorkerType = "regular" | "misc";

export interface Employee {
  id: number;
  employeeNumber: string;
  name: string;
  fatherName: string | null;
  phone: string | null;
  position: string;
  wageType: EmployeeWageType;
  wageAmount: string;
  currencyCode: string;
  startDate: string;
  endDate: string | null;
  status: EmployeeStatus;
  workerType: EmployeeWorkerType;
  notes: string | null;
  createdAt: string;
  balance?: string;
  previousBalance?: string;
  earnedTotal?: string;
  paidTotal?: string;
  attendances?: Attendance[];
  payments?: EmployeePayment[];
  workPeriods?: EmployeeWorkPeriod[];
  documents?: EmployeeDocument[];
}

export interface EmployeeDocument {
  id: number;
  employeeId: number;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByUserId: number | null;
  createdAt: string;
}

export interface EmployeeWorkPeriod {
  id: number;
  employeeId: number;
  startDate: string;
  endDate: string;
  wageType: EmployeeWageType;
  wageAmount: string;
  currencyCode: string;
  workerType: EmployeeWorkerType;
  note: string | null;
  createdAt: string;
}

export type AttendanceStatus = "present" | "absent" | "leave" | "half_day";

export interface Attendance {
  id: number;
  employeeId: number;
  date: string;
  status: AttendanceStatus;
  payableAmount: string;
  currencyCode: string;
  notes: string | null;
  createdAt: string;
}

export type EmployeePaymentType = "salary" | "advance" | "debt_repayment";

export interface EmployeePayment {
  id: number;
  paymentNumber: string;
  employeeId: number;
  paymentDate: string;
  type: EmployeePaymentType;
  amount: string;
  previousBalance: string | null;
  newBalance: string | null;
  currencyCode: string;
  method: string;
  note: string | null;
  voidedAt: string | null;
  createdAt: string;
}

export interface ExchangeTransaction {
  id: number;
  exchangeNumber: string;
  partyId: number;
  exchangeDate: string;
  currencyGiven: string;
  amountGiven: string;
  currencyReceived: string;
  amountReceived: string;
  rate: string;
  fee: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  party?: Party;
}

export type PartnerStatus = "active" | "inactive";

export interface CompanyPartner {
  id: number;
  partnerNumber: string;
  name: string;
  initialInvestment: string;
  currencyCode: string;
  ownershipPercent: string | null;
  joinDate: string;
  status: PartnerStatus;
  notes: string | null;
  createdAt: string;
}

export interface Partner {
  id: number;
  partnerNumber: string;
  partyId: number;
  initialInvestment: string;
  currencyCode: string;
  ownershipPercent: string | null;
  joinDate: string;
  status: PartnerStatus;
  notes: string | null;
  createdAt: string;
  balance?: string;
  balancesByCurrency?: Record<string, string>;
  party?: Party;
  transactions?: PartnerTransaction[];
}

export type PartnerTransactionType = "investment" | "withdrawal";

export interface PartnerTransaction {
  id: number;
  transactionNumber: string;
  partnerId: number;
  transactionDate: string;
  type: PartnerTransactionType;
  amount: string;
  previousBalance: string | null;
  newBalance: string | null;
  currencyCode: string;
  description: string | null;
  note: string | null;
  createdAt: string;
}

export interface ProfitLossReport {
  currencyCode: string;
  startDate: string;
  endDate: string;
  propertySaleIncome: string;
  rentalIncome: string;
  otherIncome: string;
  totalIncome: string;
  purchases: string;
  expenses: string;
  employeeCosts: string;
  totalOutflow: string;
  partnerWithdrawals: string;
  availableBalance: string;
  profit: string;
  loss: string;
}
