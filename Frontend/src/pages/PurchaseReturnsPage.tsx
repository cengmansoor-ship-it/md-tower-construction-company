import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Plus, Printer, RotateCcw, Trash2, X } from "lucide-react";
import { api, type Purchase, type PurchaseReturn } from "../lib/api";
import JalaliDate from "../components/JalaliDate";
import ShamsiDateInput from "../components/ShamsiDateInput";
import DateFilterButton from "../components/DateFilterButton";
import ViewModeToggle, { type ViewMode } from "../components/ViewModeToggle";
import { currencyLabel, visibleText } from "../lib/labels";
import PrintHeader from "../components/PrintHeader";

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function firstOfMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

interface ReturnForm {
  purchaseId: number | null;
  customerBillNumber: string;
  returnDate: string;
  returnedItemName: string;
  quantity: string;
  amount: string;
  currencyCode: string;
  reason: string;
}

function emptyForm(): ReturnForm {
  return {
    purchaseId: null,
    customerBillNumber: "",
    returnDate: today(),
    returnedItemName: "",
    quantity: "1",
    amount: "",
    currencyCode: "AFN",
    reason: "",
  };
}

function parseDecimal(value: string | number | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return { amount: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function formatScaled(amount: bigint, scale: number): string {
  if (scale === 0) return amount.toString();
  const text = amount.toString().padStart(scale + 1, "0");
  const whole = text.slice(0, -scale) || "0";
  const fraction = text.slice(-scale).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function multiplyDecimal(left: string, right: string): string {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a || !b) return "";
  return formatScaled(a.amount * b.amount, a.scale + b.scale);
}

function purchaseDisplayNumber(purchase: Purchase): string {
  return purchase.customerBillNumber || purchase.purchaseNumber;
}

export default function PurchaseReturnsPage() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get("q") ?? "";
  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(today());
  const [q, setQ] = useState(urlSearch);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ReturnForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const requestedPurchaseId = Number(searchParams.get("purchaseId") ?? "") || null;

  useEffect(() => {
    setQ(urlSearch);
  }, [urlSearch]);

  const { data: returns, refetch: refetchReturns } = useQuery({
    queryKey: ["purchase-returns", startDate, endDate, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (q) params.set("q", q);
      const query = params.toString();
      return api.get<PurchaseReturn[]>(`/purchases/returns${query ? `?${query}` : ""}`);
    },
  });

  const { data: purchases } = useQuery({
    queryKey: ["purchases-for-returns"],
    queryFn: () => api.get<Purchase[]>("/purchases?status=open"),
    enabled: showForm,
  });

  const selectedPurchase = useMemo(
    () => purchases?.find((purchase) => purchase.id === form.purchaseId),
    [form.purchaseId, purchases],
  );

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
    setError(null);
  }

  function openCreateForm() {
    const params = new URLSearchParams(searchParams);
    params.delete("purchaseId");
    setSearchParams(params, { replace: true });
    resetForm();
    setShowForm(true);
  }

  function closeForm() {
    const params = new URLSearchParams(searchParams);
    params.delete("purchaseId");
    setSearchParams(params, { replace: true });
    setShowForm(false);
    resetForm();
  }

  function applyPurchase(purchaseId: number | null) {
    const purchase = purchases?.find((item) => item.id === purchaseId);
    setForm((current) => ({
      ...current,
      purchaseId,
      returnedItemName: purchase?.itemName ?? current.returnedItemName,
      currencyCode: purchase?.currencyCode ?? current.currencyCode,
      amount: purchase ? multiplyDecimal(purchase.unitPrice, current.quantity || "1") : current.amount,
    }));
  }

  function updateQuantity(quantity: string) {
    setForm((current) => ({
      ...current,
      quantity,
      amount: selectedPurchase ? multiplyDecimal(selectedPurchase.unitPrice, quantity) : current.amount,
    }));
  }

  useEffect(() => {
    if (!requestedPurchaseId || editingId) return;
    setShowForm(true);
    setForm((current) => ({ ...current, purchaseId: requestedPurchaseId }));
  }, [requestedPurchaseId, editingId]);

  useEffect(() => {
    if (!requestedPurchaseId || !showForm || editingId) return;
    const purchase = purchases?.find((item) => item.id === requestedPurchaseId);
    if (!purchase) return;
    setForm((current) => ({
      ...current,
      purchaseId: requestedPurchaseId,
      returnedItemName: current.returnedItemName || purchase.itemName,
      currencyCode: purchase.currencyCode,
      amount: multiplyDecimal(purchase.unitPrice, current.quantity || "1"),
    }));
  }, [requestedPurchaseId, showForm, editingId, purchases]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        customerBillNumber: form.customerBillNumber,
        returnDate: form.returnDate,
        returnedItemName: form.returnedItemName,
        quantity: form.quantity,
        amount: form.amount,
        currencyCode: form.currencyCode,
        reason: form.reason,
      };
      if (editingId) return api.put<PurchaseReturn>(`/purchases/returns/${editingId}`, body);
      return api.post<PurchaseReturn>(`/purchases/${form.purchaseId}/returns`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-returns"] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["purchase-item-total-rows"] });
      qc.invalidateQueries({ queryKey: ["purchase"] });
      qc.invalidateQueries({ queryKey: ["party-ledger"] });
      qc.invalidateQueries({ queryKey: ["party-ledger-total"] });
      closeForm();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "ثبت ناکام شو"),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => api.post<PurchaseReturn>(`/purchases/returns/${id}/delete`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-returns"] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["purchase-item-total-rows"] });
      qc.invalidateQueries({ queryKey: ["purchase"] });
      qc.invalidateQueries({ queryKey: ["party-ledger"] });
      qc.invalidateQueries({ queryKey: ["party-ledger-total"] });
      qc.invalidateQueries({ queryKey: ["trash"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "حذف ناکام شو"),
  });

  function editReturn(ret: PurchaseReturn) {
    setEditingId(ret.id);
    setForm({
      purchaseId: ret.purchaseId,
      customerBillNumber: ret.customerBillNumber ?? "",
      returnDate: ret.returnDate,
      returnedItemName: ret.returnedItemName,
      quantity: ret.quantity,
      amount: ret.amount,
      currencyCode: ret.currencyCode,
      reason: ret.reason,
    });
    setError(null);
    setShowForm(true);
  }

  function deleteReturn(ret: PurchaseReturn) {
    const reason = window.prompt("د حذف دلیل ولیکئ:");
    if (!reason?.trim()) return;
    deleteMutation.mutate({ id: ret.id, reason: reason.trim() });
  }

  const canSave = Boolean(form.purchaseId && form.customerBillNumber.trim() && form.returnDate && form.returnedItemName && form.quantity && form.amount && form.reason);

  return (
    <div className="print-report-page print-wide">
      <PrintHeader title="واپسي بیل راپور" />
      <div className="page-header">
        <div>
          <h1 className="page-title">واپسي بیل</h1>
          <p className="page-sub">د خریداري اجناسو د واپسي ثبت، حساب، اصلاح او راپور.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <button className="btn btn-outline" onClick={() => window.print()}>
            <Printer size={16} /> چاپ
          </button>
          <button className="btn btn-primary" onClick={openCreateForm}>
            <Plus size={16} /> نوی واپسي بیل
          </button>
        </div>
      </div>

      <div className="card no-print" style={{ padding: 16, marginBottom: 18, display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <label className="form-label">شروع تاریخ</label>
          <ShamsiDateInput className="form-input" value={startDate} onChange={setStartDate} style={{ width: 150 }} />
        </div>
        <div>
          <label className="form-label">ختم تاریخ</label>
          <ShamsiDateInput className="form-input" value={endDate} onChange={setEndDate} style={{ width: 150 }} />
        </div>
        <DateFilterButton onClick={() => void refetchReturns()} />
        <div style={{ flex: 1, minWidth: 230 }}>
          <label className="form-label filter-search-label">لټون</label>
          <input className="form-input" value={q} onChange={(event) => setQ(event.target.value)} placeholder="بیل، مشتری، جنس یا دلیل..." />
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="list-grid">
          {returns?.map((ret) => (
            <div key={ret.id} className="list-card" style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <strong>{visibleText(ret.returnNumber, "واپسي بیل")}</strong>
                <span className="badge badge-info"><JalaliDate date={ret.returnDate} /></span>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>{ret.purchase?.supplier?.name ?? "—"}</div>
              <div style={{ display: "grid", gap: 5, fontSize: 13 }}>
                <span>د مشتری بیل: {visibleText(ret.customerBillNumber, "—")}</span>
                <span>جنس: {ret.returnedItemName}</span>
                <span>مقدار: {ret.quantity}</span>
                <span>پیسې: {ret.amount} {currencyLabel(ret.currencyCode)}</span>
                <span>دلیل: {visibleText(ret.reason, "دلیل")}</span>
              </div>
              <div className="no-print" style={{ display: "flex", gap: 8 }}>
                <Link className="btn btn-outline btn-sm" to={`/purchases/${ret.purchaseId}`} style={{ textDecoration: "none" }}>اصلي بیل</Link>
                <button className="btn btn-outline btn-sm" onClick={() => editReturn(ret)}>
                  <Edit2 size={14} /> اصلاح
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => deleteReturn(ret)} disabled={deleteMutation.isPending}>
                  <Trash2 size={14} /> حذف
                </button>
              </div>
            </div>
          ))}
          {!returns?.length && <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>تر اوسه واپسي بیل نشته.</div>}
        </div>
      ) : (
        <div className="card elevated-card print-report-surface" style={{ padding: 0, overflow: "auto" }}>
          <table className="fl-table" style={{ minWidth: 1160, fontSize: 13 }}>
            <thead>
              <tr>
                <th>شمېره</th>
                <th>تاریخ</th>
                <th>د شرکت واپسي بیل</th>
                <th>د مشتری بیل نمبر</th>
                <th>اصلي بیل</th>
                <th>مشتری نوم</th>
                <th>جنس نوم</th>
                <th>مقدار</th>
                <th>پیسې</th>
                <th>دلیل</th>
                <th className="no-print">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {returns?.map((ret, index) => (
                <tr key={ret.id}>
                  <td>{index + 1}</td>
                  <td><JalaliDate date={ret.returnDate} /></td>
                  <td>{visibleText(ret.returnNumber, `واپسي ${index + 1}`)}</td>
                  <td>{visibleText(ret.customerBillNumber, "—")}</td>
                  <td className="no-print">
                    <Link to={`/purchases/${ret.purchaseId}`} style={{ color: "var(--primary)", fontWeight: 800, textDecoration: "none" }}>
                      {visibleText(ret.purchase?.purchaseNumber, "بیل")}
                    </Link>
                  </td>
                  <td>{ret.purchase?.supplier?.name ?? "—"}</td>
                  <td>{ret.returnedItemName}</td>
                  <td>{ret.quantity}</td>
                  <td style={{ fontWeight: 900 }}>{ret.amount} {currencyLabel(ret.currencyCode)}</td>
                  <td>{visibleText(ret.reason, "دلیل")}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => editReturn(ret)}>
                        <Edit2 size={14} /> اصلاح
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => deleteReturn(ret)} disabled={deleteMutation.isPending}>
                        <Trash2 size={14} /> حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!returns?.length && (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>تر اوسه واپسي بیل نشته.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop no-print">
          <div className="card modal-card" style={{ width: "min(620px, 100%)" }}>
            <div className="modal-title">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <RotateCcw size={18} /> {editingId ? "واپسي بیل اصلاح" : "نوی واپسي بیل"}
              </span>
              <button className="btn btn-outline btn-sm" onClick={closeForm}><X size={14} /></button>
            </div>
            {error && <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="form-label">اصلي خریداري بیل</label>
                <select className="form-input" disabled={Boolean(editingId)} value={form.purchaseId ?? ""} onChange={(event) => applyPurchase(Number(event.target.value) || null)}>
                  <option value="">بیل وټاکئ</option>
                  {purchases?.map((purchase) => (
                    <option key={purchase.id} value={purchase.id}>
                      {visibleText(purchaseDisplayNumber(purchase), "بیل")} - {purchase.supplier?.name ?? "مشتری"} - {purchase.itemName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">د مشتری بیل نمبر</label>
                <input className="form-input" value={form.customerBillNumber} onChange={(event) => setForm((current) => ({ ...current, customerBillNumber: event.target.value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                <div>
                  <label className="form-label">تاریخ</label>
                  <ShamsiDateInput className="form-input" value={form.returnDate} onChange={(returnDate) => setForm((current) => ({ ...current, returnDate }))} />
                </div>
                <div>
                  <label className="form-label">پیسې ډول</label>
                  <select className="form-input" value={form.currencyCode} onChange={(event) => setForm((current) => ({ ...current, currencyCode: event.target.value }))}>
                    <option value="AFN">افغانی</option>
                    <option value="USD">ډالر</option>
                    <option value="PKR">کلداره</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">جنس نوم</label>
                <input className="form-input" value={form.returnedItemName} onChange={(event) => setForm((current) => ({ ...current, returnedItemName: event.target.value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                <div>
                  <label className="form-label">مقدار</label>
                  <input className="form-input" type="text" inputMode="decimal" value={form.quantity} onChange={(event) => updateQuantity(event.target.value)} />
                </div>
                <div>
                  <label className="form-label">پیسې</label>
                  <input className="form-input" type="text" inputMode="decimal" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} />
                </div>
              </div>
              {selectedPurchase ? (
                <div className="summary-card info" style={{ display: "grid", gap: 6 }}>
                  <span>د اصلي بیل پاته حساب</span>
                  <strong>{selectedPurchase.balance ?? "0"} {currencyLabel(selectedPurchase.currencyCode)}</strong>
                </div>
              ) : null}
              <div>
                <label className="form-label">دلیل</label>
                <input className="form-input" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-primary" disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                {editingId ? "ساتل" : "ثبتول"}
              </button>
              <button className="btn btn-outline" onClick={closeForm}>لغوه</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
