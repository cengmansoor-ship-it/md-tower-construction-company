import { useEffect, useRef, useState, type UIEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Edit2, Plus, Save, Trash2, X } from "lucide-react";
import { api, type Party, type PartyLedgerResponse, type PartyType, type Purchase } from "../lib/api";
import PrintHeader from "../components/PrintHeader";
import LedgerIdentityBar from "../components/LedgerIdentityBar";
import DebtPartyPrintHeader from "../components/DebtPartyPrintHeader";
import JalaliDate from "../components/JalaliDate";
import ShamsiDateInput from "../components/ShamsiDateInput";
import DateFilterButton from "../components/DateFilterButton";
import { currencyLabel as displayCurrency } from "../lib/labels";
import { isValidOptionalPhone, phoneDigits, phoneRestrictionMessage } from "../lib/phone";

const TYPE_LABELS: Record<PartyType, string> = {
  individual_customer: "انفرادي مشتری",
  market_customer: "بازار مشتری",
  supplier: "د اجناسو د خریداري مشتری",
  sales_customer: "د فروش مشتری",
  tenant: "کرایه دار",
  exchange_dealer: "صرافي مشتری",
  employee: "کارکوونکی",
  partner: "شریک / حاجي صاحب",
  other: "نور",
};

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

function parseDecimal(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const sign = normalized.startsWith("-") ? -1n : 1n;
  const unsigned = normalized.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  return { amount: sign * BigInt(`${whole || "0"}${fraction}`), scale: fraction.length };
}

function formatScaled(amount: bigint, scale: number): string {
  const sign = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;
  if (scale === 0) return `${sign}${absolute}`;
  const text = absolute.toString().padStart(scale + 1, "0");
  const whole = text.slice(0, -scale) || "0";
  const fraction = text.slice(-scale).replace(/0+$/, "");
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

function addDecimal(left: string | null | undefined, right: string | null | undefined): string {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a || !b) return String(left ?? right ?? "0");
  const scale = Math.max(a.scale, b.scale);
  const aAmount = a.amount * 10n ** BigInt(scale - a.scale);
  const bAmount = b.amount * 10n ** BigInt(scale - b.scale);
  return formatScaled(aAmount + bAmount, scale);
}

function subtractDecimal(left: string | null | undefined, right: string | null | undefined): string {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a || !b) return String(left ?? "0");
  const scale = Math.max(a.scale, b.scale);
  const aAmount = a.amount * 10n ** BigInt(scale - a.scale);
  const bAmount = b.amount * 10n ** BigInt(scale - b.scale);
  return formatScaled(aAmount - bAmount, scale);
}

function formatLedgerTotals(
  balances: PartyLedgerResponse["balances"] | undefined,
  key: "debit" | "credit" | "net",
  separator = " / ",
): string {
  const entries = Object.entries(balances ?? {}).filter(([, value]) => decimalSign(value[key]) !== 0);
  if (!entries.length) return "0";
  return entries.map(([code, value]) => `${value[key]} ${displayCurrency(code)}`).join(separator);
}

function rowAmount(value: string, currencyCode: string, showCurrency: boolean): string {
  if (decimalSign(value) === 0) return "";
  return showCurrency ? `${value} ${displayCurrency(currencyCode)}` : value;
}

function balancePartAmount(balance: string | null | undefined, part: "receivable" | "debt"): string {
  const sign = decimalSign(balance);
  if (part === "receivable") return sign > 0 ? String(balance ?? "0") : "0";
  return sign < 0 ? absDecimal(balance) : "0";
}

function formatBalancePart(balance: string | null | undefined, currencyCode: string, showCurrency: boolean, part: "receivable" | "debt"): string {
  const amount = balancePartAmount(balance, part);
  return showCurrency ? `${amount} ${displayCurrency(currencyCode)}` : amount;
}

function formatLedgerBalancePart(
  balances: PartyLedgerResponse["balances"] | undefined,
  part: "receivable" | "debt",
  separator = " / ",
): string {
  const entries = Object.entries(balances ?? {})
    .map(([code, value]) => [code, balancePartAmount(value.net, part)] as const)
    .filter(([, amount]) => decimalSign(amount) !== 0);
  if (!entries.length) return "0";
  return entries.map(([code, amount]) => `${amount} ${displayCurrency(code)}`).join(separator);
}

function purchaseQuantity(row: LedgerRow): string {
  if (!row.sourceQuantity || decimalSign(row.sourceQuantity) === 0) return "—";
  return row.sourceUnitOfMeasure ? `${row.sourceQuantity} ${row.sourceUnitOfMeasure}` : row.sourceQuantity;
}

function purchaseAmount(value: string | null, row: LedgerRow, showCurrency: boolean): string {
  if (!value || decimalSign(value) === 0) return "—";
  return showCurrency ? `${value} ${displayCurrency(row.currencyCode)}` : value;
}

type CurrencyTotals = Record<string, string>;

function addCurrencyTotal(totals: CurrencyTotals, currencyCode: string, amount: string | null | undefined) {
  totals[currencyCode] = addDecimal(totals[currencyCode] ?? "0", amount ?? "0");
}

function subtractCurrencyTotal(totals: CurrencyTotals, currencyCode: string, amount: string | null | undefined) {
  totals[currencyCode] = subtractDecimal(totals[currencyCode] ?? "0", amount ?? "0");
}

function formatCurrencyTotals(totals: CurrencyTotals, selectedCurrencyCode?: string): string {
  const entries = Object.entries(totals).filter(([, amount]) => decimalSign(amount) !== 0);
  if (!entries.length) return selectedCurrencyCode ? `0 ${displayCurrency(selectedCurrencyCode)}` : "0";
  return entries.map(([code, amount]) => `${amount} ${displayCurrency(code)}`).join("\n");
}

function debtNotificationLines(partyName: string, balanceByCurrency: CurrencyTotals): string[] {
  return Object.entries(balanceByCurrency)
    .filter(([, amount]) => decimalSign(amount) !== 0)
    .map(([code, amount]) => {
      const abs = absDecimal(amount);
      const label = displayCurrency(code);
      return decimalSign(amount) > 0
        ? `طلب: ${partyName} د دفتر قرضداره دي ${abs} ${label}`
        : `پور: دفتر د ${partyName} قرضداره دي ${abs} ${label}`;
    });
}

