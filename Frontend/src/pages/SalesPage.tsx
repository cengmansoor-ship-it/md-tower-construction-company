import { useEffect, useMemo, useRef, useState, type CSSProperties, type UIEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Eye, FileText, Plus, Printer, Trash2, Upload, X } from "lucide-react";
import { api, type CompanySettings, type Sale, type SaleDocument, type SaleReceipt, type SaleStatus, type Party, type UnitWithLocation, type Project, type BlockWithFloors } from "../lib/api";
import JalaliDate from "../components/JalaliDate";
import ShamsiDateInput from "../components/ShamsiDateInput";
import DateFilterButton from "../components/DateFilterButton";
import { currencyLabel, visibleText } from "../lib/labels";
import { isoToJalaliString } from "../lib/jalali";
import ViewModeToggle, { type ViewMode } from "../components/ViewModeToggle";
import PrintHeader from "../components/PrintHeader";
import { roomCountLabel, unitIsHouse } from "../lib/units";

const STATUS_LABELS: Record<SaleStatus, string> = {
  draft: "مسوده", reserved: "نیول شوی", active: "فروش شوی",
  fully_paid: "بشپړ تادیه شوی", cancelled: "لغوه شوی", reversed: "بېرته شوی",
};
const SALE_STATUS_FILTER_OPTIONS: Array<{ value: "" | SaleStatus; label: string }> = [
  { value: "", label: "ټول حالتونه" },
  { value: "draft", label: "مسوده" },
  { value: "reserved", label: "نیول شوی" },
  { value: "active", label: "فروش شوی" },
  { value: "fully_paid", label: "بشپړ تادیه شوی" },
  { value: "cancelled", label: "لغوه شوی" },
  { value: "reversed", label: "بېرته شوی" },
];
const UNIT_STATUS_LABELS: Record<string, string> = { draft: "مسوده", available: "خالي", reserved: "ساتل شوی", sold: "پلورل شوی", rented: "کرایه شوی", unavailable: "ناشتون" };
const SALE_CUSTOMER_TYPE = "sales_customer";
const SALE_UNIT_STATUSES = new Set(["draft", "available"]);
const SALE_UNIT_PURPOSES = new Set(["for_sale", "both"]);
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set(["image/jpeg", "image/png"]);

const searchResultListStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  marginTop: 6,
  padding: 8,
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--surface-2)",
};

const searchResultButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 38,
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--surface)",
  color: "var(--text)",
  cursor: "pointer",
  textAlign: "right",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function decimalToScaled(value: string | number | null | undefined): { amount: bigint; scale: number } {
  const clean = String(value ?? "0").trim() || "0";
  const negative = clean.startsWith("-");
  const unsigned = negative ? clean.slice(1) : clean;
  const [wholeRaw, fractionRaw = ""] = unsigned.split(".");
  const fraction = fractionRaw.replace(/[^0-9]/g, "");
  const digits = `${wholeRaw || "0"}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  return { amount: (negative ? -1n : 1n) * BigInt(digits), scale: fraction.length };
}

function addDecimal(a: string, b: string): string {
  const left = decimalToScaled(a);
  const right = decimalToScaled(b);
  const scale = Math.max(left.scale, right.scale);
  const value = left.amount * 10n ** BigInt(scale - left.scale) + right.amount * 10n ** BigInt(scale - right.scale);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  if (scale === 0) return `${negative ? "-" : ""}${absolute.toString()}`;
  const padded = absolute.toString().padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale) || "0";
  const fraction = padded.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function receivedTotal(sale: Sale): string {
  if (sale.ledgerReceived !== undefined && sale.ledgerReceived !== null) return sale.ledgerReceived;
  return (sale.receipts ?? []).filter((receipt) => !receipt.voidedAt).reduce((sum, receipt) => addDecimal(sum, receipt.amount), "0");
}

function saleBalanceTotal(sale: Sale): string {
  return sale.ledgerBalance ?? sale.balance ?? addDecimal(sale.finalPrice, `-${receivedTotal(sale)}`);
}

function saleText(value: string | null | undefined, fallback = "ثبت شوی"): string {
  return value?.trim() || fallback;
}

function unitOptionLabel(unit: UnitWithLocation): string {
  return `${saleText(unit.floor?.block?.name, "بلاک")} / ${saleText(unit.floor?.name, "منزل")} / ${unit.unitNumber} (${saleText(unit.unitType?.name, "ډول")})`;
}

function partyOptionLabel(party: Party): string {
  const details = [party.fatherName, party.phone1].filter(Boolean).join(" - ");
  return details ? `${party.name} (${details})` : party.name;
}

function fileSizeLabel(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function escapeHtml(value: string): string {
  const escaped: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (char) => escaped[char] ?? char);
}

function receiptText(value: string | number | null | undefined, fallback = "—"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function receiptMoney(value: string | null | undefined, currencyCode: string): string {
  return `${receiptText(value, "0")} ${currencyLabel(currencyCode)}`;
}

function absoluteAssetUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return null;
  }
}

function firstActiveReceipt(sale: Sale): SaleReceipt | null {
  return [...(sale.receipts ?? [])]
    .filter((receipt) => !receipt.voidedAt)
    .sort((left, right) => left.id - right.id)[0] ?? null;
}

function projectRoomCountLookup(blocks: BlockWithFloors[] | undefined): Map<number, number> {
  const lookup = new Map<number, number>();
  for (const block of blocks ?? []) {
    for (const floor of block.floors) {
      for (const unit of floor.units) {
        if (unit.roomCount) lookup.set(unit.id, unit.roomCount);
      }
    }
  }
  return lookup;
}

function saleWithRoomCountFallback(sale: Sale, roomCounts: Map<number, number>): Sale {
  const unitId = sale.unit?.id ?? sale.unitId;
  const roomCount = roomCounts.get(unitId);
  if (!sale.unit || sale.unit.roomCount || !roomCount) return sale;
  return { ...sale, unit: { ...sale.unit, roomCount } };
}

function floorAllowsSale(unit: UnitWithLocation): boolean {
  return unit.floor?.purpose !== "for_rent";
}

function validateDocumentFiles(files: File[]): string | null {
  if (!files.length) return "مهرباني وکړئ لږ تر لږه یو عکس وټاکئ";
  for (const file of files) {
    if (!ALLOWED_DOCUMENT_TYPES.has(file.type)) return "یوازې JPG او PNG عکسونه منل کېږي";
    if (file.size > MAX_DOCUMENT_BYTES) return "د هر عکس سایز باید تر ۵MB زیات نه وي";
  }
  return null;
}

interface NewSaleForm {
  unitId: number | null;
  partyId: number | null;
  price: string;
  discount: string;
  currencyCode: string;
  saleDate: string;
  paymentType: string;
  contractNumber: string;
  notes: string;
  status: "draft" | "reserved" | "active";
  firstReceivedAmount: string;
}

function emptyForm(): NewSaleForm {
  return {
    unitId: null, partyId: null, price: "", discount: "0", currencyCode: "AFN",
    saleDate: today(), paymentType: "cash",
    contractNumber: "", notes: "", status: "active", firstReceivedAmount: "",
  };
}

export default function SalesPage() {
  const qc = useQueryClient();
  const salesTopScrollRef = useRef<HTMLDivElement>(null);
  const salesBodyScrollRef = useRef<HTMLDivElement>(null);
  const salesTableRef = useRef<HTMLTableElement>(null);
  const [searchParams] = useSearchParams();
  const unitTypeFilter = searchParams.get("unitType") ?? "";
  const initialProjectId = searchParams.get("projectId") ?? "";
  const customerTypeFilter = searchParams.get("customerType") ?? "";
  const isSalesDetailView = searchParams.get("salesDetail") === "1";
  const showAllDates = isSalesDetailView || searchParams.get("allDates") === "1";
  const shouldOpenForm = searchParams.get("openForm") === "1";
  const urlSearch = searchParams.get("q") ?? "";
  const isShopView = unitTypeFilter === "shop";
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [startDate, setStartDate] = useState(showAllDates ? "" : firstOfMonth());
  const [endDate, setEndDate] = useState(showAllDates ? "" : today());
  const [q, setQ] = useState(urlSearch);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewSaleForm>(emptyForm());
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [selectedFloorId, setSelectedFloorId] = useState("");
  const [unitQuery, setUnitQuery] = useState("");
  const [partyQuery, setPartyQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [salesScrollWidth, setSalesScrollWidth] = useState(1320);
  const [viewDocumentsSale, setViewDocumentsSale] = useState<Sale | null>(null);
  const [uploadDocumentsSale, setUploadDocumentsSale] = useState<Sale | null>(null);
  const [editDocument, setEditDocument] = useState<SaleDocument | null>(null);
  const [selectedDocumentFiles, setSelectedDocumentFiles] = useState<File[]>([]);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  useEffect(() => {
    setQ(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    setSelectedProjectId(initialProjectId);
  }, [initialProjectId]);

  useEffect(() => {
    if (shouldOpenForm) setShowForm(true);
  }, [shouldOpenForm]);

  useEffect(() => {
    setStartDate(showAllDates ? "" : firstOfMonth());
    setEndDate(showAllDates ? "" : today());
  }, [showAllDates]);

  const { data: sales, refetch: refetchSales } = useQuery({
    queryKey: ["sales", statusFilter, unitTypeFilter, initialProjectId, customerTypeFilter, startDate, endDate, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (unitTypeFilter) params.set("unitType", unitTypeFilter);
      if (initialProjectId) params.set("projectId", initialProjectId);
      if (customerTypeFilter) params.set("customerType", customerTypeFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (q) params.set("q", q);
      const query = params.toString();
      return api.get<Sale[]>(`/sales${query ? `?${query}` : ""}`);
    },
  });

  const salesProjectId = Number(initialProjectId);
  const { data: salesProjectMap } = useQuery({
    queryKey: ["unit-map", salesProjectId],
    queryFn: () => api.get<BlockWithFloors[]>(`/projects/${salesProjectId}/unit-map`),
    enabled: Boolean(initialProjectId) && Number.isFinite(salesProjectId),
  });

  const salesRoomCounts = useMemo(() => projectRoomCountLookup(salesProjectMap), [salesProjectMap]);
  const displaySales = useMemo(() => {
    if (!sales?.length || !salesRoomCounts.size) return sales;
    return sales.map((sale) => saleWithRoomCountFallback(sale, salesRoomCounts));
  }, [sales, salesRoomCounts]);

  useEffect(() => {
    const updateScrollWidth = () => {
      const bodyWidth = salesBodyScrollRef.current?.scrollWidth ?? 0;
      const tableWidth = salesTableRef.current?.scrollWidth ?? 0;
      setSalesScrollWidth(Math.max(1320, bodyWidth, tableWidth));
    };
    updateScrollWidth();
    const observer = new ResizeObserver(updateScrollWidth);
    if (salesBodyScrollRef.current) observer.observe(salesBodyScrollRef.current);
    if (salesTableRef.current) observer.observe(salesTableRef.current);
    window.addEventListener("resize", updateScrollWidth);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScrollWidth);
    };
  }, [displaySales, viewMode]);

  const { data: unitCandidates } = useQuery({
    queryKey: ["units-sale-candidates", unitQuery, unitTypeFilter, selectedProjectId, selectedBlockId, selectedFloorId],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("availability", "sale");
      if (unitTypeFilter) params.set("unitType", unitTypeFilter);
      if (selectedProjectId) params.set("projectId", selectedProjectId);
      if (selectedBlockId) params.set("blockId", selectedBlockId);
      if (selectedFloorId) params.set("floorId", selectedFloorId);
      if (unitQuery) params.set("q", unitQuery);
      return api.get<UnitWithLocation[]>(`/units?${params.toString()}`);
    },
    enabled: showForm,
  });

  const { data: projects } = useQuery({
    queryKey: ["projects-for-sale-form"],
    queryFn: () => api.get<Project[]>("/projects"),
    enabled: showForm,
  });

  const { data: selectedProjectMap } = useQuery({
    queryKey: ["unit-map", Number(selectedProjectId)],
    queryFn: () => api.get<BlockWithFloors[]>(`/projects/${selectedProjectId}/unit-map`),
    enabled: showForm && Boolean(selectedProjectId),
  });

  const { data: parties } = useQuery({
    queryKey: ["parties-search", partyQuery, SALE_CUSTOMER_TYPE],
    queryFn: () => {
      const params = new URLSearchParams();
      if (partyQuery) params.set("q", partyQuery);
      params.set("type", SALE_CUSTOMER_TYPE);
      const query = params.toString();
      return api.get<Party[]>(`/parties${query ? `?${query}` : ""}`);
    },
    enabled: showForm,
  });

  const activeDocumentsSale = viewDocumentsSale ?? uploadDocumentsSale;
  const { data: saleDocuments } = useQuery({
    queryKey: ["sale-documents", activeDocumentsSale?.id],
    queryFn: () => api.get<SaleDocument[]>(`/sales/${activeDocumentsSale!.id}/documents`),
    enabled: Boolean(activeDocumentsSale),
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<CompanySettings>("/settings"),
  });
  const createMutation = useMutation({
    mutationFn: () =>
      api.post<Sale>("/sales", {
        unitId: form.unitId,
        partyId: form.partyId,
        price: form.price,
        discount: form.discount,
        currencyCode: form.currencyCode,
        saleDate: form.saleDate,
        paymentType: form.paymentType || null,
        contractNumber: form.contractNumber || null,
        notes: form.notes || null,
        status: form.status,
        firstReceivedAmount: form.firstReceivedAmount ? form.firstReceivedAmount : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["unit-map"] });
      qc.invalidateQueries({ queryKey: ["units-sale-candidates"] });
      setShowForm(false);
      setForm(emptyForm());
      setError(null);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "ناکامي"),
  });

  const uploadDocumentsMutation = useMutation({
    mutationFn: async (files: File[]) => {
      if (!uploadDocumentsSale) throw new Error("فروش ونه ټاکل شو");
      const validationError = validateDocumentFiles(files);
      if (validationError) throw new Error(validationError);
      const uploaded: SaleDocument[] = [];
      for (const file of files) {
        uploaded.push(await api.uploadFile<SaleDocument>(`/sales/${uploadDocumentsSale.id}/documents`, file));
      }
      return uploaded;
    },
    onSuccess: () => {
      if (uploadDocumentsSale) qc.invalidateQueries({ queryKey: ["sale-documents", uploadDocumentsSale.id] });
      setSelectedDocumentFiles([]);
      setDocumentsError(null);
    },
    onError: (err) => setDocumentsError(err instanceof Error ? err.message : "د اسنادو ثبت ناکام شو"),
  });

  const updateDocumentMutation = useMutation({
    mutationFn: async ({ document, file }: { document: SaleDocument; file: File }) => {
      const validationError = validateDocumentFiles([file]);
      if (validationError) throw new Error(validationError);
      return api.uploadFile<SaleDocument>(`/sales/${document.saleId}/documents/${document.id}`, file, "PUT");
    },
    onSuccess: (document) => {
      qc.invalidateQueries({ queryKey: ["sale-documents", document.saleId] });
      setEditDocument(null);
      setSelectedDocumentFiles([]);
      setDocumentsError(null);
    },
    onError: (err) => setDocumentsError(err instanceof Error ? err.message : "د سند ایډیټ ناکام شو"),
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async ({ document, reason }: { document: SaleDocument; reason: string }) => {
      await api.delete<void>(`/sales/${document.saleId}/documents/${document.id}?reason=${encodeURIComponent(reason)}`);
      return document.saleId;
    },
    onSuccess: (saleId) => {
      qc.invalidateQueries({ queryKey: ["sale-documents", saleId] });
      setEditDocument(null);
      setSelectedDocumentFiles([]);
      setDocumentsError(null);
    },
    onError: (err) => setDocumentsError(err instanceof Error ? err.message : "د سند حذف ناکام شو"),
  });

  const saleableUnits = useMemo(
    () => (unitCandidates ?? []).filter((unit) => SALE_UNIT_STATUSES.has(unit.status) && SALE_UNIT_PURPOSES.has(unit.purpose) && floorAllowsSale(unit)),
    [unitCandidates],
  );
  const selectedUnit = useMemo(() => saleableUnits.find((u) => u.id === form.unitId), [saleableUnits, form.unitId]);
  const unitSearchResults = unitQuery.trim() ? saleableUnits.slice(0, 8) : [];
  const partySearchResults = partyQuery.trim() ? (parties ?? []).slice(0, 8) : [];
  const selectedBlocks = selectedProjectMap ?? [];
  const selectedFloors = selectedBlocks.find((block) => String(block.id) === selectedBlockId)?.floors ?? [];
  const pageTitle = isSalesDetailView ? "فروش تفصیل" : isShopView ? "د دوکانونو فروش" : "پلورنې";
  const pageSubtitle = isSalesDetailView
    ? "د فروش مشتریانو د پروژې پلورنې، تادیات او پاتې حسابونه"
    : isShopView
    ? "د دوکانونو فروش، تادیات او د مشتريانو حسابونه"
    : "د ملکیتونو پلورنه، تادیات او د فروش مشتريانو حسابونه";

  function syncSalesTableScroll(event: UIEvent<HTMLDivElement>, targetRef: { current: HTMLDivElement | null }) {
    const target = targetRef.current;
    if (!target || target.scrollLeft === event.currentTarget.scrollLeft) return;
    target.scrollLeft = event.currentTarget.scrollLeft;
  }

  function openViewDocuments(sale: Sale) {
    setViewDocumentsSale(sale);
    setUploadDocumentsSale(null);
    setEditDocument(null);
    setSelectedDocumentFiles([]);
    setDocumentsError(null);
  }

  function openUploadDocuments(sale: Sale) {
    setUploadDocumentsSale(sale);
    setViewDocumentsSale(null);
    setEditDocument(null);
    setSelectedDocumentFiles([]);
    setDocumentsError(null);
  }

  function closeDocumentsModal() {
    setViewDocumentsSale(null);
    setUploadDocumentsSale(null);
    setEditDocument(null);
    setSelectedDocumentFiles([]);
    setDocumentsError(null);
  }

  function startEditDocument(document: SaleDocument) {
    setEditDocument(document);
    setSelectedDocumentFiles([]);
    setDocumentsError(null);
  }

  function deleteDocument(document: SaleDocument) {
    const reason = window.prompt("د حذف دلیل ولیکئ:");
    if (!reason?.trim()) return;
    deleteDocumentMutation.mutate({ document, reason: reason.trim() });
  }

  function printDocument(document: SaleDocument) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setDocumentsError("د چاپ کړکۍ خلاصه نه شوه");
      return;
    }
    const imageUrl = new URL(document.fileUrl, window.location.origin).toString();
    const title = escapeHtml(document.fileName);
    printWindow.document.write(`<!doctype html>
<html dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    html, body { margin: 0; min-height: 100%; }
    body { display: flex; align-items: center; justify-content: center; background: #fff; }
    img { max-width: 100%; max-height: 100vh; object-fit: contain; }
  </style>
</head>
<body>
  <img src="${escapeHtml(imageUrl)}" alt="${title}" onload="window.focus(); window.print();" />
</body>
</html>`);
    printWindow.document.close();
  }

  function printSaleReceipt(sale: Sale) {
    const receipt = firstActiveReceipt(sale);
    const receivedAmount = receipt?.amount ?? receivedTotal(sale);
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      window.alert("د رسید چاپ کړکۍ خلاصه نه شوه");
      return;
    }

    const receiptTitle = `رسید سند - ${receiptText(sale.party?.name)}`;
    const blockName = receiptText(sale.unit?.floor?.block?.code ?? sale.unit?.floor?.block?.name);
    const floorName = receiptText(sale.unit?.floor?.name);
    const unitNumber = receiptText(sale.unit?.unitNumber);
    const balanceAfterReceipt = receipt?.newBalance ?? sale.balance ?? addDecimal(sale.finalPrice, `-${receivedAmount}`);
    const priceText = receiptMoney(sale.finalPrice, sale.currencyCode);
    const receivedText = receiptText(receivedAmount, "0");
    const balanceText = receiptText(balanceAfterReceipt, "0");
    const logoUrl = absoluteAssetUrl(settings?.logoUrl);
    const companyName = receiptText(settings?.companyName, "عربین ډي استوګنځای");

    printWindow.document.write(`<!doctype html>
<html dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(receiptTitle)}</title>
  <style>
    @page { size: A5 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #fff; }
    body {
      color: #000;
      direction: rtl;
      font-family: Tahoma, "Segoe UI", Arial, sans-serif;
      padding: 6mm 0;
    }
    .receipt-page {
      width: 184mm;
      min-height: 132mm;
      margin: 0 auto;
      background: #fff;
      border: 1.5px solid #111;
      padding: 12px 18px 14px;
      font-size: 13px;
      font-weight: 700;
      line-height: 2.25;
      position: relative;
    }
    .receipt-brand {
      display: grid;
      grid-template-columns: 88px 1fr 88px;
      align-items: center;
      gap: 12px;
      padding-bottom: 9px;
      margin-bottom: 12px;
      border-bottom: 1px solid #111;
    }
    .logo-box {
      width: 76px;
      height: 76px;
      display: flex;
      align-items: center;
      justify-content: center;
      justify-self: center;
      overflow: hidden;
      font-size: 10px;
      line-height: 1.2;
      text-align: center;
      border: 1px solid #d8d8d8;
      border-radius: 999px;
      background: #fff;
    }
    .logo-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 999px;
    }
    .company-name {
      text-align: center;
      font-size: 22px;
      font-weight: 950;
      line-height: 1.35;
    }
    .receipt-heading {
      text-align: center;
      font-size: 15px;
      font-weight: 900;
      margin-top: 2px;
    }
    .line {
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 4px;
      white-space: nowrap;
    }
    .pair {
      display: inline-flex;
      align-items: baseline;
      min-width: 0;
    }
    .label { white-space: nowrap; }
    .value { margin-right: 4px; }
    .dots {
      display: inline-block;
      min-width: 98px;
      border-bottom: 1px dotted #111;
      transform: translateY(-3px);
      margin: 0 4px;
    }
    .dots.short { min-width: 44px; }
    .amounts {
      margin-top: 6px;
      text-align: center;
      white-space: nowrap;
    }
    .signature {
      margin-top: 34px;
      text-align: right;
      padding-right: 22px;
      font-weight: 700;
    }
    .note {
      position: absolute;
      right: 18px;
      left: 18px;
      bottom: 12px;
      text-align: center;
      white-space: nowrap;
      font-weight: 700;
    }
    @media print {
      body { padding: 0; }
      .receipt-page { margin: 0 auto; box-shadow: none; }
    }
  </style>
</head>
<body>
  <main class="receipt-page">
    <div class="receipt-brand">
      <div class="logo-box">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="لوګو" />` : "ARABIAN<br />D"}</div>
      <div>
        <div class="company-name">${escapeHtml(companyName)}</div>
        <div class="receipt-heading">رسید سند</div>
      </div>
      <div></div>
    </div>
    <div class="line">
      <span class="pair"><span class="label">نوم :</span><span class="value">${escapeHtml(receiptText(sale.party?.name))}</span></span>
      <span class="dots"></span>
      <span class="pair"><span class="label">بلاک نمبر</span><span class="value">${escapeHtml(blockName)}</span></span>
    </div>
    <div class="line">
      <span class="pair"><span class="label">پلار نوم :</span><span class="value">${escapeHtml(receiptText(sale.party?.fatherName))}</span></span>
      <span class="dots"></span>
      <span class="pair"><span class="label">منزل</span><span class="value">${escapeHtml(floorName)}</span></span>
    </div>
    <div class="line">
      <span class="pair"><span class="label">نیکه نوم :</span><span class="value">${escapeHtml(receiptText(sale.party?.grandfatherName))}</span></span>
      <span class="dots"></span>
      <span class="pair"><span class="label">کور نمبر</span><span class="value">${escapeHtml(unitNumber)}</span></span>
    </div>
    <div class="amounts">
      <span>اصلي قیمت ${escapeHtml(priceText)}</span>
      <span> ..... وصول ${escapeHtml(receivedText)}</span>
      <span> ..... الباقي ${escapeHtml(balanceText)}</span>
    </div>
    <div class="signature">امضاء او ټاپه</div>
    <div class="note">نوټ : نوموړي رسید پاڼه د امضاء او ټاپې نه درلودو په صورت کي صحت نلري</div>
  </main>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 250);
    });
  </script>
</body>
</html>`);
    printWindow.document.close();
  }

  function printDesignedSaleReceipt(sale: Sale) {
    const receipt = firstActiveReceipt(sale);
    const receivedAmount = receivedTotal(sale);
    const balanceAfterReceipt = saleBalanceTotal(sale);
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      window.alert("د رسید چاپ کړکۍ خلاصه نه شوه");
      return;
    }

    const receiptDate = receipt?.receiptDate ?? sale.saleDate;
    const receiptDateText = isoToJalaliString(receiptDate);
    const receiptNumber = receiptText(receipt?.receiptNumber ?? sale.saleNumber ?? sale.id);
    const companyName = receiptText(settings?.companyName, "عربین ډي ودانیز شرکت");
    const logoUrl = absoluteAssetUrl(settings?.logoUrl);
    const blockName = receiptText(sale.unit?.floor?.block?.code ?? sale.unit?.floor?.block?.name);
    const floorName = receiptText(sale.unit?.floor?.name);
    const unitNumber = receiptText(sale.unit?.unitNumber);
    const roomCountRow = unitIsHouse(sale.unit)
      ? `<div class="wide-field"><span class="label">د اطاقونو تعداد:</span><span class="value-line">${escapeHtml(roomCountLabel(sale.unit))}</span></div>`
      : "";
    const customerName = receiptText(sale.party?.name);
    const fatherName = receiptText(sale.party?.fatherName);
    const grandfatherName = receiptText(sale.party?.grandfatherName);
    const priceText = receiptMoney(sale.finalPrice, sale.currencyCode);
    const receivedText = receiptMoney(receivedAmount, sale.currencyCode);
    const balanceText = receiptMoney(balanceAfterReceipt, sale.currencyCode);
    const contactItems = [
      settings?.address ? `آدرس: ${settings.address}` : null,
      settings?.phone ? `شمېره: ${settings.phone}` : null,
      settings?.whatsapp ? `واټساپ: ${settings.whatsapp}` : null,
      settings?.email ? `ایمیل: ${settings.email}` : null,
      settings?.website ? `وېبپاڼه: ${settings.website}` : null,
    ].filter((item): item is string => Boolean(item));
    const contactLine = contactItems.length ? contactItems.join("   |   ") : " ";
    const receiptTitle = `رسید سند - ${customerName}`;

    printWindow.document.write(`<!doctype html>
<html dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(receiptTitle)}</title>
  <style>
    @page { size: A5 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #fff; }
    body {
      color: #111;
      direction: rtl;
      font-family: "Bahij Zar", "Noto Naskh Arabic", "Segoe UI", system-ui, sans-serif;
      font-size: 0;
      line-height: 0;
      padding: 6mm 0;
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }
    .receipt-shell {
      width: 186mm;
      min-height: 132mm;
      border: 2px solid #111;
      position: relative;
      overflow: hidden;
      background: #fff;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
      margin-left: auto;
      margin-right: auto;
      font-size: 13px;
      line-height: 1.45;
    }
    .top-band {
      height: 34mm;
      background: linear-gradient(135deg, #06275a 0%, #07356f 58%, #0b73d9 59%, #0b73d9 100%);
      position: relative;
      overflow: hidden;
    }
    .top-band::after {
      content: "";
      position: absolute;
      left: -18mm;
      right: -18mm;
      bottom: -26mm;
      height: 44mm;
      background: #fff;
      border-top: 3mm solid #f4c430;
      border-radius: 0 0 50% 50%;
      transform: rotate(-3deg);
    }
    .brand {
      position: relative;
      z-index: 1;
      margin-top: -24mm;
      padding: 0 18mm 0;
      text-align: center;
    }
    .logo-wrap {
      width: 24mm;
      height: 24mm;
      margin: 0 auto 3mm;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff;
      border: 1px solid #d9e2ef;
      border-radius: 999px;
      overflow: hidden;
      color: #07356f;
      font-size: 9px;
      font-weight: 900;
      line-height: 1.25;
    }
    .logo-wrap img { width: 100%; height: 100%; object-fit: cover; border-radius: 999px; }
    .company-name {
      color: #000;
      font-size: 27px;
      font-weight: 950;
      line-height: 1.2;
      letter-spacing: 0;
    }
    .subline {
      margin: 2mm auto 0;
      width: 96mm;
      border-bottom: 1.2mm solid #d7a916;
    }
    .title-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 58mm;
      margin-top: 7mm;
      padding: 3mm 8mm;
      border-radius: 3px;
      background: #082f63;
      color: #fff;
      font-size: 15px;
      font-weight: 950;
      border: 1px solid #06275a;
    }
    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 70mm;
      height: 70mm;
      transform: translate(-50%, -50%);
      opacity: 0.055;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      color: #07356f;
      font-size: 18px;
      font-weight: 950;
      text-align: center;
    }
    .watermark img { width: 100%; height: 100%; object-fit: contain; }
    .fields {
      position: relative;
      z-index: 1;
      padding: 8mm 15mm 31mm;
      font-size: 13px;
      font-weight: 700;
    }
    .meta-row,
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5mm;
      margin-bottom: 4mm;
    }
    .field,
    .wide-field {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 2mm;
      align-items: end;
      min-height: 8mm;
    }
    .wide-field { margin-bottom: 4mm; }
    .print-actions {
      position: fixed;
      top: 8mm;
      left: 8mm;
      display: flex;
      gap: 6px;
      z-index: 10;
      direction: rtl;
    }
    .print-actions button {
      border: 1px solid #082f63;
      border-radius: 4px;
      background: #082f63;
      color: #fff;
      padding: 7px 14px;
      font-size: 14px;
      font-weight: 850;
      cursor: pointer;
    }
    .label {
      white-space: nowrap;
      color: #333;
      font-weight: 850;
    }
    .value-line {
      min-height: 7mm;
      border-bottom: 1px solid #777;
      padding: 0 2mm 1mm;
      text-align: right;
      color: #000;
    }
    .detail-field { align-items: start; }
    textarea.detail-entry {
      width: 100%;
      min-height: 9mm;
      border: 0;
      border-bottom: 1px solid #777;
      background: transparent;
      resize: none;
      font: inherit;
      font-weight: 700;
      line-height: 1.8;
      direction: rtl;
      text-align: right;
      color: #000;
      overflow: hidden;
      outline: 1px dashed transparent;
    }
    textarea.detail-entry::placeholder {
      color: #9ca3af;
      font-weight: 500;
    }
    textarea.detail-entry:focus { outline-color: #94a3b8; }
    body grammarly-desktop-integration,
    body [data-grammarly-part],
    body [class*="grammarly" i],
    body [id*="grammarly" i],
    body [class*="languagetool" i],
    body [id*="languagetool" i],
    body [class*="writing" i][class*="suggest" i],
    body [id*="writing" i][id*="suggest" i] {
      display: none !important;
      visibility: hidden !important;
    }
    .amount-line {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 4mm;
      margin: 3mm 0 5mm;
    }
    .amount-box {
      border: 1px solid #cfd8e3;
      border-radius: 4px;
      padding: 2mm 3mm;
      background: rgba(248, 250, 252, 0.92);
    }
    .amount-box strong {
      display: block;
      margin-top: 1mm;
      font-size: 14px;
    }
    .signature-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12mm;
      margin-top: 9mm;
      align-items: end;
    }
    .signature-line {
      border-bottom: 1px solid #222;
      min-height: 9mm;
      padding-bottom: 1mm;
    }
    .note {
      position: absolute;
      right: 12mm;
      left: 12mm;
      bottom: 20mm;
      text-align: center;
      font-size: 12px;
      font-weight: 850;
    }
    .footer-bar {
      position: absolute;
      right: 0;
      left: 0;
      bottom: 0;
      min-height: 8mm;
      background: #f5cf45;
      color: #082f63;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5mm 6mm;
      font-size: 11px;
      font-weight: 800;
      text-align: center;
      line-height: 1.7;
    }
    @media print {
      body {
        width: 100%;
        padding: 0;
        display: grid;
        justify-items: center;
        align-items: start;
      }
      body > :not(.receipt-shell) { display: none !important; }
      .receipt-shell {
        margin-left: auto;
        margin-right: auto;
        box-shadow: none;
      }
      .print-actions { display: none !important; }
      textarea.detail-entry::placeholder { color: transparent; }
    }
  </style>
</head>
<body>
  <div class="print-actions"><button type="button" onclick="window.print()">چاپ</button></div>
  <main class="receipt-shell">
    <div class="top-band"></div>
    <section class="brand">
      <div class="logo-wrap">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="لوګو" />` : "ARABIAN<br />D"}</div>
      <div class="company-name">${escapeHtml(companyName)}</div>
      <div class="subline"></div>
      <div class="title-pill">رسید سند</div>
    </section>
    <div class="watermark">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="" />` : escapeHtml(companyName)}</div>
    <section class="fields">
      <div class="meta-row">
        <div class="field"><span class="label">رسید نمبر:</span><span class="value-line">${escapeHtml(receiptNumber)}</span></div>
        <div class="field"><span class="label">تاریخ:</span><span class="value-line">${escapeHtml(receiptDateText)}</span></div>
      </div>
      <div class="wide-field"><span class="label">ترلاسه شو له:</span><span class="value-line">${escapeHtml(customerName)}</span></div>
      <div class="two-col">
        <div class="field"><span class="label">پلار نوم:</span><span class="value-line">${escapeHtml(fatherName)}</span></div>
        <div class="field"><span class="label">نیکه نوم:</span><span class="value-line">${escapeHtml(grandfatherName)}</span></div>
      </div>
      <div class="two-col">
        <div class="field"><span class="label">د کور/ملکیت نوم:</span><span class="value-line">${escapeHtml(blockName)} / ${escapeHtml(floorName)}</span></div>
        <div class="field"><span class="label">کور نمبر:</span><span class="value-line">${escapeHtml(unitNumber)}</span></div>
      </div>
      ${roomCountRow}
      <div class="amount-line">
        <div class="amount-box"><span>اصلي قیمت</span><strong>${escapeHtml(priceText)}</strong></div>
        <div class="amount-box"><span>تحویل شوې اندازه</span><strong>${escapeHtml(receivedText)}</strong></div>
        <div class="amount-box"><span>پاتې حساب</span><strong>${escapeHtml(balanceText)}</strong></div>
      </div>
      <div class="wide-field detail-field"><span class="label">په حروف/تفصیل:</span><textarea class="value-line detail-entry" rows="1" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" placeholder="دلته یې په حروفو/تفصیل ولیکئ"></textarea></div>
      <div class="signature-row">
        <div class="signature-line">اخیستونکی:</div>
        <div class="signature-line">امضاء او ټاپه:</div>
      </div>
    </section>
    <div class="note">نوټ: نوموړی رسید پاڼه د امضاء او ټاپې نه درلودو په صورت کې صحت نه لري</div>
    <footer class="footer-bar">${escapeHtml(contactLine)}</footer>
  </main>
  <script>
    function cleanWritingHelpers() {
      var blockedText = [
        "To approve a single suggestion",
        "Click here to accept all suggestions in the sentence"
      ];
      var hasBlockedText = function (text) {
        return blockedText.some(function (item) { return String(text || "").indexOf(item) !== -1; });
      };
      var protectedSelector = ".receipt-shell, .top-band, .brand, .watermark, .fields, .field, .wide-field, .value-line, .detail-entry, .amount-line, .amount-box, .signature-row, .signature-line, .note, .footer-bar";
      Array.prototype.slice.call(document.querySelectorAll("body grammarly-desktop-integration, body [data-grammarly-part], body [class*='grammarly' i], body [id*='grammarly' i], body [class*='languagetool' i], body [id*='languagetool' i], body [class*='writing' i][class*='suggest' i], body [id*='writing' i][id*='suggest' i]")).forEach(function (node) {
        node.remove();
      });
      Array.prototype.slice.call(document.body.querySelectorAll("*")).reverse().forEach(function (node) {
        if (!(node instanceof HTMLElement) || node.matches(protectedSelector)) return;
        var text = node.textContent || "";
        if (hasBlockedText(text)) node.remove();
      });
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      var textNodes = [];
      while (walker.nextNode()) {
        if (hasBlockedText(walker.currentNode.nodeValue)) textNodes.push(walker.currentNode);
      }
      textNodes.forEach(function (node) { node.nodeValue = ""; });
    }
    function setupDetailEntry() {
      var detail = document.querySelector(".detail-entry");
      if (!detail) return;
      var resize = function () {
        detail.style.height = "auto";
        detail.style.height = Math.max(detail.scrollHeight, detail.offsetHeight) + "px";
      };
      detail.addEventListener("input", resize);
      detail.focus();
      resize();
    }
    window.addEventListener("beforeprint", cleanWritingHelpers);
    window.addEventListener("load", function () {
      window.focus();
      setupDetailEntry();
      setTimeout(cleanWritingHelpers, 150);
      setTimeout(cleanWritingHelpers, 500);
      setTimeout(cleanWritingHelpers, 1000);
      if (window.MutationObserver) {
        new MutationObserver(cleanWritingHelpers).observe(document.body, { childList: true, subtree: true, characterData: true });
      }
    });
  </script>
</body>
</html>`);
    printWindow.document.close();
  }

  return (
    <div className="print-report-page print-wide">
      <PrintHeader title={`${pageTitle} راپور`} />
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <p className="page-title" style={{ margin: 0 }}>{pageTitle}</p>
          <p className="page-sub">{pageSubtitle}</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <button className="btn btn-outline" onClick={() => window.print()}>
            <Printer size={16} /> چاپ
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> {isShopView ? "نوې د دوکان فروش" : isSalesDetailView ? "نوې فروش" : "نوې پلورنه"}
          </button>
        </div>
      </div>

      <div className="card no-print" style={{ padding: 16, margin: "16px 0", display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <label className="form-label">حالت</label>
          <select className="form-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {SALE_STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">شروع تاریخ</label>
          <ShamsiDateInput className="form-input" value={startDate} onChange={setStartDate} style={{ width: 150 }} />
        </div>
        <div>
          <label className="form-label">ختم تاریخ</label>
          <ShamsiDateInput className="form-input" value={endDate} onChange={setEndDate} style={{ width: 150 }} />
        </div>
        <DateFilterButton onClick={() => void refetchSales()} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <label className="form-label filter-search-label">لټون</label>
          <input className="form-input" value={q} onChange={(event) => setQ(event.target.value)} placeholder="مشتری، کور نمبر، بلاک یا سند..." />
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="list-grid">
          {displaySales?.map((sale) => (
            <Link key={sale.id} to={`/sales/${sale.id}`} className="list-card" style={{ color: "inherit", textDecoration: "none" }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>{sale.party?.name ?? "—"}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
                {visibleText(sale.unit?.floor?.block?.name, "بلاک")} / {visibleText(sale.unit?.floor?.name, "منزل")} / {sale.unit?.unitNumber ?? "—"}
              </div>
              <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                <span>قیمت: {sale.finalPrice} {currencyLabel(sale.currencyCode)}</span>
                <span>وصول: {receivedTotal(sale)} {currencyLabel(sale.currencyCode)}</span>
                <span>الباقی: {saleBalanceTotal(sale)} {currencyLabel(sale.currencyCode)}</span>
                <span>تاریخ: <JalaliDate date={sale.saleDate} /></span>
              </div>
            </Link>
          ))}
          {!displaySales?.length && <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>تر اوسه هېڅ فروش نشته.</div>}
        </div>
      ) : (
      <>
      <div
        className="sales-table-top-scroll no-print"
        ref={salesTopScrollRef}
        onScroll={(event) => syncSalesTableScroll(event, salesBodyScrollRef)}
      >
        <div style={{ width: salesScrollWidth, height: 1 }} />
      </div>
      <div
        className="card elevated-card print-report-surface"
        ref={salesBodyScrollRef}
        onScroll={(event) => syncSalesTableScroll(event, salesTopScrollRef)}
        style={{ padding: 0, overflow: "auto" }}
      >
        <table ref={salesTableRef} className="fl-table" style={{ minWidth: 1320, fontSize: 13 }}>
          <thead>
            <tr>
              <th>نوم</th>
              <th>پلار نوم</th>
              <th>نیکه نوم</th>
              <th>تذکره نمبر</th>
              <th>تماس شمیره</th>
              <th>خرڅ تاریخ</th>
              <th>بلاک آډي</th>
              <th>منزل</th>
              <th>کور نمبر</th>
              <th>اطاقونو تعداد</th>
              <th>اصلی قیمت</th>
              <th>وصول</th>
              <th>الباقی</th>
              <th className="no-print">اسنادونه</th>
            </tr>
          </thead>
          <tbody>
            {displaySales?.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link to={`/sales/${s.id}`} style={{ color: "var(--primary)", fontWeight: 800, textDecoration: "none" }}>
                    {s.party?.name ?? "—"}
                  </Link>
                </td>
                <td>{s.party?.fatherName ?? "—"}</td>
                <td>{s.party?.grandfatherName ?? "—"}</td>
                <td>{s.party?.tazkiraNumber ?? "—"}</td>
                <td>{s.party?.phone1 ?? "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}><JalaliDate date={s.saleDate} /></td>
                <td>{visibleText(s.unit?.floor?.block?.code ?? s.unit?.floor?.block?.name, "بلاک")}</td>
                <td>{visibleText(s.unit?.floor?.name, "منزل")}</td>
                <td>{s.unit?.unitNumber ?? "—"}</td>
                <td>{roomCountLabel(s.unit)}</td>
                <td>{s.finalPrice} {currencyLabel(s.currencyCode)}</td>
                <td style={{ color: "var(--success)", fontWeight: 800 }}>{receivedTotal(s)} {currencyLabel(s.currencyCode)}</td>
                <td style={{ color: Number(saleBalanceTotal(s)) > 0 ? "var(--danger)" : "var(--success)", fontWeight: 800 }}>
                  {saleBalanceTotal(s)} {currencyLabel(s.currencyCode)}
                </td>
                <td className="no-print">
                  <div style={{ display: "inline-flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => openViewDocuments(s)}>
                      <Eye size={13} /> لیدل
                    </button>
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => openUploadDocuments(s)}>
                      <Upload size={13} /> اسناد اضافه کول
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={() => printDesignedSaleReceipt(s)}
                      title="د فروش رسید چاپ"
                    >
                      <FileText size={13} /> رسید
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!displaySales?.length && (
              <tr><td colSpan={14} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>تر اوسه هېڅ فروش نشته.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      </>
      )}

      {(viewDocumentsSale || uploadDocumentsSale) && (
        <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.42)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}>
          <div className="card" style={{ width: "min(760px, calc(100vw - 32px))", maxHeight: "86vh", overflow: "auto", padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{viewDocumentsSale ? "د اسنادو لیدل" : "اسناد اضافه کول"}</div>
                <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                  {activeDocumentsSale?.party?.name ?? "مشتري"} / {activeDocumentsSale?.unit?.unitNumber ?? "ملکیت"}
                </div>
              </div>
              <button className="btn btn-outline btn-sm" type="button" onClick={closeDocumentsModal}><X size={14} /></button>
            </div>

            {documentsError ? (
              <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 800 }}>
                {documentsError}
              </div>
            ) : null}

            {uploadDocumentsSale ? (
              <div className="no-enter-navigation" style={{ display: "grid", gap: 12, marginBottom: 16 }}>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>
                  یوازې JPG او PNG عکسونه؛ د هر عکس اعظمي سایز ۵MB دی.
                </div>
                <input
                  className="form-input"
                  type="file"
                  accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    const validationError = validateDocumentFiles(files);
                    setDocumentsError(validationError);
                    setSelectedDocumentFiles(validationError ? [] : files);
                  }}
                />
                {selectedDocumentFiles.length ? (
                  <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                    {selectedDocumentFiles.map((file) => (
                      <div key={`${file.name}-${file.size}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
                        <span>{file.name}</span>
                        <span style={{ direction: "ltr", color: "var(--muted)" }}>{fileSizeLabel(file.size)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!selectedDocumentFiles.length || uploadDocumentsMutation.isPending}
                  onClick={() => uploadDocumentsMutation.mutate(selectedDocumentFiles)}
                >
                  <Upload size={16} /> اسناد اضافه کول
                </button>
              </div>
            ) : null}

            {viewDocumentsSale && editDocument ? (
              <div className="no-enter-navigation" style={{ display: "grid", gap: 12, marginBottom: 16, border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--surface-2)" }}>
                <div style={{ fontWeight: 900 }}>د سند ایډیټ: {editDocument.fileName}</div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>
                  یوازې یو نوی JPG یا PNG عکس وټاکئ؛ اعظمي سایز ۵MB دی.
                </div>
                <input
                  className="form-input"
                  type="file"
                  accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []).slice(0, 1);
                    const validationError = validateDocumentFiles(files);
                    setDocumentsError(validationError);
                    setSelectedDocumentFiles(validationError ? [] : files);
                  }}
                />
                {selectedDocumentFiles[0] ? (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "var(--surface)" }}>
                    <span>{selectedDocumentFiles[0].name}</span>
                    <span style={{ direction: "ltr", color: "var(--muted)" }}>{fileSizeLabel(selectedDocumentFiles[0].size)}</span>
                  </div>
                ) : null}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => {
                      setEditDocument(null);
                      setSelectedDocumentFiles([]);
                      setDocumentsError(null);
                    }}
                  >
                    لغوه
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={!selectedDocumentFiles[0] || updateDocumentMutation.isPending}
                    onClick={() => selectedDocumentFiles[0] && updateDocumentMutation.mutate({ document: editDocument, file: selectedDocumentFiles[0] })}
                  >
                    <Edit2 size={16} /> ایډیټ
                  </button>
                </div>
              </div>
            ) : null}

            <div style={{ display: "grid", gap: 10 }}>
              {saleDocuments?.map((doc) => (
                <div
                  key={doc.id}
                  style={{ display: "grid", gridTemplateColumns: "72px minmax(0, 1fr) auto", alignItems: "center", gap: 12, color: "var(--text)", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}
                >
                  <a href={doc.fileUrl} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                    <img src={doc.fileUrl} alt={doc.fileName} loading="lazy" style={{ width: 72, height: 54, objectFit: "cover", borderRadius: 8, background: "var(--surface-2)" }} />
                  </a>
                  <div style={{ minWidth: 0 }}>
                    <a href={doc.fileUrl} target="_blank" rel="noreferrer" style={{ display: "block", color: "var(--text)", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none" }}>{doc.fileName}</a>
                    <span style={{ direction: "ltr", color: "var(--muted)", fontSize: 12 }}>{fileSizeLabel(doc.sizeBytes)}</span>
                  </div>
                  <div style={{ display: "inline-flex", gap: 6, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => startEditDocument(doc)} disabled={updateDocumentMutation.isPending || deleteDocumentMutation.isPending}>
                      <Edit2 size={13} /> ایډیټ
                    </button>
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => deleteDocument(doc)} disabled={deleteDocumentMutation.isPending || updateDocumentMutation.isPending}>
                      <Trash2 size={13} /> ډیلیټ
                    </button>
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => printDocument(doc)}>
                      <Printer size={13} /> پرنټ
                    </button>
                  </div>
                </div>
              ))}
              {saleDocuments && !saleDocuments.length ? (
                <div style={{ padding: 22, textAlign: "center", color: "var(--muted)", border: "1px dashed var(--border)", borderRadius: 8 }}>
                  تر اوسه اسناد نشته.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="card compact-form-modal" style={{ width: 640, maxHeight: "82vh", overflow: "auto", padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{isShopView ? "نوې د دوکان فروش ثبتول" : isSalesDetailView ? "نوې فروش ثبتول" : "نوې پلورنه ثبتول"}</div>
              <button className="btn btn-outline btn-sm" onClick={() => setShowForm(false)}><X size={14} /></button>
            </div>

            {error && (
              <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>
                {error}
              </div>
            )}

            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                <div>
                  <label className="form-label">پروژه</label>
                  <select
                    className="form-input"
                    value={selectedProjectId}
                    onChange={(event) => {
                      setSelectedProjectId(event.target.value);
                      setSelectedBlockId("");
                      setSelectedFloorId("");
                      setForm((current) => ({ ...current, unitId: null }));
                    }}
                  >
                    <option value="">ټولې پروژې</option>
                    {projects?.map((project) => <option key={project.id} value={project.id}>{saleText(project.name, "پروژه")}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">بلاک</label>
                  <select
                    className="form-input"
                    value={selectedBlockId}
                    onChange={(event) => {
                      setSelectedBlockId(event.target.value);
                      setSelectedFloorId("");
                      setForm((current) => ({ ...current, unitId: null }));
                    }}
                    disabled={!selectedProjectId}
                  >
                    <option value="">ټول بلاکونه</option>
                    {selectedBlocks.map((block) => <option key={block.id} value={block.id}>{saleText(block.name, "بلاک")}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">منزل</label>
                  <select
                    className="form-input"
                    value={selectedFloorId}
                    onChange={(event) => {
                      setSelectedFloorId(event.target.value);
                      setForm((current) => ({ ...current, unitId: null }));
                    }}
                    disabled={!selectedBlockId}
                  >
                    <option value="">ټول منزلونه</option>
                    {selectedFloors.map((floor) => <option key={floor.id} value={floor.id}>{saleText(floor.name, "منزل")}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">ملکیت (نمرې لټون)</label>
                <input className="form-input" placeholder="د واحد شمېره ولیکئ..." value={unitQuery} onChange={(e) => setUnitQuery(e.target.value)} />
                {unitQuery.trim() ? (
                  <div style={searchResultListStyle}>
                    {unitSearchResults.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        style={searchResultButtonStyle}
                        onClick={() => {
                          setForm((f) => ({ ...f, unitId: u.id }));
                          setUnitQuery(u.unitNumber);
                        }}
                      >
                        {unitOptionLabel(u)}
                      </button>
                    ))}
                    {!unitSearchResults.length && <div style={{ color: "var(--muted)", fontSize: 13, padding: "4px 2px" }}>ملکیت ونه موندل شو.</div>}
                  </div>
                ) : null}
                <select
                  className="form-input"
                  style={{ marginTop: 6 }}
                  value={form.unitId ?? ""}
                  onChange={(e) => {
                    const unitId = Number(e.target.value) || null;
                    const unit = saleableUnits.find((item) => item.id === unitId);
                    setForm((f) => ({ ...f, unitId }));
                    if (unit) setUnitQuery(unit.unitNumber);
                  }}
                >
                  <option value="">-- ملکیت وټاکئ --</option>
                  {saleableUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {unitOptionLabel(u)}
                    </option>
                  ))}
                </select>
                {selectedUnit && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>حالت: {UNIT_STATUS_LABELS[selectedUnit.status] ?? "حالت"}</div>}
              </div>

              <div>
                <label className="form-label">د فروش مشتري (نوم لټون)</label>
                <input className="form-input" placeholder="د فروش مشتري نوم ولیکئ..." value={partyQuery} onChange={(e) => setPartyQuery(e.target.value)} />
                {partyQuery.trim() ? (
                  <div style={searchResultListStyle}>
                    {partySearchResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        style={searchResultButtonStyle}
                        onClick={() => {
                          setForm((f) => ({ ...f, partyId: p.id }));
                          setPartyQuery(p.name);
                        }}
                      >
                        {partyOptionLabel(p)}
                      </button>
                    ))}
                    {!partySearchResults.length && <div style={{ color: "var(--muted)", fontSize: 13, padding: "4px 2px" }}>د فروش مشتري ونه موندل شو.</div>}
                  </div>
                ) : null}
                <select
                  className="form-input"
                  style={{ marginTop: 6 }}
                  value={form.partyId ?? ""}
                  onChange={(e) => {
                    const partyId = Number(e.target.value) || null;
                    const party = parties?.find((item) => item.id === partyId);
                    setForm((f) => ({ ...f, partyId }));
                    if (party) setPartyQuery(party.name);
                  }}
                >
                  <option value="">-- د فروش مشتري وټاکئ --</option>
                  {parties?.map((p) => (
                    <option key={p.id} value={p.id}>{partyOptionLabel(p)}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                <div>
                  <label className="form-label">نرخ</label>
                  <input className="form-input" type="text" inputMode="decimal" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">تخفیف</label>
                  <input className="form-input" type="text" inputMode="decimal" value={form.discount} onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">اسعار</label>
                  <select className="form-input" value={form.currencyCode} onChange={(e) => setForm((f) => ({ ...f, currencyCode: e.target.value }))}>
                    <option value="AFN">افغانی</option>
                    <option value="USD">ډالر</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
                <div>
                  <label className="form-label">د تړون نېټه</label>
                  <ShamsiDateInput className="form-input" value={form.saleDate} onChange={(saleDate) => setForm((f) => ({ ...f, saleDate }))} />
                </div>
                <div>
                  <label className="form-label">د تادیې طریقه</label>
                  <select className="form-input" value={form.paymentType} onChange={(e) => setForm((f) => ({ ...f, paymentType: e.target.value }))}>
                    <option value="cash">نغدي</option>
                    <option value="installment">قسط وار</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">لومړنۍ ترلاسه شوې پیسه (اختیاري)</label>
                <input className="form-input" type="text" inputMode="decimal" value={form.firstReceivedAmount} onChange={(e) => setForm((f) => ({ ...f, firstReceivedAmount: e.target.value }))} />
              </div>

              <div>
                <label className="form-label">د تړون شمېره (اختیاري)</label>
                <input className="form-input" value={form.contractNumber} onChange={(e) => setForm((f) => ({ ...f, contractNumber: e.target.value }))} />
              </div>

              <div>
                <label className="form-label">یادداشتونه</label>
                <textarea className="form-input" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                className="btn btn-primary"
                disabled={!form.unitId || !form.partyId || !form.price || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                ثبتول
              </button>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>لغوه</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
