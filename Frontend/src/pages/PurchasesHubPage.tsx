import { Link } from "react-router-dom";
import { ArrowLeftRight, RotateCcw, ShoppingCart } from "lucide-react";

const sections = [
  {
    title: "د اجناسو خریداري",
    description: "نوی جنس رانیول، د خریداري بیل جوړول او عرضه کوونکي ته اتومات کهاته رسول.",
    href: "/purchases/list",
    Icon: ShoppingCart,
  },
  {
    title: "بازار/انفرادي مشتریان",
    description: "د بازار او انفرادي مشتریانو راکړه او ورکړه دلته ثبت کړئ؛ عمومي کهاته په مشتریانو برخه کې پاتې ده.",
    href: "/purchases/market-transactions",
    Icon: ArrowLeftRight,
  },
  {
    title: "واپسي بیل",
    description: "هغه اجناس چې بېرته ورکول کېږي ثبت او د خریداري مشتری حساب اتومات کمول.",
    href: "/purchase-returns",
    Icon: RotateCcw,
  },
];

export default function PurchasesHubPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">د اجناسو خریداري برخه</h1>
          <p className="page-sub">خریداري، بازار/انفرادي مشتریان او واپسي بیل په یوه منظم ځای کې.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {sections.map(({ title, description, href, Icon }) => (
          <Link key={href} to={href} className="card interactive-card" style={{ minHeight: 152, padding: 22, textDecoration: "none", color: "var(--text)", borderRadius: 8, display: "flex", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{title}</div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.8 }}>{description}</div>
            </div>
            <div style={{ width: 54, height: 54, borderRadius: 8, background: "rgba(247, 144, 9, 0.12)", color: "#B45309", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={25} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