function supplierReceiptValue(row: LedgerRow): string {
  if (row.sourceModule === "purchase") return "0";
  return decimalSign(row.receipt) !== 0 ? row.receipt : row.money;
}

function supplierRowTotal(row: LedgerRow, showCurrency: boolean): string {
  if (row.sourceModule === "purchase") return purchaseAmount(row.sourceTotalAmount, row, showCurrency);
  if (!row.sourceModule && decimalSign(row.money) !== 0) return rowAmount(row.money, row.currencyCode, showCurrency);
  return "";
}

function supplierRowReceipt(row: LedgerRow, showCurrency: boolean): string {
  const value = supplierReceiptValue(row);
  return rowAmount(value, row.currencyCode, showCurrency);
}

function supplierRowItemName(row: LedgerRow, purchaseItemByNumber?: Map<string, string>): string {
  if (row.sourceModule === "purchase" && row.sourceReference) {
    const itemName = purchaseItemByNumber?.get(row.sourceReference);
    if (itemName) return itemName;
  }
  if ((row.sourceModule === "purchase" || row.sourceModule === "purchase_return") && row.sourceItemName) {
    return row.sourceItemName;
  }
  return row.description || "";
}

function supplierBillNumberContent(row: LedgerRow) {
  const companyBill = row.sourceReference;
  const customerBill = row.sourceCustomerBillNumber;
  if (!companyBill && !customerBill) return "—";
  return (
    <div style={{ display: "grid", gap: 2 }}>
      {companyBill ? (
        row.sourceUrl ? (
          <Link to={row.sourceUrl} style={{ color: "var(--primary)", fontWeight: 900, textDecoration: "none" }}>
            {companyBill}
          </Link>
        ) : (
          <span>{companyBill}</span>
        )
      ) : null}
      {customerBill ? <span style={{ color: "var(--muted)", fontSize: 12 }}>د مشتری بیل: {customerBill}</span> : null}
    </div>
  );
}

function supplierLedgerTotals(rows: LedgerRow[] | undefined, selectedCurrencyCode?: string) {
  const money: CurrencyTotals = {};
  const receipt: CurrencyTotals = {};
  for (const row of rows ?? []) {
    if (row.sourceModule === "purchase" && row.sourceTotalAmount) {
      addCurrencyTotal(money, row.currencyCode, row.sourceTotalAmount);
      continue;
    }
    const receiptValue = supplierReceiptValue(row);
    if (decimalSign(receiptValue) !== 0) addCurrencyTotal(receipt, row.currencyCode, receiptValue);
  }
  return {
    money: formatCurrencyTotals(money, selectedCurrencyCode),
    receipt: formatCurrencyTotals(receipt, selectedCurrencyCode),
  };
}

function isMarketTransactionRow(row: LedgerRow): boolean {
  if (typeof row.isMarketTransaction === "boolean") return row.isMarketTransaction;
  return (row.description ?? "").trim().startsWith("بازار/انفرادي ");
}

function marketTransactionValue(row: LedgerRow): string {
  return decimalSign(row.receipt) !== 0 ? row.receipt : row.money;
}

function isMarketBalanceDecreaseRow(row: LedgerRow): boolean {
  if (typeof row.isMarketBalanceDecrease === "boolean") return row.isMarketBalanceDecrease;
  if (!isMarketTransactionRow(row)) return false;
  const description = row.description ?? "";
  return description.includes("واپسي") || description.includes("واپس");
}

function isMarketActualReceiptRow(row: LedgerRow): boolean {
  if (typeof row.isMarketSettlement === "boolean") return row.isMarketSettlement;
  return !isMarketTransactionRow(row);
}

function marketSettlementValue(row: LedgerRow): string {
  if (!isMarketActualReceiptRow(row)) return "0";
  return decimalSign(row.receipt) !== 0 ? row.receipt : row.money;
}

function applyMarketSettlementBalance(totals: CurrencyTotals, currencyCode: string, amount: string) {
  if (decimalSign(totals[currencyCode] ?? "0") < 0) addCurrencyTotal(totals, currencyCode, amount);
  else subtractCurrencyTotal(totals, currencyCode, amount);
}

function marketTotalValue(row: LedgerRow): string {
  if (isMarketActualReceiptRow(row)) return "0";
  if (isMarketTransactionRow(row)) return marketTransactionValue(row);
  if (decimalSign(row.money) !== 0) return row.money;
  if (decimalSign(row.receipt) !== 0) return row.receipt;
  return "0";
}

function marketRowTotal(row: LedgerRow, showCurrency: boolean): string {
  const value = marketTotalValue(row);
  return rowAmount(isMarketBalanceDecreaseRow(row) ? subtractDecimal("0", absDecimal(value)) : value, row.currencyCode, showCurrency);
}

function marketRowReceipt(row: LedgerRow, showCurrency: boolean): string {
  if (!isMarketActualReceiptRow(row)) return "";
  return rowAmount(marketSettlementValue(row), row.currencyCode, showCurrency);
}

function marketLedgerTotals(rows: LedgerRow[] | undefined, selectedCurrencyCode?: string) {
  const total: CurrencyTotals = {};
  const receipt: CurrencyTotals = {};
  const balance: CurrencyTotals = {};
  for (const row of rows ?? []) {
    if (isMarketActualReceiptRow(row)) {
      const value = marketSettlementValue(row);
      addCurrencyTotal(receipt, row.currencyCode, value);
      applyMarketSettlementBalance(balance, row.currencyCode, value);
      continue;
    }
    const value = marketTotalValue(row);
    if (decimalSign(value) !== 0) addCurrencyTotal(total, row.currencyCode, value);
    if (isMarketBalanceDecreaseRow(row) || row.direction === "credit") {
      if (decimalSign(value) !== 0) subtractCurrencyTotal(balance, row.currencyCode, absDecimal(value));
      continue;
    }
    if (decimalSign(value) !== 0) addCurrencyTotal(balance, row.currencyCode, value);
  }
  return {
    total: formatCurrencyTotals(total, selectedCurrencyCode),
    receipt: formatCurrencyTotals(receipt, selectedCurrencyCode),
    balance: formatCurrencyTotals(balance, selectedCurrencyCode),
    balanceByCurrency: { ...balance },
    receivable: formatCurrencyTotals(
      Object.fromEntries(Object.entries(balance).map(([code, amount]) => [code, balancePartAmount(amount, "receivable")])),
      selectedCurrencyCode,
    ),
    debt: formatCurrencyTotals(
      Object.fromEntries(Object.entries(balance).map(([code, amount]) => [code, balancePartAmount(amount, "debt")])),
      selectedCurrencyCode,
    ),
  };
}

