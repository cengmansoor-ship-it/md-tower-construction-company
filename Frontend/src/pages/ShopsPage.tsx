import { Link } from "react-router-dom";
import { KeyRound, ReceiptText } from "lucide-react";

const sections = [
  { title: "د دوکانونو فروش", href: "/sales?unitType=shop", Icon: ReceiptText },
  { title: "د دوکانونو کرایه", href: "/rentals?unitType=shop", Icon: KeyRound },
];

export default function ShopsPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">د دوکانونو برخه</h1>
          <p className="page-sub">د دوکانونو فروش او کرایه جلا جلا اداره کېږي.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {sections.map(({ title, href, Icon }) => (
          <Link
            key={href}
            to={href}
            className="card"
            style={{
              minHeight: 128,
              padding: 24,
              textDecoration: "none",
              color: "var(--text)",
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
                background: "var(--primary-light)",
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
