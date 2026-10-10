import { useQuery } from "@tanstack/react-query";
import { api, type AuditLogEntry } from "../lib/api";
import { ScrollText } from "lucide-react";
import JalaliDate from "../components/JalaliDate";
import { userDisplayName } from "../lib/labels";

const ACTION_BADGE: Record<string, string> = {
  create: "badge-success",
  update: "badge-info",
  delete: "badge-danger",
  trash_restore: "badge-success",
  trash_purge: "badge-danger",
  trash_auto_purge: "badge-muted",
};
const ACTION_LABELS: Record<string, string> = {
  create: "جوړول",
  update: "تغیر",
  delete: "حذف",
  trash_restore: "له ټرش څخه بېرته راوستل",
  trash_purge: "له کثافت داني پاکول",
  trash_auto_purge: "اتومات پاکول",
};
const ENTITY_LABELS: Record<string, string> = {
  sale: "فروش",
  rental: "کرایه",
  purchase: "خریداري",
  expense: "مصرف",
  partner: "شریک",
  employee: "کارکوونکی",
  party: "مشتری",
  exchange: "صرافي",
  settings: "عمومي تنظیمات",
  DailyCashEntry: "روزنامچه",
  JournalTransaction: "ژورنال",
  PartyLedgerLine: "کهاته ریکارډ",
  Expense: "مصرف",
  Purchase: "د اجناسو خرید",
  PurchaseReturn: "واپسي بیل",
  SaleReceipt: "فروش رسید",
  RentalReceipt: "کرایه رسید",
};

function auditReason(details: Record<string, unknown> | null): string {
  const reason = details?.reason;
  return typeof reason === "string" && reason.trim() ? reason : "—";
}

export default function AuditLogPage() {
  const { data } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => api.get<{ total: number; items: AuditLogEntry[] }>("/audit-logs?limit=100"),
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">د بدلونونو راپور</h1>
        <div className="page-breadcrumb">
          <span>ډشبورډ</span>
          <span>/</span>
          <span>راپورونه</span>
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="card-header">
           <div>د سیسټم ټولې کړنې — {data?.total ?? "..."} ثبتونه</div>
        </div>
        <table className="fl-table">
          <thead>
            <tr>
              <th>نیټه / وخت</th>
              <th>کارن</th>
              <th>کړنه</th>
              <th>ډول</th>
              <th>شمېره</th>
              <th>دلیل</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((e) => (
              <tr key={e.id}>
                <td style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>
                  <JalaliDate date={e.createdAt} />
                  <span style={{ fontSize: "0.75em", opacity: 0.6, display: "block" }}>
                    {e.createdAt?.slice(11, 19)}
                  </span>
                </td>
                <td style={{ fontWeight: 500 }}>{userDisplayName(null, e.username)}</td>
                <td>
                  <span className={`badge ${ACTION_BADGE[e.action] ?? "badge-muted"}`}>
                    {ACTION_LABELS[e.action] ?? "کړنه"}
                  </span>
                </td>
                <td style={{ color: "var(--muted)", fontSize: 14 }}>{ENTITY_LABELS[e.entityType] ?? "برخه"}</td>
                <td style={{ fontSize: 13, color: "var(--muted)" }}>{e.entityId ?? "—"}</td>
                <td style={{ fontSize: 13, color: "var(--muted)", maxWidth: 320, whiteSpace: "normal" }}>{auditReason(e.details)}</td>
              </tr>
            ))}
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
                  <ScrollText size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
                  هیڅ راپور ونه موندل شو.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
