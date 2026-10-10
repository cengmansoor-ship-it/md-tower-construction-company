import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Mail, Lock, Eye, EyeOff, RotateCcw } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, ApiError, type CompanySettings } from "../lib/api";
import { PASSWORD_POLICY_TEXT, passwordValidationMessage } from "../lib/passwordPolicy";
import { cleanCompanyName } from "../lib/companyName";

export default function LoginPage() {
  const { user, loading, login, justLoggedIn } = useAuth();
  const { data: settings } = useQuery({
    queryKey: ["settings-public"],
    queryFn: () => api.get<CompanySettings>("/settings/public"),
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"login" | "recovery">("login");
  const [recovery, setRecovery] = useState({ username: "", newPassword: "", confirmNewPassword: "" });
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const recoveryPasswordError = recovery.newPassword ? passwordValidationMessage(recovery.newPassword, recovery.username) : null;
  const companyName = cleanCompanyName(settings?.companyName);

  function backendStartupDetails(err: ApiError): string {
    const payload = err.details && typeof err.details === "object" ? (err.details as Record<string, unknown>) : null;
    const nested = payload?.details && typeof payload.details === "object" ? (payload.details as Record<string, unknown>) : payload;
    const parts: string[] = ["شا برخه چالانه نه ده. لومړی د Backend فولډر کې npm run dev ووهه، بيا MySQL او Backend/.env وګوره."];
    const startTail = typeof nested?.startLogTail === "string" ? nested.startLogTail.trim() : "";
    const runtimeTail = typeof nested?.runtimeLogTail === "string" ? nested.runtimeLogTail.trim() : "";
    if (startTail) parts.push(`د پیل لاګ:\n${startTail}`);
    if (runtimeTail) parts.push(`د شا برخې لاګ:\n${runtimeTail}`);
    return parts.join("\n\n");
  }

  if (!loading && user && justLoggedIn) return <Navigate to="/welcome" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 423) {
        setError("ستاسو حساب د ناسمو هڅو له امله بند شوی دی. مهرباني وکړئ له اداره کوونکي سره اړیکه ونیسئ.");
      } else if (err instanceof ApiError && err.status >= 500) {
        setError(`${err.message || "شا برخه چالانه نه شوه. MySQL، Backend/.env او د Backend کړکۍ وګوره."}\n\n${backendStartupDetails(err)}`);
      } else if (err instanceof ApiError) {
        setError("کارن نوم یا پټنوم سم نه دی");
      } else {
        setError("د سرور سره وصل کیدل ونشول");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRecovery() {
    return api.post<{ username: string; fullName: string }>("/auth/recover-credentials", recovery);
  }

  function recoveryValidationMessage(): string | null {
    if (!recovery.username.trim()) return "کارن نوم اړین دی.";
    if (!recovery.newPassword) return "نوی پټنوم اړین دی.";
    if (recoveryPasswordError) return recoveryPasswordError;
    if (!recovery.confirmNewPassword) return "نوی پټنوم بیا ولیکئ.";
    if (recovery.newPassword !== recovery.confirmNewPassword) return "نوی پټنوم یو شان نه دی.";
    return null;
  }

  async function handleRecoverySubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRecoveryMessage(null);
    const validationError = recoveryValidationMessage();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      let updated;
      try {
        updated = await submitRecovery();
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          await api.get<CompanySettings>("/settings/public");
          updated = await submitRecovery();
        } else {
          throw err;
        }
      }
      setUsername(updated.username);
      setPassword(recovery.newPassword);
      setRecovery({ username: "", newPassword: "", confirmNewPassword: "" });
      setMode("login");
      setRecoveryMessage("کارن نوم او نوی پټنوم خوندي شول. اوس د ننوتلو تڼۍ ووهئ.");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "د حساب معلومات بدل نشول.");
      } else {
        setError("د سرور سره وصل کیدل ونشول");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div dir="rtl" style={{ minHeight: "100vh", display: "flex", background: "var(--surface)" }}>
      {/* Right side (form) — first in RTL reading order */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 420, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>
              {companyName}
            </h1>
            <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.7 }}>
              د مدیریت سیسټم ته ننوتل — خپل کارن نوم او پټنوم دننه کړئ.
            </p>
          </div>

          {error && (
            <div
              style={{
                background: "var(--danger-light)",
                color: "var(--danger)",
                padding: "12px 16px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                marginBottom: 20,
                border: "1px solid var(--danger)",
                opacity: 0.9,
                whiteSpace: "pre-wrap",
                lineHeight: 1.8,
              }}
            >
              {error}
            </div>
          )}

          {recoveryMessage && (
            <div
              style={{
                background: "var(--success-light)",
                color: "var(--success)",
                padding: "12px 16px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
                marginBottom: 20,
                border: "1px solid rgba(18, 183, 106, 0.35)",
              }}
            >
              {recoveryMessage}
            </div>
          )}

          {mode === "login" ? (
          <form onSubmit={handleSubmit} autoComplete="off">
            <div style={{ marginBottom: 20 }}>
              <label className="form-label">کارن نوم</label>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted-light)" }}>
                  <Mail size={18} />
                </div>
                <input
                  className="form-input"
                  style={{ paddingRight: 44 }}
                  name="arabian-login-user"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  required
                  placeholder="کارن نوم"
                />
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label className="form-label">پټنوم</label>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted-light)" }}>
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  className="form-input"
                  style={{ paddingRight: 44, paddingLeft: 44 }}
                  name="arabian-login-secret"
                  autoComplete="new-password"
                  autoCorrect="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  title={showPassword ? "پټنوم پټول" : "پټنوم ښکاره کول"}
                  aria-label={showPassword ? "پټنوم پټول" : "پټنوم ښکاره کول"}
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted-light)", cursor: "pointer", border: "none", background: "transparent", padding: 4, display: "flex" }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", height: 50, fontSize: 16, borderRadius: 8, fontWeight: 600 }}
            >
              {submitting ? "لطفاً انتظار وکړئ..." : "سیسټم ته ننوتل"}
            </button>
          </form>
          ) : (
          <form onSubmit={handleRecoverySubmit} autoComplete="off" noValidate>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label className="form-label">کارن نوم</label>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted-light)" }}>
                    <Mail size={18} />
                  </div>
                  <input
                    className="form-input"
                    style={{ paddingRight: 44 }}
                    value={recovery.username}
                    onChange={(event) => setRecovery((f) => ({ ...f, username: event.target.value }))}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="کارن نوم"
                  />
                </div>
              </div>
              <div>
                <label className="form-label">نوی پټنوم</label>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted-light)" }}>
                    <Lock size={18} />
                  </div>
                  <input
                    className="form-input"
                    style={{ paddingRight: 44, paddingLeft: 44 }}
                    type={showRecoveryPassword ? "text" : "password"}
                    value={recovery.newPassword}
                    onChange={(event) => setRecovery((f) => ({ ...f, newPassword: event.target.value }))}
                    autoComplete="new-password"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="قوي پټنوم"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRecoveryPassword((value) => !value)}
                    title={showRecoveryPassword ? "پټنوم پټول" : "پټنوم ښکاره کول"}
                    aria-label={showRecoveryPassword ? "پټنوم پټول" : "پټنوم ښکاره کول"}
                    style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted-light)", cursor: "pointer", border: "none", background: "transparent", padding: 4, display: "flex" }}
                  >
                    {showRecoveryPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <div className={`password-policy-hint ${recoveryPasswordError ? "is-error" : "is-ok"}`}>
                  {recoveryPasswordError || (recovery.newPassword ? PASSWORD_POLICY_TEXT : "نوی پټنوم ولیکئ.")}
                </div>
              </div>
              <div>
                <label className="form-label">نوی پټنوم بیا ولیکئ</label>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted-light)" }}>
                    <Lock size={18} />
                  </div>
                  <input
                    className="form-input"
                    style={{ paddingRight: 44 }}
                    type={showRecoveryPassword ? "text" : "password"}
                    value={recovery.confirmNewPassword}
                    onChange={(event) => setRecovery((f) => ({ ...f, confirmNewPassword: event.target.value }))}
                    autoComplete="new-password"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="نوی پټنوم بیا ولیکئ"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", height: 50, fontSize: 16, borderRadius: 8, fontWeight: 600, marginTop: 20 }}
            >
              {submitting ? "لطفاً انتظار وکړئ..." : "نوی پټنوم خوندي کول"}
            </button>
          </form>
          )}

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setMode((value) => (value === "login" ? "recovery" : "login"));
              setError(null);
              setRecoveryMessage(null);
            }}
            style={{ width: "100%", justifyContent: "center", marginTop: 14 }}
          >
            <RotateCcw size={15} />
            {mode === "login" ? "کارن نوم یا پټنوم هېر شوی؟" : "بېرته ننوتلو ته تلل"}
          </button>

          <div
            style={{
              marginTop: 24,
              borderRadius: 8,
              background: "var(--surface-2)",
              padding: 14,
              textAlign: "center",
              fontSize: 13,
              color: "var(--muted)",
            }}
          >
            د نوي حساب جوړول یوازې د اداره کوونکي له لارې کیږي.
          </div>
        </div>
      </div>

      {/* Left side — branded dark panel with decorative grid */}
      <div
        className="login-brand-panel"
        style={{
          flex: 1,
          background: "var(--sidebar-bg)",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <svg
          width="540"
          height="540"
          viewBox="0 0 540 540"
          fill="none"
          style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: 0.06 }}
        >
          <defs>
            <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
              <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#fff" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="540" height="540" fill="url(#grid)" />
        </svg>

        <div style={{ position: "relative", zIndex: 1, maxWidth: 340, textAlign: "center", padding: "0 32px" }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 28px",
            }}
          >
            {settings?.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt="لوګو"
                style={{ width: 78, height: 78, objectFit: "contain", borderRadius: "50%" }}
              />
            ) : (
              <Building2 size={44} color="#fff" />
            )}
          </div>
          <h2 style={{ color: "#fff", fontSize: 26, fontWeight: 700, marginBottom: 16 }}>{companyName}</h2>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 15, lineHeight: 1.8 }}>
            د پروژو، پلورنو، کرایې، تدارکاتو، کارکوونکو او مالي حسابونو بشپړ مدیریت — ټول په یو ځای کې.
          </p>
        </div>
      </div>

      <style>{`
        .login-brand-panel { display: none; }
        @media (min-width: 1024px) {
          .login-brand-panel { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