function marketRunningBalances(rows: LedgerRow[] | undefined): Map<number, string> {
  const totals: CurrencyTotals = {};
  const running = new Map<number, string>();
  for (const row of rows ?? []) {
    if (isMarketActualReceiptRow(row)) {
      const value = marketSettlementValue(row);
      applyMarketSettlementBalance(totals, row.currencyCode, value);
    } else {
      const value = marketTotalValue(row);
      if (isMarketBalanceDecreaseRow(row) || row.direction === "credit") {
        if (decimalSign(value) !== 0) subtractCurrencyTotal(totals, row.currencyCode, absDecimal(value));
      } else if (decimalSign(value) !== 0) {
        addCurrencyTotal(totals, row.currencyCode, value);
      }
    }
    running.set(row.lineId, totals[row.currencyCode] ?? "0");
  }
  return running;
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <span style={{ fontSize: 12, color: "var(--muted)" }}>{label}</span>
      <span style={{ fontSize: 14 }}>{value || "—"}</span>
    </div>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return <tr><td colSpan={colSpan} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>په ټاکل شوي تاریخ او اسعارو کې کوم ثبت نشته.</td></tr>;
}

type LedgerRow = PartyLedgerResponse["rows"][number];
type LedgerEntryType = "money" | "receipt";
type LedgerReceiptKind = "trade" | "exchange" | "bank";

const LEDGER_RECEIPT_KIND_LABELS: Record<LedgerReceiptKind, string> = {
  trade: "تجري",
  exchange: "صراف",
  bank: "بانک",
};

const CUSTOMER_BILL_PREFIX_PATTERN = /^\s*-?\s*د\s+(?:مشتری|مشتري)\s+بیل\s+(?:نمبر|شمېره|شماره)\s*[:：]?\s*[^-]*(?:\s+-\s*)?/u;
const EXCHANGE_LEDGER_PREFIX_PATTERN = /^\s*صرافي\s*-\s*(?:صراف ته جمع|د صرافی له طرفه رسیده ګی دفتر ته)\s*(?:-\s*)?/u;

function emptyLedgerForm(date: string, currencyCode: string) {
  return {
    lineId: null as number | null,
    date,
    description: "",
    entryType: "receipt" as LedgerEntryType,
    receiptKind: "trade" as LedgerReceiptKind,
    amount: "",
    currencyCode,
  };
}

function receiptKindFromDescription(description: string | null | undefined): LedgerReceiptKind {
  const text = description ?? "";
  if (text.includes(LEDGER_RECEIPT_KIND_LABELS.exchange)) return "exchange";
  if (text.includes(LEDGER_RECEIPT_KIND_LABELS.bank)) return "bank";
  return "trade";
}

function stripReceiptKindPrefix(description: string | null | undefined): string {
  let text = description ?? "";
  const paymentPrefix = "د پیسو رسید - ";
  if (text.startsWith(paymentPrefix)) text = text.slice(paymentPrefix.length);
  for (const label of Object.values(LEDGER_RECEIPT_KIND_LABELS)) {
    if (text.trim() === label) return "";
    const prefix = `${label} - `;
    if (text.startsWith(prefix)) text = text.slice(prefix.length);
  }
  text = text.replace(/^\s*بازار\/انفرادي\s+[^-]+(?:\s+-\s+د مشتری بیل نمبر:\s*[^-]*)?(?:\s+-\s*)?/u, "");
  text = text.replace(/^\s*بازار\/انفرادي\s+[^-]+(?:\s+-\s+د مشتري بیل نمبر:\s*[^-]*)?(?:\s+-\s*)?/u, "");
  text = text.replace(/\s+-\s+د شرکت بیل نمبر:\s*.+$/u, "");
  text = text.replace(EXCHANGE_LEDGER_PREFIX_PATTERN, "");
  text = text.replace(CUSTOMER_BILL_PREFIX_PATTERN, "");
  text = text.replace(/^\s*-\s*/u, "");
  return text.trim();
}

function ledgerFormFromRow(row: LedgerRow) {
  return {
    lineId: row.lineId,
    date: row.date,
    description: stripReceiptKindPrefix(row.description),
    entryType: decimalSign(row.money) !== 0 ? "money" as LedgerEntryType : "receipt" as LedgerEntryType,
    receiptKind: receiptKindFromDescription(row.description),
    amount: decimalSign(row.money) !== 0 ? row.money : row.receipt,
    currencyCode: row.currencyCode,
  };
}

