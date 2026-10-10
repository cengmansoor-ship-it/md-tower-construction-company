import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiBaseUrl, type CompanySettings, type SystemBackupResult } from "../lib/api";
import { useAuth } from "../lib/auth";
import { applyCompanyTitle } from "../lib/companyName";
import { Download, Save, Upload } from "lucide-react";

export default function SettingsPage() {
  const { hasRole } = useAuth();
  const canManage = hasRole("admin");
  const qc = useQueryClient();

  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => api.get<CompanySettings>("/settings") });

  const [form, setForm] = useState<Partial<CompanySettings>>({});
  const [savedMsg, setSavedMsg] = useState(false);
  const [backupResult, setBackupResult] = useState<SystemBackupResult | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  function handleSettingsSaved(updated: CompanySettings) {
    qc.setQueryData(["settings"], updated);
    qc.setQueryData(["settings-public"], updated);
    qc.invalidateQueries({ queryKey: ["settings"] });
    qc.invalidateQueries({ queryKey: ["settings-public"] });
    setForm(updated);
    applyCompanyTitle(updated.companyName);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  }

  const saveMutation = useMutation({
    mutationFn: () => api.put<CompanySettings>("/settings", form),
    onSuccess: handleSettingsSaved,
  });

  const logoUploadMutation = useMutation({
    mutationFn: (dataUrl: string) => api.post<CompanySettings>("/settings/logo", { dataUrl }),
    onSuccess: handleSettingsSaved,
  });

  const backupMutation = useMutation({
    mutationFn: () => api.post<SystemBackupResult>("/settings/backup/mysql"),
    onSuccess: (result) => {
      setBackupResult(result);
      setBackupError(null);
    },
    onError: (error) => {
      setBackupResult(null);
      setBackupError(error instanceof Error ? error.message : "د بیکپ جوړول ناکام شول.");
    },
  });

  function importLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.alert("یوازې د انځور فایل د لوګو لپاره وټاکئ.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      window.alert("لوګو باید له ۲MB څخه کوچنی وي.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") logoUploadMutation.mutate(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function downloadLatestBackup() {
    window.open(`${apiBaseUrl}/settings/backup/mysql/download`, "_blank", "noopener,noreferrer");
  }

  return (
    <div style={{ maxWidth: 920 }}>
      <p className="page-title">عمومي تنظیمات</p>
      <p className="page-sub">د شرکت معلومات او د ښه راغلاست پاڼه</p>

      {/* Company info */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
          د شرکت معلومات
        </div>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label className="form-label">د شرکت نوم</label>
            <input className="form-input" disabled={!canManage} value={form.companyName ?? ""} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">د شرکت شعار</label>
            <input className="form-input" disabled={!canManage} value={form.slogan ?? ""} onChange={(e) => setForm((f) => ({ ...f, slogan: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">د مالي کال پیل میاشت</label>
            <input className="form-input" type="number" min={1} max={12} disabled={!canManage} value={form.fiscalYearStartMonth ?? 1} onChange={(e) => setForm((f) => ({ ...f, fiscalYearStartMonth: Number(e.target.value) }))} style={{ maxWidth: 120 }} />
          </div>
          <div>
            <label className="form-label">د شرکت لوګو / نښان پته</label>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <input
                className="form-input"
                disabled={!canManage}
                placeholder="https://... یا /assets/logo.png"
                value={form.logoUrl ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                style={{ flex: 1 }}
              />
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                style={{ display: "none" }}
                onChange={(event) => {
                  importLogo(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                className="btn btn-outline"
                disabled={!canManage || logoUploadMutation.isPending}
                onClick={() => logoInputRef.current?.click()}
              >
                <Upload size={15} />
                {logoUploadMutation.isPending ? "پورته کیږي..." : "لوګو ایمپورټ"}
              </button>
              {form.logoUrl ? (
                <img
                  src={form.logoUrl}
                  alt="لوګو"
                  style={{ width: 54, height: 54, borderRadius: 8, border: "1px solid var(--border)", objectFit: "contain", padding: 4, background: "#fff" }}
                />
              ) : null}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>دا لوګو د کهاتو د چاپ تڼۍ تر څنګ ښکاري.</div>
          </div>
          <div>
            <label className="form-label">پته</label>
            <input className="form-input" disabled={!canManage} value={form.address ?? ""} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label className="form-label">تلیفون</label>
              <input className="form-input" disabled={!canManage} value={form.phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">پیغام شمېره</label>
              <input className="form-input" disabled={!canManage} value={form.whatsapp ?? ""} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label className="form-label">بریښنالیک</label>
              <input className="form-input" disabled={!canManage} value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">برېښنايي پاڼه</label>
              <input className="form-input" disabled={!canManage} value={form.website ?? ""} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
            </div>
          </div>
          {canManage && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 4 }}>
              <button className="btn btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                <Save size={15} />
                {saveMutation.isPending ? "..." : "خوندي کول"}
              </button>
              {savedMsg && <span style={{ color: "var(--success)", fontSize: 13 }}>✓ خوندي شو</span>}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
          د بیکپ برخه
        </div>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.9 }}>
            دلته د ټول سیسټم بشپړ ډیټابیس بیکپ جوړېږي. وروستی فایل تل په <span dir="ltr">Backup/latest.sql</span> کې تازه کېږي او په خالي ډیټابیس کې د راوړلو لپاره چمتو وي.
          </div>
          {canManage && (
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={() => backupMutation.mutate()} disabled={backupMutation.isPending}>
                <Save size={15} />
                {backupMutation.isPending ? "بیکپ جوړېږي..." : "بیکپ جوړول"}
              </button>
              <button className="btn btn-outline" type="button" onClick={downloadLatestBackup}>
                <Download size={15} />
                وروستی فایل ښکته کول
              </button>
            </div>
          )}
          {backupResult ? (
            <div style={{ background: "var(--success-light)", color: "var(--success)", borderRadius: 8, padding: "12px 14px", fontSize: 13, lineHeight: 1.9 }}>
              بیکپ جوړ شو: <span dir="ltr">{backupResult.latestFileName}</span>، اندازه: <span dir="ltr">{backupResult.bytes}</span> بایټ
            </div>
          ) : null}
          {backupError ? (
            <div style={{ background: "var(--danger-light)", color: "var(--danger)", borderRadius: 8, padding: "12px 14px", fontSize: 13, lineHeight: 1.9 }}>
              {backupError}
            </div>
          ) : null}
        </div>
      </div>

      <div id="welcome-settings" className="card" style={{ padding: 24 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
          د ښه راغلاست پاڼه
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ fontWeight: 900, color: "var(--primary)" }}>پښتو برخه</div>
            <div>
              <label className="form-label">سرلیک</label>
              <input className="form-input" disabled={!canManage} value={form.welcomeTitlePashto ?? ""} onChange={(e) => setForm((f) => ({ ...f, welcomeTitlePashto: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">لنډ سرلیک</label>
              <input className="form-input" disabled={!canManage} value={form.welcomeSubtitlePashto ?? ""} onChange={(e) => setForm((f) => ({ ...f, welcomeSubtitlePashto: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">تشریح</label>
              <textarea className="form-input" rows={4} disabled={!canManage} value={form.welcomeDescriptionPashto ?? ""} onChange={(e) => setForm((f) => ({ ...f, welcomeDescriptionPashto: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ fontWeight: 900, color: "var(--primary)" }}>انګریزي برخه</div>
            <div>
              <label className="form-label">سرلیک</label>
              <input className="form-input" dir="ltr" disabled={!canManage} value={form.welcomeTitleEnglish ?? ""} onChange={(e) => setForm((f) => ({ ...f, welcomeTitleEnglish: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">لنډ سرلیک</label>
              <input className="form-input" dir="ltr" disabled={!canManage} value={form.welcomeSubtitleEnglish ?? ""} onChange={(e) => setForm((f) => ({ ...f, welcomeSubtitleEnglish: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">تشریح</label>
              <textarea className="form-input" dir="ltr" rows={4} disabled={!canManage} value={form.welcomeDescriptionEnglish ?? ""} onChange={(e) => setForm((f) => ({ ...f, welcomeDescriptionEnglish: e.target.value }))} />
            </div>
          </div>
        </div>
        {canManage && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 18 }}>
            <button className="btn btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save size={15} />
              {saveMutation.isPending ? "..." : "خوندي کول"}
            </button>
            {savedMsg && <span style={{ color: "var(--success)", fontSize: 13 }}>✓ خوندي شو</span>}
          </div>
        )}
      </div>
    </div>
  );
}
