import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Menu } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, type CompanySettings } from "../lib/api";
import { cleanCompanyName } from "../lib/companyName";

const AUTO_ADVANCE_MS = 10000;

function settingText(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export default function WelcomePage() {
  const navigate = useNavigate();
  const { acknowledgeWelcome } = useAuth();
  const advancedRef = useRef(false);
  const { data: settings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: () => api.get<CompanySettings>("/settings"),
  });
  const companyName = cleanCompanyName(settings?.companyName);
  const titlePashto = settingText(settings?.welcomeTitlePashto, "ښه راغلاست");
  const subtitlePashto = settingText(settings?.welcomeSubtitlePashto, companyName);
  const descriptionPashto = settingText(
    settings?.welcomeDescriptionPashto,
    "د پروژو، فروشاتو، کرایې، تدارکاتو، کارکوونکو او مالي حسابونو مرکزي مدیریت.",
  );
  const titleEnglish = settingText(settings?.welcomeTitleEnglish, "Welcome");
  const subtitleEnglish = settingText(settings?.welcomeSubtitleEnglish, "To Our Company");
  const descriptionEnglish = settingText(
    settings?.welcomeDescriptionEnglish,
    "Central management for projects, sales, rentals, procurement, employees, and accounts.",
  );

  function advance() {
    if (advancedRef.current) return;
    advancedRef.current = true;
    acknowledgeWelcome();
    navigate("/", { replace: true });
  }

  useEffect(() => {
    function removeBrandBadges() {
      const root = document.querySelector(".welcome-screen");
      if (!root) return;
      root.querySelectorAll(".welcome-copy > span").forEach((element) => element.remove());
    }

    removeBrandBadges();
    const observer = new MutationObserver(removeBrandBadges);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const timer = setTimeout(advance, AUTO_ADVANCE_MS);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter") {
        clearTimeout(timer);
        advance();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div dir="rtl" className="welcome-screen" role="status" aria-live="polite">
      <section className="welcome-panel">
        <header className="welcome-nav">
          <div className="welcome-brand">
            <span className="welcome-logo">
              {settings?.logoUrl ? <img src={settings.logoUrl} alt="لوګو" /> : <Building2 size={28} />}
            </span>
            <span>{companyName}</span>
          </div>
          <nav className="welcome-links" aria-label="د ښه راغلاست برخې">
            <span>کور</span>
            <span>خدمتونه</span>
            <span>معلومات</span>
            <span>اړیکه</span>
          </nav>
          <Menu className="welcome-menu-icon" size={32} aria-hidden="true" />
        </header>

        <div className="welcome-content">
          <div className="welcome-language-grid">
            <div className="welcome-copy welcome-copy-pashto">
              <h1>{titlePashto}</h1>
              <h2>{subtitlePashto}</h2>
              <p>{descriptionPashto}</p>
            </div>
            <div className="welcome-copy welcome-copy-english" dir="ltr" lang="en">
              <h1>{titleEnglish}</h1>
              <h2>{subtitleEnglish}</h2>
              <p>{descriptionEnglish}</p>
            </div>
          </div>

          <button onClick={advance} className="btn btn-primary welcome-action">
            دوام ورکړئ
          </button>
        </div>
      </section>
    </div>
  );
}
