import { Link } from "react-router-dom";
import { Building2, ReceiptText, Store, Tags } from "lucide-react";

const sections = [
  { title: "پروژې برخه", href: "/projects/list", Icon: Building2 },
  { title: "فروش تفصیل", href: "/sales?customerType=sales_customer&salesDetail=1&allDates=1", Icon: ReceiptText },
  { title: "د دوکانونو برخه", href: "/shops", Icon: Store },
  { title: "د واحدونو ډولونه", href: "/unit-types", Icon: Tags },
];

export default function ProjectHubPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">د پروژې برخه</h1>
          <p className="page-sub">پروژې، دوکانونه او د واحدونو ډولونه په همدې برخه کې اداره کېږي.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {sections.map(({ title, href, Icon }) => (
          <Link
            key={href}
            to={href}
            className="card"
            style={{
              minHeight: 132,
              padding: 24,
              color: "var(--text)",
              textDecoration: "none",
              borderRadius: 8,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 18,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
            <div
              style={{
                width: 56,
                height: 56,
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
              <Icon size={26} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
