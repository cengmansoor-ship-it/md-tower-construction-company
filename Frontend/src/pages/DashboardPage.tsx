import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Home,
  Layers,
  ReceiptText,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type DashboardDrilldownItem, type DashboardSummary } from "../lib/api";
import JalaliDate from "../components/JalaliDate";
import { useAuth } from "../lib/auth";
import { currencyLabel, userDisplayName, visibleText } from "../lib/labels";

const STATUS_LABELS: Record<string, string> = {
  available: "خالي",
  reserved: "نیول شوی",
  sold: "فروش شوی",
  rented: "کرایه شوی",
  blocked: "بند شوی",
  cancelled: "لغوه شوی",
  inactive: "غیر فعال",
  draft: "مسوده",
};

const COLORS = ["#0f766e", "#2563eb", "#b45309", "#be123c", "#475569", "#7c3aed", "#15803d", "#9333ea"];

function isZeroDecimal(value: string | undefined): boolean {
  if (!value) return true;
  return /^[-+]?0*(?:\.0*)?$/.test(value.trim());
}

function toChartNumber(value: string | undefined): number {
  const n = Number.parseFloat(value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

function formatCurrencyMap(map: Record<string, string>): string {
  const entries = Object.entries(map).filter(([, value]) => !isZeroDecimal(value));
  if (entries.length === 0) return "0";
  return entries.map(([currency, value]) => `${value} ${currencyLabel(currency)}`).join(" / ");
}

function moneyChartRows(label: string, map: Record<string, string>) {
  return Object.entries(map)
    .filter(([, value]) => !isZeroDecimal(value))
    .map(([currency, value]) => ({ name: `${label} ${currencyLabel(currency)}`, currency: currencyLabel(currency), value: toChartNumber(value), exact: value }));
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [drilldown, setDrilldown] = useState<{ title: string; items: DashboardDrilldownItem[]; fallback: string } | null>(null);
  const [attendanceDrilldown, setAttendanceDrilldown] = useState<{ title: string; items: DashboardDrilldownItem[]; fallback: string } | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardSummary>("/reports/dashboard"),
    refetchInterval: 60_000,
  });
  const welcomeName = userDisplayName(user?.fullName, user?.username);

  const statusRows = data
    ? Object.entries(data.unitsByStatus).map(([status, count]) => ({
        name: STATUS_LABELS[status] ?? status,
        value: count,
        to: status === "sold" ? "/sales" : status === "rented" ? "/rentals" : "/projects/list",
        items: data.unitStatusDetails[status] ?? [],
      }))
    : [];

  const cashFlowRows = data
    ? [
        ...moneyChartRows("راغلې", data.todayIncomingByCurrency),
        ...moneyChartRows("وتلې", data.todayOutgoingByCurrency),
      ]
    : [];

  const accountRows = data
    ? [
        ...moneyChartRows("مشتریان", data.companyReceivablesByCurrency),
        ...moneyChartRows("شرکت", data.companyPayablesByCurrency),
      ]
    : [];

  const cards = data
    ? [
        { label: "ټول بلاکونه", value: String(data.totalBlocks), icon: Building2, to: "/projects/list", items: data.drilldowns.blocks },
        { label: "ټول منزلونه", value: String(data.totalFloors), icon: Layers, to: "/projects/list", items: data.drilldowns.floors },
        { label: "ټول ملکیتونه", value: String(data.totalProperties), icon: Home, to: "/projects/list", items: data.drilldowns.properties },
        { label: "ټول مشتریان", value: String(data.totalCustomers), icon: Users, to: "/parties", items: data.drilldowns.customers },
        { label: "فعالې کرایې", value: String(data.activeRentals), icon: ReceiptText, to: "/rentals?status=active", items: data.drilldowns.activeRentals },
      ]
    : [];

  function openDrilldown(title: string, items: DashboardDrilldownItem[], fallback: string) {
    setAttendanceDrilldown(null);
    if (items.length === 1) {
      navigate(items[0]!.to);
      return;
    }
    if (items.length > 1) {
      setDrilldown({ title, items, fallback });
      return;
    }
    navigate(fallback);
  }

  function openAttendanceDrilldown(title: string, items: DashboardDrilldownItem[], fallback = "/attendance") {
    setDrilldown(null);
    if (items.length === 1) {
      navigate(items[0]!.to);
      return;
    }
    setAttendanceDrilldown({ title, items, fallback });
  }

  function openAlerts() {
    if (!data) return;
    if (data.attendanceToday.notRecorded > 0) {
      openAttendanceDrilldown("نا ثبت کارکوونکي", data.attendanceToday.notRecordedEmployees);
      return;
    }
    navigate("/reports/general");
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">ډشبورډ</h1>
        <div className="page-breadcrumb">
          <span>ډشبورډ</span>
        </div>
      </div>

      <section className="dashboard-welcome-card" aria-label="ښه راغلاست">
        <div className="dashboard-welcome-copy">
          <span className="dashboard-welcome-kicker">مرکزي حسابداري</span>
          <h2>ښه راغلاست {welcomeName} صاحب!</h2>
          <p>دلته د ساختماني شرکت د روزنامچې، مشتریانو، پروژو، مصارفاتو او ټول حساب لنډ ژوندی وضعیت یو ځای ښکاري.</p>
        </div>
        <div className="dashboard-welcome-meta" aria-label="نننی لنډیز">
          <span className="dashboard-welcome-date">
            <JalaliDate date={new Date().toISOString()} />
          </span>
          <span>ژوندی مالي لنډیز</span>
        </div>
      </section>

      {isLoading || !data ? (
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
          په بارېدو کې...
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 14,
              marginBottom: 18,
            }}
          >
            {cards.map((card) => (
              <button
                key={card.label}
                type="button"
                className="card interactive-card"
                onClick={() => openDrilldown(card.label, card.items, card.to)}
                style={{
                  padding: 18,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  color: "inherit",
                  border: "1px solid var(--border)",
                  textAlign: "right",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 8,
                    background: "var(--surface-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <card.icon size={20} color="var(--primary)" />
                </span>
                <span>
                  <span style={{ display: "block", fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{card.value}</span>
                  <span style={{ display: "block", fontSize: 13, color: "var(--muted)" }}>{card.label}</span>
                </span>
              </button>
            ))}
          </div>

          {drilldown ? (
            <div className="card no-print" style={{ padding: 0, marginBottom: 18, overflow: "hidden" }}>
              <div className="card-header" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>{drilldown.title}</div>
                <button className="btn btn-outline btn-sm" type="button" onClick={() => setDrilldown(null)}>
                  بندول
                </button>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="fl-table" style={{ fontSize: 13 }}>
                  <tbody>
                    {drilldown.items.map((item, index) => (
                      <tr key={`${item.to}-${item.id}`} style={{ cursor: "pointer" }} onClick={() => navigate(item.to)}>
                        <td style={{ width: 70, padding: "10px 14px", color: "var(--muted)" }}>{index + 1}</td>
                        <td style={{ padding: "10px 14px", fontWeight: 800 }}>{item.label}</td>
                        <td style={{ padding: "10px 14px", color: "var(--muted)" }}>{item.detail ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: 12, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-start" }}>
                  <button className="btn btn-outline btn-sm" type="button" onClick={() => navigate(drilldown.fallback)}>
                    ټول لیست
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 18, marginBottom: 18 }}>
            <div
              className="card interactive-card"
              style={{ minHeight: 320, padding: 0, textDecoration: "none", color: "inherit", cursor: "pointer" }}
            >
              <div className="card-header">
                <div>د ملکیتونو حالت</div>
              </div>
              <div className="card-body" style={{ height: 236 }}>
                {statusRows.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusRows}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={82}
                        paddingAngle={2}
                        onClick={(row) => openDrilldown(row.name, row.items ?? [], row.to)}
                      >
                        {statusRows.map((row, index) => (
                          <Cell key={row.name} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, name) => [String(value), String(name)]} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart text="تر اوسه ملکیت نه دی ثبت شوی." />
                )}
              </div>
              {statusRows.length ? <ChartLegend rows={statusRows.map((row, index) => ({ label: row.name, color: COLORS[index % COLORS.length] }))} /> : null}
            </div>

            <Link to="/journal" className="card" style={{ minHeight: 290, padding: 0, textDecoration: "none", color: "inherit" }}>
              <div className="card-header">
                <div>
                  <Wallet size={16} style={{ verticalAlign: "middle", marginLeft: 6 }} />
                  د نن ورځې پیسې
                </div>
              </div>
              <div className="card-body" style={{ height: 228 }}>
                {cashFlowRows.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cashFlowRows} margin={{ top: 10, right: 28, bottom: 16, left: 54 }} onClick={() => navigate("/journal")}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} tickMargin={8} />
                      <YAxis width={86} tick={{ fontSize: 11, fill: "var(--muted)" }} tickMargin={12} />
                      <Tooltip formatter={(_, __, item) => [`${item.payload.exact} ${item.payload.currency}`, item.payload.name]} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {cashFlowRows.map((row, index) => (
                          <Cell key={row.name} fill={row.name.startsWith("راغلې") ? "#0f766e" : COLORS[(index + 2) % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart text="نن نقدي حرکت نه دی ثبت شوی." />
                )}
              </div>
            </Link>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 18, marginBottom: 18 }}>
            <button
              type="button"
              className="card interactive-card dashboard-account-card"
              onClick={() => navigate("/reports/general")}
            >
              <div className="card-header">
                <div>
                  <BarChart3 size={16} style={{ verticalAlign: "middle", marginLeft: 6 }} />
                  د حسابونو حالت
                </div>
              </div>
              <div className="card-body dashboard-account-body">
                {accountRows.length ? (
                  <AccountStatusGraph rows={accountRows} />
                ) : (
                  <EmptyChart text="قرض او طلب نه دی ثبت شوی." />
                )}
              </div>
            </button>

            <Link to="/reports/general" className="card" style={{ padding: 0, textDecoration: "none", color: "inherit" }}>
              <div className="card-header">
                <div>د پیسو لنډیز</div>
              </div>
              <div className="card-body" style={{ padding: 18, display: "grid", gap: 11 }}>
                <Row label="ټولې پلورنې او کرایې" value={formatCurrencyMap(data.salesTotalsByCurrency)} />
                <Row label="ترلاسه شوي" value={formatCurrencyMap(data.receivedTotalsByCurrency)} />
                <Row label="پاتې طلب" value={formatCurrencyMap(data.outstandingTotalsByCurrency)} />
                <Row label="د نن ورځې راغلې پیسې" value={formatCurrencyMap(data.todayIncomingByCurrency)} />
                <Row label="د نن ورځې وتلې پیسې" value={formatCurrencyMap(data.todayOutgoingByCurrency)} />
                <Row label="پر مشتریانو طلب" value={formatCurrencyMap(data.companyReceivablesByCurrency)} />
                <Row label="پر شرکت پور" value={formatCurrencyMap(data.companyPayablesByCurrency)} />
              </div>
            </Link>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 18, marginBottom: 18 }}>
            <div className="card" style={{ padding: 0 }}>
              <div className="card-header">
                <div>د نن ورځې حاضري</div>
              </div>
              <div className="card-body" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))", gap: 12, padding: 18 }}>
                <Metric label="حاضر" value={data.attendanceToday.present} onClick={() => openAttendanceDrilldown("حاضر کارکوونکي", data.attendanceToday.presentEmployees)} />
                <Metric label="غیر حاضر" value={data.attendanceToday.absent} onClick={() => openAttendanceDrilldown("غیر حاضر کارکوونکي", data.attendanceToday.absentEmployees)} />
                <Metric label="نیمه ورځ" value={data.attendanceToday.halfDay} onClick={() => openAttendanceDrilldown("نیمه ورځ کارکوونکي", data.attendanceToday.halfDayEmployees)} />
                <Metric label="رخصتي" value={data.attendanceToday.leave} onClick={() => openAttendanceDrilldown("رخصتي کارکوونکي", data.attendanceToday.leaveEmployees)} />
                <Metric label="نا ثبت" value={data.attendanceToday.notRecorded} onClick={() => openAttendanceDrilldown("نا ثبت کارکوونکي", data.attendanceToday.notRecordedEmployees)} />
              </div>
              {attendanceDrilldown ? (
                <div style={{ borderTop: "1px solid var(--border)", padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <strong>{attendanceDrilldown.title}</strong>
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => setAttendanceDrilldown(null)}>
                      بندول
                    </button>
                  </div>
                  {attendanceDrilldown.items.length ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      {attendanceDrilldown.items.map((item) => (
                        <button
                          key={`${item.to}-${item.id}`}
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => navigate(item.to)}
                          style={{ justifyContent: "space-between", width: "100%", minHeight: 38 }}
                        >
                          <span>{item.label}</span>
                          <span style={{ color: "var(--muted)", fontWeight: 700 }}>{item.detail ?? ""}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: "var(--muted)", fontWeight: 700 }}>په دې حالت کې کارکوونکی نشته.</div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="card" style={{ padding: 0 }}>
              <div className="card-header">
                <div>وروستي معاملات</div>
              </div>
              <div className="card-body" style={{ padding: 0, overflow: "auto" }}>
                <table className="fl-table" style={{ fontSize: 13 }}>
                  <tbody>
                    {data.recentTransactions.length === 0 ? (
                      <tr>
                        <td style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>تر اوسه معامله نشته.</td>
                      </tr>
                    ) : (
                      data.recentTransactions.map((transaction) => (
                        <tr key={transaction.id} style={{ cursor: "pointer" }} onClick={() => navigate(transaction.sourceUrl ?? "/journal")}>
                          <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                            <JalaliDate date={transaction.date} />
                          </td>
                          <td style={{ padding: "10px 16px" }}>{visibleText(transaction.memo, "ثبت شوی حساب")}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {data.alerts.length > 0 ? (
            <button
              type="button"
              className="card"
              onClick={openAlerts}
              style={{
                display: "block",
                width: "100%",
                padding: 18,
                borderRight: "4px solid #b45309",
                color: "inherit",
                textAlign: "right",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 10 }}>
                <AlertTriangle size={18} color="#b45309" />
                مهمې خبرتیاوې
              </div>
              <ul style={{ margin: 0, paddingRight: 20, display: "grid", gap: 6 }}>
                {data.alerts.map((alert, index) => (
                  <li key={index} style={{ fontSize: 14, color: "var(--text)" }}>
                    {visibleText(alert, "مهمه خبرتیا")}
                  </li>
                ))}
              </ul>
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function AccountStatusGraph({ rows }: { rows: Array<{ name: string; currency: string; value: number; exact: string }> }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="dashboard-account-bars">
      {rows.map((row, index) => {
        const percent = row.value > 0 ? Math.max(4, (row.value / max) * 100) : 0;
        const isReceivable = row.name.startsWith("مشتریان");
        return (
          <div className="dashboard-account-row" key={`${row.name}-${row.currency}`}>
            <div className="dashboard-account-label">
              <strong>{row.name}</strong>
              <span>{`${row.exact} ${row.currency}`}</span>
            </div>
            <div className="dashboard-account-track" aria-hidden="true">
              <span
                className="dashboard-account-fill"
                style={{
                  width: `${percent}%`,
                  background: isReceivable ? "linear-gradient(90deg, #0f766e, #14b8a6)" : "linear-gradient(90deg, #b45309, #f59e0b)",
                  transitionDelay: `${index * 40}ms`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 18, fontSize: 14, alignItems: "center" }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span style={{ fontWeight: 700, textAlign: "left", direction: "ltr" }}>{value}</span>
    </div>
  );
}

function Metric({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "var(--surface-2)",
        borderRadius: 8,
        padding: "12px 10px",
        border: "1px solid var(--border)",
        color: "inherit",
        textAlign: "right",
        cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 13, color: "var(--muted)" }}>{label}</div>
    </button>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 13 }}>{text}</div>;
}

function ChartLegend({ rows }: { rows: Array<{ label: string; color: string }> }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px 14px",
        padding: "0 18px 18px",
        alignItems: "center",
      }}
    >
      {rows.map((row) => (
        <span key={row.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
          {row.label}
        </span>
      ))}
    </div>
  );
}
