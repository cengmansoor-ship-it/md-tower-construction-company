import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Trash2 } from "lucide-react";
import { api, type TrashItem } from "../lib/api";
import JalaliDate from "../components/JalaliDate";
import { userDisplayName, visibleText } from "../lib/labels";

const ENTITY_LABELS: Record<string, string> = {
  CompanyPartner: "د شرکت شریک",
  DailyCashEntry: "روزنامچه",
  Employee: "کارکوونکی",
  EmployeeDocument: "د کارکوونکي سند",
  JournalTransaction: "ژورنال",
  PartyLedgerLine: "کهاته ریکارډ",
  Party: "مشتری",
  Partner: "شریک / حاجي صاحب",
  Expense: "مصرف",
  Purchase: "د اجناسو خرید",
  PurchaseReturn: "واپسي بیل",
  SaleDocument: "د فروش سند",
  SaleReceipt: "فروش رسید",
  RentalReceipt: "کرایه رسید",
  Project: "پروژه",
};

export default function TrashPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["trash"],
    queryFn: () => api.get<TrashItem[]>("/trash"),
  });

  const purgeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => api.post<TrashItem>(`/trash/${id}/purge`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trash"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (error) => window.alert(error instanceof Error ? error.message : "پاکول ناکام شول"),
  });

  const restoreMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => api.post<TrashItem>(`/trash/${id}/restore`, { reason: reason ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trash"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
      qc.invalidateQueries();
    },
    onError: (error) => window.alert(error instanceof Error ? error.message : "بېرته راوستل ناکام شول"),
  });

  function purgeItem(item: TrashItem) {
    const reason = window.prompt("د کثافت داني څخه د پاکولو دلیل ولیکئ:");
    if (!reason?.trim()) return;
    purgeMutation.mutate({ id: item.id, reason: reason.trim() });
  }

  function restoreItem(item: TrashItem) {
    if (!window.confirm(`"${visibleText(item.displayName, item.entityId)}" بېرته راوستل شي؟`)) return;
    restoreMutation.mutate({ id: item.id, reason: "د ټرش څخه بېرته راوستل شو" });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">کثافت داني</h1>
          <p className="page-sub">حذف شوي ریکارډونه دلته ۳۰ ورځې ساتل کېږي؛ دلیل یې تل په Audit Log کې پاتې کېږي.</p>
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="card-header">
          <div>حذف شوي ریکارډونه — {data?.length ?? (isLoading ? "..." : 0)}</div>
        </div>
        <table className="fl-table" style={{ minWidth: 980, fontSize: 13 }}>
          <thead>
            <tr>
              <th>شمېره</th>
              <th>برخه</th>
              <th>ریکارډ</th>
              <th>د حذف دلیل</th>
              <th>کاروونکی</th>
              <th>حذف نېټه</th>
              <th>اتومات پاکېدل</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((item, index) => (
              <tr key={item.id}>
                <td>{index + 1}</td>
                <td>{ENTITY_LABELS[item.entityType] ?? item.entityType}</td>
                <td>
                  {item.sourcePath ? (
                    <Link to={item.sourcePath} style={{ color: "var(--primary)", fontWeight: 800, textDecoration: "none" }}>
                      {visibleText(item.displayName, item.entityId)}
                    </Link>
                  ) : (
                    visibleText(item.displayName, item.entityId)
                  )}
                </td>
                <td style={{ maxWidth: 320, whiteSpace: "normal" }}>{visibleText(item.deleteReason, "دلیل")}</td>
                <td>{userDisplayName(null, item.deletedByUsername)}</td>
                <td style={{ whiteSpace: "nowrap" }}><JalaliDate date={item.deletedAt} /></td>
                <td style={{ whiteSpace: "nowrap" }}><JalaliDate date={item.purgeAfter} /></td>
                <td>
                  <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button className="btn btn-primary btn-sm" onClick={() => restoreItem(item)} disabled={restoreMutation.isPending || purgeMutation.isPending}>
                      <RotateCcw size={14} /> بېرته راوستل
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => purgeItem(item)} disabled={purgeMutation.isPending || restoreMutation.isPending}>
                      <Trash2 size={14} /> پاکول
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!data?.length && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: 36, color: "var(--muted)" }}>
                  <Trash2 size={32} style={{ margin: "0 auto 12px", opacity: 0.35 }} />
                  کثافت داني تشه ده.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
