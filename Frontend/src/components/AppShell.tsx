import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BookText,
  Building2,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Handshake,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Minus,
  Moon,
  Plus,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sun,
  Users,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, type CompanySettings } from "../lib/api";
import { primaryRoleLabel, userDisplayName } from "../lib/labels";
import { applyDocumentLanguage, type AppLanguage } from "../lib/language";
import { cleanCompanyName } from "../lib/companyName";

const navItems = [
  { to: "/", label: "ډشبورډ", icon: LayoutDashboard, end: true },
  { to: "/journal", label: "روزنامچه", icon: BookText, end: false, adminOnly: true },
  { to: "/customers", label: "د مشتریانو برخه", icon: Users, end: false },
  { to: "/projects", label: "د پروژې برخه", icon: Building2, end: false },
  { to: "/purchases", label: "د اجناسو خریداري", icon: ShoppingCart, end: false },
  { to: "/expenses", label: "د مصارفاتو برخه", icon: Receipt, end: false },
  { to: "/partners", label: "د شریکانو برخه", icon: Handshake, end: false },
  { to: "/haji-ledger", label: "د حاجي صاحب کهاته", icon: BookText, end: false },
  { to: "/attendance", label: "حاضري", icon: CalendarCheck, end: false },
  { to: "/reports/general", label: "عمومي راپور", icon: BarChart3, end: false },
  { to: "/kafil", label: "د کفیل مدیریت", icon: ShieldCheck, end: false, adminOnly: true },
  { to: "/settings", label: "عمومي تنظیمات", icon: Settings, end: false },
];

const FONT_SCALE_STORAGE_KEY = "arabian-d-font-scale";
const THEME_STORAGE_KEY = "arabian-d-theme";
const LANGUAGE_STORAGE_KEY = "arabian-d-language";
const ENTER_NAVIGATION_SELECTOR = ".form-input, .form-select, .shamsi-date-text";

type AppTheme = "light" | "dark";

function clampFontScale(value: number): number {
  return Math.min(1.8, Math.max(0.6, Number(value.toFixed(2))));
}

function readStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

function readStoredLanguage(): AppLanguage {
  if (typeof window === "undefined") return "ps";
  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "fa" ? "fa" : "ps";
}