export default function PartyDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const ledgerTopScrollRef = useRef<HTMLDivElement>(null);
  const ledgerBodyScrollRef = useRef<HTMLDivElement>(null);
  const ledgerTableRef = useRef<HTMLTableElement>(null);
  const queryCurrencyCode = searchParams.get("currency") || "";
  const queryStartDate = searchParams.get("startDate") || "";
  const queryEndDate = searchParams.get("endDate") || "";
  const [currencyCode, setCurrencyCode] = useState(queryCurrencyCode);
  const [startDate, setStartDate] = useState(queryStartDate);
  const [endDate, setEndDate] = useState(queryEndDate);
  const [editForm, setEditForm] = useState<Partial<Party> | null>(null);
  const [ledgerForm, setLedgerForm] = useState(emptyLedgerForm(today(), "AFN"));
  const [showLedgerForm, setShowLedgerForm] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerScrollWidth, setLedgerScrollWidth] = useState(900);

  useEffect(() => {
    document.body.classList.add("parties-print-route");
    return () => document.body.classList.remove("parties-print-route");
  }, []);

  useEffect(() => {
    setCurrencyCode(queryCurrencyCode);
    setStartDate(queryStartDate);
    setEndDate(queryEndDate);
  }, [id, queryCurrencyCode, queryStartDate, queryEndDate]);

  const { data: party } = useQuery({ queryKey: ["party", id], queryFn: () => api.get<Party>(`/parties/${id}`) });
  const { data: ledger, refetch: refetchLedger } = useQuery({
    queryKey: ["party-ledger", id, currencyCode, startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams({ startDate, endDate });
      if (currencyCode) params.set("currency", currencyCode);
      return api.get<PartyLedgerResponse>(`/parties/${id}/ledger?${params.toString()}`);
    },
  });
  const { data: fullLedger, refetch: refetchFullLedger } = useQuery({
    queryKey: ["party-ledger-total", id, currencyCode],
    queryFn: () => {
      const params = new URLSearchParams();
      if (currencyCode) params.set("currency", currencyCode);
      return api.get<PartyLedgerResponse>(`/parties/${id}/ledger?${params.toString()}`);
    },
  });
  const { data: purchasesForItemNames } = useQuery({
    queryKey: ["party-purchase-item-names", id],
    enabled: party?.type === "supplier",
    queryFn: () => api.get<Purchase[]>("/purchases"),
  });

  useEffect(() => {
    const updateScrollWidth = () => {
      const bodyWidth = ledgerBodyScrollRef.current?.scrollWidth ?? 0;
      const tableWidth = ledgerTableRef.current?.scrollWidth ?? 0;
      setLedgerScrollWidth(Math.max(900, bodyWidth, tableWidth));
    };
    updateScrollWidth();
    const observer = new ResizeObserver(updateScrollWidth);
    if (ledgerBodyScrollRef.current) observer.observe(ledgerBodyScrollRef.current);
    if (ledgerTableRef.current) observer.observe(ledgerTableRef.current);
    window.addEventListener("resize", updateScrollWidth);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScrollWidth);
    };
  }, [ledger, party?.type]);

  const updateMutation = useMutation({
    mutationFn: () => api.put(`/parties/${id}`, editForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["party", id] });
      setEditForm(null);
    },
  });

  function refreshLedger() {
    qc.invalidateQueries({ queryKey: ["party-ledger", id] });
    qc.invalidateQueries({ queryKey: ["party-ledger-total", id] });
    qc.invalidateQueries({ queryKey: ["parties"] });
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["general-report"] });
  }

  const saveLedgerMutation = useMutation({
    mutationFn: () => {
      const description = ledgerForm.description.trim();
      const body = {
        date: ledgerForm.date,
        description,
        entryType: ledgerForm.lineId ? ledgerForm.entryType : "receipt",
        amount: ledgerForm.amount,
        currencyCode: ledgerForm.currencyCode,
      };
      if (ledgerForm.lineId) return api.put(`/parties/${id}/ledger/rows/${ledgerForm.lineId}`, body);
      return api.post(`/parties/${id}/ledger`, body);
    },
    onSuccess: () => {
      refreshLedger();
      setShowLedgerForm(false);
      setLedgerError(null);
    },
    onError: (err) => setLedgerError(err instanceof Error ? err.message : "ثبت ناکام شو"),
  });

  const deleteLedgerMutation = useMutation({
    mutationFn: ({ lineId, reason }: { lineId: number; reason: string }) =>
      api.delete(`/parties/${id}/ledger/rows/${lineId}?reason=${encodeURIComponent(reason)}`),
    onSuccess: () => refreshLedger(),
    onError: (err) => setLedgerError(err instanceof Error ? err.message : "حذف ناکام شو"),
  });

  function openCreateLedgerForm() {
    setLedgerForm(emptyLedgerForm(endDate || today(), currencyCode || "AFN"));
    setLedgerError(null);
    setShowLedgerForm(true);
  }

  function openEditLedgerForm(row: LedgerRow) {
    setLedgerForm(ledgerFormFromRow(row));
    setLedgerError(null);
    setShowLedgerForm(true);
  }

  function deleteLedgerRow(row: LedgerRow) {
    const reason = window.prompt("د حذف دلیل ولیکئ:", "غلط ریکارډ");
    if (!reason) return;
    deleteLedgerMutation.mutate({ lineId: row.lineId, reason });
  }

  function syncLedgerTableScroll(event: UIEvent<HTMLDivElement>, targetRef: { current: HTMLDivElement | null }) {
    const target = targetRef.current;
    if (!target || target.scrollLeft === event.currentTarget.scrollLeft) return;
    target.scrollLeft = event.currentTarget.scrollLeft;
  }

  function findLedgerByDateRange() {
    void refetchLedger();
    void refetchFullLedger();
  }

  const balance = currencyCode ? ledger?.balances[currencyCode]?.net ?? "0" : formatLedgerTotals(ledger?.balances, "net");
  const rawWarningBalance = currencyCode ? fullLedger?.balances[currencyCode]?.net ?? balance : formatLedgerTotals(fullLedger?.balances, "net");

  if (!party) return null;

  const currencyLabel = currencyCode ? displayCurrency(currencyCode) : "ټول اسعار";
  const isSupplier = party.type === "supplier";
  const isExchange = party.type === "exchange_dealer";
  const isMarketIndividual = party.type === "individual_customer" || party.type === "market_customer";
  const isDebtTextType = isSupplier || isExchange || isMarketIndividual;
  const usesCompanyName = ["supplier", "exchange_dealer", "market_customer", "individual_customer"].includes(party.type);
  const editPhoneValue = editForm?.phone1 ?? party.phone1 ?? "";
  const editPhoneError = editForm && !isValidOptionalPhone(editPhoneValue) ? phoneRestrictionMessage("تماس شمېره") : null;
  const supplierTotals = supplierLedgerTotals(ledger?.rows, currencyCode || undefined);
  const purchaseItemByNumber = new Map(
    (purchasesForItemNames ?? [])
      .filter((purchase) => purchase.supplierPartyId === party.id)
      .map((purchase) => [purchase.purchaseNumber, purchase.itemName]),
  );
  const marketTotals = marketLedgerTotals(ledger?.rows, currencyCode || undefined);
  const fullMarketTotals = marketLedgerTotals(fullLedger?.rows, currencyCode || undefined);
  const marketRowBalances = marketRunningBalances(ledger?.rows);
  const warningBalance = isMarketIndividual ? fullMarketTotals.balance : rawWarningBalance;
  const warningSign = currencyCode ? decimalSign(warningBalance) : 0;
  const hasWarningBalance = currencyCode ? warningSign !== 0 : warningBalance !== "0";
  const specialBalanceByCurrency = isMarketIndividual
    ? fullMarketTotals.balanceByCurrency
    : Object.fromEntries(Object.entries(fullLedger?.balances ?? {}).map(([code, b]) => [code, b.net]));
  const filteredSpecialBalances = currencyCode
    ? Object.fromEntries(Object.entries(specialBalanceByCurrency).filter(([code]) => code === currencyCode))
    : specialBalanceByCurrency;
  const debtNotificationLinesForParty = isDebtTextType ? debtNotificationLines(party.name, filteredSpecialBalances) : [];
  const totalMoney = isSupplier ? supplierTotals.money : currencyCode ? `${ledger?.balances[currencyCode]?.debit ?? "0"} ${displayCurrency(currencyCode)}` : formatLedgerTotals(ledger?.balances, "debit", "\n");
  const totalReceipt = isSupplier
    ? supplierTotals.receipt
    : isMarketIndividual
    ? marketTotals.receipt
    : currencyCode
    ? `${ledger?.balances[currencyCode]?.credit ?? "0"} ${displayCurrency(currencyCode)}`
    : formatLedgerTotals(ledger?.balances, "credit", "\n");
  const balanceDisplay = isMarketIndividual ? marketTotals.balance : currencyCode ? `${balance} ${displayCurrency(currencyCode)}` : formatLedgerTotals(ledger?.balances, "net", "\n");
  const receivableDisplay = isMarketIndividual
    ? marketTotals.receivable
    : currencyCode
    ? `${balancePartAmount(balance, "receivable")} ${displayCurrency(currencyCode)}`
    : formatLedgerBalancePart(ledger?.balances, "receivable", "\n");
  const debtDisplay = isMarketIndividual
    ? marketTotals.debt
    : currencyCode
    ? `${balancePartAmount(balance, "debt")} ${displayCurrency(currencyCode)}`
    : formatLedgerBalancePart(ledger?.balances, "debt", "\n");
  const showRowCurrency = true;
  const canSaveLedger = Boolean(ledgerForm.date && ledgerForm.currencyCode && ledgerForm.amount);

  function renderLedgerActions(row: LedgerRow) {
    return (
      <td className="no-print ledger-actions-cell">
        <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          {row.sourceUrl ? (
            <Link className="btn btn-ghost btn-sm" to={row.sourceUrl} style={{ textDecoration: "none" }}>
              {row.sourceLabel}
            </Link>
          ) : (
            <button className="btn btn-outline btn-sm" type="button" onClick={() => openEditLedgerForm(row)}>
              {row.sourceLabel}
            </button>
          )}
          {row.canEdit && !row.sourceUrl ? (
            <button className="btn btn-outline btn-sm" onClick={() => openEditLedgerForm(row)}>
              <Edit2 size={13} /> تغییر
            </button>
          ) : null}
          {row.canDelete ? (
            <button className="btn btn-outline btn-sm" onClick={() => deleteLedgerRow(row)} disabled={deleteLedgerMutation.isPending}>
              <Trash2 size={13} /> حذف
            </button>
          ) : null}
        </div>
      </td>
    );
  }

  return (
    <div className="print-report-page">
      {isDebtTextType ? (
        <DebtPartyPrintHeader
          partyName={party.name}
          partyCompanyName={party.companyName}
          partyAddress={party.address}
          partyPhone={party.phone1}
          typeLabel={TYPE_LABELS[party.type]}
        />
      ) : (
        <PrintHeader title={`${party.name} کهاته`} />
      )}

      <div className="no-print">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Link to="/parties" style={{ color: "var(--muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
            مشتریان <ArrowRight size={13} />
          </Link>
          <span style={{ color: "var(--muted)" }}>/</span>
          <span style={{ fontSize: 13 }}>{party.name}</span>
        </div>

        <div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <p className="page-title" style={{ margin: 0 }}>{party.name}</p>
              <span className="badge badge-muted">{TYPE_LABELS[party.type]}</span>
            </div>
            <p className="page-sub">{currencyLabel} حساب - شروع او ختم تاریخ لري</p>
          </div>
        </div>
      </div>

      <LedgerIdentityBar subtitle={`${party.name} / ${currencyLabel} کهاته`} />

      {isDebtTextType ? (
        debtNotificationLinesForParty.length > 0 ? (
          <div className="ledger-balance-alert no-print">
            {debtNotificationLinesForParty.map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </div>
        ) : null
      ) : hasWarningBalance ? (
        <div className="ledger-balance-alert no-print">
          {!currencyCode
            ? `${party.name} الباقی حساب: ${warningBalance}`
            : warningSign > 0
            ? `${party.name} د دفتر قرضداره دی: ${warningBalance} ${currencyLabel}`
            : `دفتر د ${party.name} قرضداره دی: ${absDecimal(warningBalance)} ${currencyLabel}`}
        </div>
      ) : null}

      <div className="card no-print" style={{ padding: 18, margin: "16px 0", display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <label className="form-label">حساب ډول</label>
          <select className="form-input" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
            <option value="">ټول اسعار</option>
            <option value="AFN">افغانی</option>
            <option value="USD">ډالر</option>
            <option value="PKR">کلداره</option>
          </select>
        </div>
        <div>
          <label className="form-label">شروع تاریخ</label>
          <ShamsiDateInput className="form-input" value={startDate} onChange={setStartDate} />
        </div>
        <div>
          <label className="form-label">ختم تاریخ</label>
          <ShamsiDateInput className="form-input" value={endDate} onChange={setEndDate} />
        </div>
        <DateFilterButton onClick={findLedgerByDateRange} />
        {!isExchange ? (
          <button className="btn btn-primary" onClick={openCreateLedgerForm}>
            <Plus size={16} /> د پیسو رسید
          </button>
        ) : null}
      </div>

      <div className="card no-print person-info-panel" style={{ padding: 22, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 16 }}>
          <div style={{ fontWeight: 800 }}>د مشتری معلومات</div>
          {!editForm ? (
            <button className="btn btn-outline btn-sm" onClick={() => setEditForm({})}>
              <Edit2 size={13} /> تغیرات
            </button>
          ) : null}
        </div>

        {editForm ? (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 14 }}>
              <div>
                <label className="form-label">نوم</label>
                <input className="form-input" value={editForm.name ?? party.name} onChange={(e) => setEditForm((form) => ({ ...form, name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">تماس شمېره</label>
                <input
                  className="form-input"
                  inputMode="numeric"
                  maxLength={10}
                  pattern="\d{10}"
                  title={phoneRestrictionMessage("تماس شمېره")}
                  value={editPhoneValue}
                  onChange={(e) => setEditForm((form) => ({ ...form, phone1: phoneDigits(e.target.value) }))}
                />
                {editPhoneError ? <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>{editPhoneError}</div> : null}
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label className="form-label">آدرس</label>
                <input className="form-input" value={editForm.address ?? party.address ?? ""} onChange={(e) => setEditForm((form) => ({ ...form, address: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" onClick={() => updateMutation.mutate()} disabled={Boolean(editPhoneError) || updateMutation.isPending}><Save size={14} /> ساتل</button>
              <button className="btn btn-outline" onClick={() => setEditForm(null)}><X size={14} /> لغوه</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14 }}>
            {usesCompanyName ? (
              <InfoRow label="د شرکت نوم" value={party.companyName} />
            ) : (
              <>
                <InfoRow label="د پلار نوم" value={party.fatherName} />
                <InfoRow label="د نیکه نوم" value={party.grandfatherName} />
                <InfoRow label="تذکره" value={party.tazkiraNumber} />
              </>
            )}
            <InfoRow label="تماس شمېره" value={party.phone1} />
            <InfoRow label="دوهم تماس" value={party.phone2} />
            <InfoRow label="آدرس" value={party.address} />
          </div>
        )}
      </div>

      <div
        className="ledger-table-top-scroll no-print"
        ref={ledgerTopScrollRef}
        onScroll={(event) => syncLedgerTableScroll(event, ledgerBodyScrollRef)}
      >
        <div style={{ width: ledgerScrollWidth, height: 1 }} />
      </div>

      <div
        className="card ledger-list-surface"
        ref={ledgerBodyScrollRef}
        onScroll={(event) => syncLedgerTableScroll(event, ledgerTopScrollRef)}
        style={{ padding: 0, overflow: "auto" }}
      >
        {isSupplier ? (
          <table ref={ledgerTableRef} className="fl-table ledger-table supplier-ledger-table" style={{ minWidth: 1680, fontSize: 13 }}>
            <colgroup>
              <col className="ledger-col-number" />
              <col className="ledger-col-date" />
              <col className="ledger-col-detail" />
              <col className="ledger-col-bill" />
              <col className="ledger-col-quantity" />
              <col className="ledger-col-price" />
              <col className="ledger-col-total" />
              <col className="ledger-col-receipt" />
              <col className="ledger-col-balance" />
              <col className="ledger-actions-col no-print" />
            </colgroup>
            <thead>
              <tr>
                <th colSpan={9} className="no-print">
                  <span className="print-party-name">{party.name}</span> حساب ډول « {currencyLabel} » مشتری ادرس: {party.address ?? "—"} مشتری د تماس شمیره : {party.phone1 ?? "—"}
                </th>
                <th className="no-print ledger-actions-head"></th>
              </tr>
              <tr>
                <th>شمیره</th>
                <th>تاریخ</th>
                <th>جنس</th>
                <th>بیل نمبر</th>
                <th>تعداد</th>
                <th>قیمت</th>
                <th>مجموع</th>
                <th>رسید</th>
                <th>الباقی</th>
                <th className="no-print ledger-actions-head">کړنې</th>
              </tr>
            </thead>
            <tbody>
              {ledger?.rows.map((row) => (
                <tr key={row.id}>
                  <td className="ledger-index-cell">{row.number}</td>
                  <td className="ledger-date-cell"><JalaliDate date={row.date} /></td>
                  <td className="ledger-detail-cell">{supplierRowItemName(row, purchaseItemByNumber)}</td>
                  <td className="ledger-reference-cell">{supplierBillNumberContent(row)}</td>
                  <td className="ledger-quantity-cell">{purchaseQuantity(row)}</td>
                  <td className="ledger-price-cell">{purchaseAmount(row.sourceUnitPrice, row, showRowCurrency)}</td>
                  <td className="ledger-money-cell">{supplierRowTotal(row, showRowCurrency)}</td>
                  <td className="ledger-receipt-cell">{supplierRowReceipt(row, showRowCurrency)}</td>
                  <td className="ledger-balance-cell">{showRowCurrency ? `${row.balance} ${displayCurrency(row.currencyCode)}` : row.balance}</td>
                  {renderLedgerActions(row)}
                </tr>
              ))}
              {!ledger?.rows.length ? <EmptyRow colSpan={9} /> : null}
              <tr className="ledger-summary-row ledger-money-summary-row"><td colSpan={6} className="ledger-summary-label ledger-total-label">مجموع پیسی</td><td className="ledger-total-money-cell">{totalMoney}</td><td colSpan={2}></td><td className="no-print ledger-actions-cell"></td></tr>
              <tr className="ledger-summary-row ledger-receipt-summary-row"><td colSpan={6} className="ledger-summary-label ledger-total-receipt-label">ټوټل رسیده ګی</td><td></td><td className="ledger-total-receipt-cell">{totalReceipt}</td><td colSpan={1}></td><td className="no-print ledger-actions-cell"></td></tr>
              <tr className="ledger-summary-row ledger-balance-summary-row"><td colSpan={6} className="ledger-summary-label ledger-balance-label">الباقی حساب</td><td></td><td></td><td className="ledger-balance-total-cell">{balanceDisplay}</td><td className="no-print ledger-actions-cell"></td></tr>
            </tbody>
          </table>
        ) : isExchange ? (
          <table ref={ledgerTableRef} className="fl-table ledger-table debt-type-ledger-table" style={{ minWidth: 1100, fontSize: 13 }}>
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              <col />
              <col className="ledger-actions-col no-print" />
            </colgroup>
            <thead>
              <tr>
                <th colSpan={5} className="no-print">
                  <span className="print-party-name">{party.name}</span> حساب ډول « {currencyLabel} » صرافی آدرس : {party.address ?? "—"} تماس شمیره {party.phone1 ?? "—"}
                </th>
                <th className="no-print ledger-actions-head"></th>
              </tr>
              <tr><th>تاریخ</th><th>تفصیل</th><th>صراف ته جمع</th><th>رسیده</th><th>الباقی</th><th className="no-print ledger-actions-head">کړنې</th></tr>
            </thead>
            <tbody>
              {ledger?.rows.map((row) => (
                <tr key={row.id}>
                  <td><JalaliDate date={row.date} /></td>
                  <td>{row.description || ""}</td>
                  <td className="ledger-money-cell">{rowAmount(row.money, row.currencyCode, showRowCurrency)}</td>
                  <td className="ledger-receipt-cell">{rowAmount(row.receipt, row.currencyCode, showRowCurrency)}</td>
                  <td className="ledger-balance-cell">{showRowCurrency ? `${row.balance} ${displayCurrency(row.currencyCode)}` : row.balance}</td>
                  {renderLedgerActions(row)}
                </tr>
              ))}
              {!ledger?.rows.length ? <EmptyRow colSpan={6} /> : null}
              <tr className="ledger-summary-row ledger-money-summary-row"><td colSpan={2} className="ledger-summary-label ledger-total-label">ټوټل جمع سوی پیسی صرافی ته</td><td className="ledger-total-money-cell">{totalMoney}</td><td className="ledger-total-receipt-cell">{totalReceipt}</td><td></td><td className="no-print ledger-actions-cell"></td></tr>
              <tr className="ledger-summary-row ledger-balance-summary-row"><td colSpan={2} className="ledger-summary-label ledger-balance-label">الباقی پیسی</td><td></td><td></td><td className="ledger-balance-total-cell">{balanceDisplay}</td><td className="no-print ledger-actions-cell"></td></tr>
            </tbody>
          </table>
        ) : (
          <table ref={ledgerTableRef} className={`fl-table ledger-table${isMarketIndividual ? " debt-type-ledger-table" : ""}`} style={{ minWidth: isMarketIndividual ? 1500 : 1120, fontSize: 13 }}>
            <colgroup>
              <col />
              <col />
              <col />
              {isMarketIndividual ? <col /> : null}
              {isMarketIndividual ? <col /> : null}
              <col />
              {isMarketIndividual ? <col /> : null}
              <col />
              <col />
              {!isMarketIndividual ? <col /> : null}
              {!isMarketIndividual ? <col /> : null}
              <col className="ledger-actions-col no-print" />
            </colgroup>
            <thead>
              <tr>
                <th colSpan={isMarketIndividual ? 10 : 9} className={isMarketIndividual ? "no-print" : ""}>
                  <span className="print-party-name">{party.name}</span> / {currencyLabel} حساب
                </th>
              </tr>
              <tr>
                <th>شمیره</th>
                <th>تاریخ</th>
                <th>تفصیل</th>
                {isMarketIndividual ? <th>د شرکت بیل نمبر</th> : null}
                {isMarketIndividual ? <th>د مشتری بیل نمبر</th> : null}
                <th>پیسی</th>
                {isMarketIndividual ? <th>مجموعه</th> : null}
                <th>رسید</th>
                <th>الباقی حساب</th>
                {!isMarketIndividual ? <th>طلب</th> : null}
                {!isMarketIndividual ? <th>پور</th> : null}
                <th className="no-print ledger-actions-head">کړنې</th>
              </tr>
            </thead>
            <tbody>
              {ledger?.rows.map((row) => {
                const rowBalance = isMarketIndividual ? marketRowBalances.get(row.lineId) ?? "0" : row.balance;
                return (
                  <tr key={row.id}>
                    <td>{row.number}</td>
                    <td><JalaliDate date={row.date} /></td>
                    <td>{row.description || ""}</td>
                    {isMarketIndividual ? <td className="ledger-reference-cell">{row.sourceReference || "—"}</td> : null}
                    {isMarketIndividual ? <td className="ledger-reference-cell">{row.sourceCustomerBillNumber || "—"}</td> : null}
                    <td className="ledger-money-cell">{rowAmount(row.money, row.currencyCode, showRowCurrency)}</td>
                    {isMarketIndividual ? <td className="ledger-money-cell">{marketRowTotal(row, showRowCurrency)}</td> : null}
                    <td className="ledger-receipt-cell">{isMarketIndividual ? marketRowReceipt(row, showRowCurrency) : rowAmount(row.receipt, row.currencyCode, showRowCurrency)}</td>
                    <td className="ledger-balance-cell">
                      {showRowCurrency ? `${rowBalance} ${displayCurrency(row.currencyCode)}` : rowBalance}
                    </td>
                    {!isMarketIndividual ? <td className="ledger-receivable-cell">{formatBalancePart(rowBalance, row.currencyCode, showRowCurrency, "receivable")}</td> : null}
                    {!isMarketIndividual ? <td className="ledger-debt-cell">{formatBalancePart(rowBalance, row.currencyCode, showRowCurrency, "debt")}</td> : null}
                    {renderLedgerActions(row)}
                  </tr>
                );
              })}
              {!ledger?.rows.length ? <EmptyRow colSpan={isMarketIndividual ? 10 : 9} /> : null}
              {isMarketIndividual ? (
                <>
                  <tr className="ledger-summary-row ledger-money-summary-row"><td colSpan={5} className="ledger-summary-label ledger-total-label">ټوټل حساب</td><td></td><td className="ledger-total-money-cell">{marketTotals.total}</td><td className="ledger-total-receipt-cell">{totalReceipt}</td><td className="ledger-balance-total-cell">{balanceDisplay}</td><td className="no-print ledger-actions-cell"></td></tr>
                  <tr className="ledger-summary-row ledger-receipt-summary-row"><td colSpan={5} className="ledger-summary-label ledger-total-receipt-label">ټوټل رسیده ګی</td><td></td><td></td><td className="ledger-total-receipt-cell">{totalReceipt}</td><td></td><td className="no-print ledger-actions-cell"></td></tr>
                  <tr className="ledger-summary-row ledger-balance-summary-row"><td colSpan={5} className="ledger-summary-label ledger-balance-label">الباقی حساب</td><td></td><td></td><td></td><td className="ledger-balance-total-cell">{balanceDisplay}</td><td className="no-print ledger-actions-cell"></td></tr>
                </>
              ) : (
                <>
                  <tr className="ledger-summary-row ledger-money-summary-row"><td colSpan={3} className="ledger-summary-label ledger-total-label">ټوټل حساب</td><td className="ledger-total-money-cell">{totalMoney}</td><td className="ledger-total-receipt-cell">{totalReceipt}</td><td className="ledger-balance-total-cell">{balanceDisplay}</td><td className="ledger-total-receipt-cell">{receivableDisplay}</td><td className="ledger-balance-total-cell">{debtDisplay}</td><td className="no-print ledger-actions-cell"></td></tr>
                  <tr className="ledger-summary-row ledger-receipt-summary-row"><td colSpan={3} className="ledger-summary-label ledger-total-receipt-label">ټوټل رسیده ګی</td><td></td><td className="ledger-total-receipt-cell">{totalReceipt}</td><td></td><td></td><td></td><td className="no-print ledger-actions-cell"></td></tr>
                  <tr className="ledger-summary-row ledger-balance-summary-row"><td colSpan={3} className="ledger-summary-label ledger-balance-label">الباقی حساب</td><td></td><td></td><td className="ledger-balance-total-cell">{balanceDisplay}</td><td className="ledger-total-receipt-cell">{receivableDisplay}</td><td className="ledger-balance-total-cell">{debtDisplay}</td><td className="no-print ledger-actions-cell"></td></tr>
                </>
              )}
            </tbody>
          </table>
        )}
      </div>

      {isSupplier ? (
        <div className="card purchase-item-totals-card" style={{ padding: 0, overflow: "hidden", marginTop: 18 }}>
          <table className="fl-table purchase-item-totals-table" style={{ fontSize: 15 }}>
            <thead>
              <tr>
                <th colSpan={2}>د خرید سوی اجناس تعداد</th>
              </tr>
            </thead>
            <tbody>
              {ledger?.purchaseItemTotals.map((item) => (
                <tr key={item.itemName}>
                  <td className="purchase-item-name-cell">ټول {item.itemName}</td>
                  <td className="purchase-item-total-cell">{item.quantity}</td>
                </tr>
              ))}
              {!ledger?.purchaseItemTotals.length ? (
                <tr>
                  <td colSpan={2} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>په ټاکل شوې نېټه کې خرید شوي اجناس نشته.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {showLedgerForm && (
        <div className="modal-backdrop no-print" onClick={() => setShowLedgerForm(false)}>
          <div className="card modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <span>{ledgerForm.lineId ? "د کهاته ریکارډ تغییر" : "د پیسو رسید"}</span>
              <button className="btn btn-outline btn-sm" onClick={() => setShowLedgerForm(false)}><X size={14} /></button>
            </div>
            {ledgerError ? (
              <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                {ledgerError}
              </div>
            ) : null}
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="form-label">تاریخ</label>
                <ShamsiDateInput className="form-input" value={ledgerForm.date} onChange={(date) => setLedgerForm((form) => ({ ...form, date }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {ledgerForm.lineId ? (
                  <div>
                    <label className="form-label">د ریکارډ ډول</label>
                    <select className="form-input" value={ledgerForm.entryType} onChange={(event) => setLedgerForm((form) => ({ ...form, entryType: event.target.value as LedgerEntryType }))}>
                      <option value="money">پیسی / مجموعه</option>
                      <option value="receipt">رسید</option>
                    </select>
                  </div>
                ) : null}
                <div>
                  <label className="form-label">د ثبت ډول</label>
                  <select className="form-input" value={ledgerForm.receiptKind} onChange={(event) => setLedgerForm((form) => ({ ...form, receiptKind: event.target.value as LedgerReceiptKind }))}>
                    <option value="trade">تجري</option>
                    <option value="exchange">صراف</option>
                    <option value="bank">بانک</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">پیسې ډول</label>
                  <select className="form-input" value={ledgerForm.currencyCode} onChange={(event) => setLedgerForm((form) => ({ ...form, currencyCode: event.target.value }))}>
                    <option value="AFN">افغانی</option>
                    <option value="USD">ډالر</option>
                    <option value="PKR">کلداره</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">مبلغ</label>
                <input className="form-input" type="text" inputMode="decimal" value={ledgerForm.amount} onChange={(event) => setLedgerForm((form) => ({ ...form, amount: event.target.value }))} />
              </div>
              <div>
                <label className="form-label">تفصیل</label>
                <textarea className="form-input" value={ledgerForm.description} onChange={(event) => setLedgerForm((form) => ({ ...form, description: event.target.value }))} style={{ height: 82, padding: "12px 16px" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-primary" disabled={!canSaveLedger || saveLedgerMutation.isPending} onClick={() => saveLedgerMutation.mutate()}>
                <Save size={14} /> {ledgerForm.lineId ? "ساتل" : "ثبتول"}
              </button>
              <button className="btn btn-outline" onClick={() => setShowLedgerForm(false)}>لغوه</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
