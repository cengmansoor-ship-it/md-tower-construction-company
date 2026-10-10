import { Link } from "react-router-dom";
import { ArrowLeftRight, KeyRound, Receipt, ShoppingCart, Store, UserRound } from "lucide-react";

const customerSections = [
  {
    title: "د اجناسو د خریداري مشتریان",
    href: "/parties?type=supplier",
    Icon: ShoppingCart,
  },
  {
    title: "د فروش مشتریان",
    href: "/parties?type=sales_customer",
    Icon: Store,
  },
  {
    title: "کرایه داران",
    href: "/parties?type=tenant",
    Icon: KeyRound,
  },
  {
    title: "د فروش رسیدات",
    href: "/sales?customerType=sales_customer&salesDetail=1&allDates=1",
    Icon: Receipt,
  },
  {
    title: "صرافي مشتریان",
    href: "/parties?type=exchange_dealer",
    Icon: ArrowLeftRight,
  },
  {
    title: "بازار / انفرادي مشتریان",
    href: "/parties?type=market_individual",
    Icon: UserRound,
  },
];

export default function CustomersHubPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">د مشتریانو برخه</h1>
          <p className="page-sub">هر ډول مشتری خپل جلا کهاته او ثبت لري.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {customerSections.map(({ title, href, Icon }) => (
          <Link
            key={href}
            to={href}
            className="card"
            style={{
              minHeight: 132,
              padding: 22,
              textDecoration: "none",
              color: "var(--text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.6 }}>{title}</div>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 8,
                background: "var(--primary-light)",
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