function isFocusableControl(element: HTMLElement): boolean {
  if (!element.matches(ENTER_NAVIGATION_SELECTOR)) return false;
  if (element.hasAttribute("disabled") || element.getAttribute("aria-hidden") === "true") return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function navbarSearchBasePath(pathname: string): string {
  if (pathname === "/customers" || pathname.startsWith("/parties/")) return "/parties";
  if (pathname === "/projects" || pathname.startsWith("/projects/")) return "/projects/list";
  if (pathname === "/purchases" || pathname.startsWith("/purchases/")) return "/purchases/list";
  if (pathname.startsWith("/purchase-returns")) return "/purchase-returns";
  if (pathname.startsWith("/sales/")) return "/sales";
  if (pathname.startsWith("/rentals/")) return "/rentals";
  if (pathname.startsWith("/employees/")) return "/employees";
  if (pathname.startsWith("/partners/")) return "/partners";
  if (pathname.startsWith("/haji-ledger/")) return "/haji-ledger";
  return pathname || "/";
}

export default function AppShell() {
  const { user, logout, hasRole } = useAuth();
  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<CompanySettings>("/settings"),
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [logoFailed, setLogoFailed] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(readStoredTheme);
  const [language, setLanguage] = useState<AppLanguage>(readStoredLanguage);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [fontScale, setFontScale] = useState(() => {
    if (typeof window === "undefined") return 1;
    const saved = Number(window.localStorage.getItem(FONT_SCALE_STORAGE_KEY));
    return Number.isFinite(saved) && saved > 0 ? clampFontScale(saved) : 1;
  });
  const navigate = useNavigate();
  const location = useLocation();

  const isAdmin = hasRole("admin");
  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);
  const displayName = userDisplayName(user?.fullName, user?.username);
  const displayRole = primaryRoleLabel(user?.roles, isAdmin ? "سوپر آډمین" : "کاروونکی", user?.activeRole);
  const languageLabel = language === "ps" ? "پښتو" : "دري";
  const languageTitle = language === "ps" ? "دري ته اړول" : "پښتو ته اړول";
  const themeTitle = theme === "dark" ? "رڼا حالت" : "تیاره حالت";
  const companyName = cleanCompanyName(settingsData?.companyName);

  useEffect(() => {
    setLogoFailed(false);
  }, [settingsData?.logoUrl]);

  useEffect(() => {
    document.documentElement.style.setProperty("--app-zoom", fontScale.toFixed(2));
    window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, fontScale.toFixed(2));
  }, [fontScale]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language === "fa" ? "fa" : "ps";
    document.documentElement.dataset.language = language;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    window.dispatchEvent(new CustomEvent("arabian-d-language-change", { detail: { language } }));
    return applyDocumentLanguage(language);
  }, [language]);

  useEffect(() => {
    if (!userMenuOpen) return;
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-user-menu]")) return;
      setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [userMenuOpen]);

  useEffect(() => {
    setSearchQuery(new URLSearchParams(location.search).get("q") ?? "");
  }, [location.pathname, location.search]);

  useEffect(() => {
    function handleEnterNavigation(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("[data-enter-submit], .no-enter-navigation, .shamsi-calendar-popover")) return;
      if (!isFocusableControl(target)) return;

      const controls = Array.from(document.querySelectorAll<HTMLElement>(ENTER_NAVIGATION_SELECTOR)).filter(isFocusableControl);
      const currentIndex = controls.indexOf(target);
      if (currentIndex < 0 || controls.length < 2) return;

      event.preventDefault();
      const step = event.shiftKey ? -1 : 1;
      const nextIndex = (currentIndex + step + controls.length) % controls.length;
      const next = controls[nextIndex];
      next?.focus();
      if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) next.select();
    }

    document.addEventListener("keydown", handleEnterNavigation);
    return () => document.removeEventListener("keydown", handleEnterNavigation);
  }, []);

  function handleSearchSubmit(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    const q = searchQuery.trim();
    const basePath = navbarSearchBasePath(location.pathname);
    const params = new URLSearchParams(basePath === location.pathname ? location.search : "");
    if (q) params.set("q", q);
    else params.delete("q");
    const query = params.toString();
    navigate(`${basePath}${query ? `?${query}` : ""}`);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    handleSearchSubmit();
  }

  return (
    <div className="app-zoom-surface flex h-screen w-full overflow-hidden" style={{ background: "var(--bg)" }}>
      <aside
        className="no-print"
        style={{
          width: sidebarOpen ? "var(--sidebar-width)" : "0",
          minWidth: sidebarOpen ? "var(--sidebar-width)" : "0",
          background: "var(--sidebar-bg)",
          transition: "width 0.2s ease, min-width 0.2s ease",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          boxShadow: sidebarOpen ? "1px 0 10px rgba(0,0,0,0.1)" : "none",
          zIndex: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "22px 24px",
            minWidth: "var(--sidebar-width)",
            borderBottom: "1px solid var(--sidebar-border)",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {settingsData?.logoUrl && !logoFailed ? (
              <img
                src={settingsData.logoUrl}
                alt="لوګو"
                onError={() => setLogoFailed(true)}
                style={{ width: 34, height: 34, objectFit: "contain", borderRadius: "50%" }}
              />
            ) : (
              <Building2 size={22} color="#fff" />
            )}
          </div>
          <div style={{ overflow: "hidden" }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, lineHeight: 1.3, whiteSpace: "nowrap" }}>
              {companyName}
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: "0 16px", minWidth: "var(--sidebar-width)" }}>
          <div style={{ color: "var(--sidebar-muted)", fontSize: 11, fontWeight: 600, letterSpacing: 0, padding: "0 12px", marginBottom: 10 }}>
            اصلي لړلیک
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {visibleItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                style={({ isActive }) => ({
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: 500,
                  color: isActive ? "#fff" : "var(--sidebar-text)",
                  background: isActive ? "var(--sidebar-active-bg)" : "transparent",
                  transition: "background 0.15s, color 0.15s",
                })}
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                <item.icon size={19} style={{ flexShrink: 0 }} />
                <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        <div style={{ padding: "16px", minWidth: "var(--sidebar-width)", borderTop: "1px solid var(--sidebar-border)" }}>
          <button
            onClick={() => logout()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--sidebar-text)",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <LogOut size={19} />
            وتل
          </button>
        </div>
      </aside>

      <div className="app-shell-body" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header
          className="no-print"
          style={{
            height: "var(--topbar-height)",
            background: "var(--topbar-bg)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            padding: "0 32px",
            gap: 24,
            flexShrink: 0,
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            zIndex: 30,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20, flex: 1 }}>
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                cursor: "pointer",
                color: "var(--text)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              {sidebarOpen ? <ChevronRight size={20} /> : <Menu size={20} />}
            </button>

            <form onSubmit={handleSearchSubmit} style={{ position: "relative", width: "100%", maxWidth: 400 }}>
              <button
                type="submit"
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--muted-light)",
                  width: 30,
                  height: 30,
                  border: 0,
                  background: "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <Search size={18} />
              </button>
              <input
                type="text"
                placeholder="لټون..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                style={{
                  width: "100%",
                  height: 44,
                  borderRadius: 9999,
                  background: "var(--surface-2)",
                  border: "none",
                  padding: "0 44px 0 20px",
                  fontSize: 14,
                  color: "var(--text)",
                  outline: "none",
                }}
              />
            </form>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="font-size-control" title="د ټول سیستم د لیک اندازه">
              <button type="button" onClick={() => setFontScale((value) => clampFontScale(value - 0.05))} disabled={fontScale <= 0.6} aria-label="لیک کوچنی کول">
                <Minus size={14} />
              </button>
              <input
                type="number"
                min={60}
                max={180}
                step={5}
                value={Math.round(fontScale * 100)}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) setFontScale(clampFontScale(next / 100));
                }}
                aria-label="د لیک سلنه"
              />
              <span className="font-size-symbol">%</span>
              <button type="button" onClick={() => setFontScale((value) => clampFontScale(value + 0.05))} disabled={fontScale >= 1.8} aria-label="لیک غټول">
                <Plus size={14} />
              </button>
            </div>
            <button
              type="button"
              className="app-header-control"
              onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
              title={themeTitle}
              aria-label={themeTitle}
            >
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              type="button"
              className="app-header-control app-language-control"
              data-active-language={language}
              onClick={() => setLanguage((value) => (value === "ps" ? "fa" : "ps"))}
              title={languageTitle}
              aria-label={languageTitle}
            >
              <Languages size={18} />
              <span data-no-translate>{languageLabel}</span>
            </button>
            <div style={{ width: 1, height: 32, background: "var(--border)", margin: "0 4px" }} />
            <div data-user-menu className="app-user-menu">
              <button type="button" className="app-user-button" onClick={() => setUserMenuOpen((value) => !value)}>
                <div className="app-user-meta">
                  <span>{displayName}</span>
                  <small>{displayRole}</small>
                </div>
                <div className="app-user-avatar">{displayName[0] ?? "س"}</div>
                <ChevronDown size={16} color="var(--muted)" />
              </button>
              {userMenuOpen ? (
                <div className="app-user-popover">
                  <div className="app-user-popover-row">
                    <span>نوم</span>
                    <strong>{displayName}</strong>
                  </div>
                  <div className="app-user-popover-row">
                    <span>رول</span>
                    <strong>{displayRole}</strong>
                  </div>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => logout()}>
                    وتل
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="app-main-content" style={{ flex: 1, overflowY: "auto", padding: "32px" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
