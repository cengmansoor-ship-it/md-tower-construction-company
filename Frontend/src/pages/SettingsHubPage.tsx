import { Link, useSearchParams } from "react-router-dom";
import { FileClock, Settings, ShieldCheck, Trash2, Users } from "lucide-react";
import { useAuth } from "../lib/auth";

const sections = [
  { title: "د سیستم عمومي تنظیمات", href: "/settings/system", Icon: Settings, adminOnly: false },
  { title: "کاروونکي", href: "/settings/users", Icon: Users, adminOnly: true },
  { title: "رولونه", href: "/settings/roles", Icon: ShieldCheck, adminOnly: true },
  { title: "کثافت داني", href: "/settings/trash", Icon: Trash2, adminOnly: true },
  { title: "د بدلونونو راپور", href: "/settings/audit-log", Icon: FileClock, adminOnly: true },
];

export default function SettingsHubPage() {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const visibleSections = sections.filter((section) => (!section.adminOnly || isAdmin) && (!q || section.title.toLowerCase().includes(q)));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">عمومي تنظیمات</h1>
          <p className="page-sub">د سیستم عمومي تنظیمات، کاروونکي، رولونه او د بدلونونو راپور.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {visibleSections.map(({ title, href, Icon }) => (
          <Link
            key={href}
            to={href}
            className="card"
            style={{
              minHeight: 124,
              padding: 22,
              textDecoration: "none",
              color: "var(--text)",
              borderRadius: 8,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 800 }}>{title}</div>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 8,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon size={24} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
