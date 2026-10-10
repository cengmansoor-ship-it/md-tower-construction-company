import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type UnitType } from "../lib/api";
import { Check, Edit2, Plus, Tags, X } from "lucide-react";
import { visibleText } from "../lib/labels";

export default function UnitTypesPage() {
  const qc = useQueryClient();
  const { data: types } = useQuery({ queryKey: ["unit-types"], queryFn: () => api.get<UnitType[]>("/unit-types") });
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: number; name: string; isActive: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => api.post<UnitType>("/unit-types", { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["unit-types"] }); setName(""); setError(null); },
    onError: (err) => setError(err instanceof Error ? err.message : "ستونزه رامنځته شوه"),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.put<UnitType>(`/unit-types/${editing?.id}`, { name: editing?.name, isActive: editing?.isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unit-types"] });
      setEditing(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "ستونزه رامنځته شوه"),
  });

  return (
    <div>
      <p className="page-title">د واحدونو ډولونه</p>
      <p className="page-sub">د ملکیت واحدونو ډول مالیکانه لیست</p>

      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Plus size={16} />نوی ډول
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input className="form-input" placeholder="لکه: دوکان، کور، ګدام" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && createMutation.mutate()} style={{ flex: 1, maxWidth: 340 }} />
          <button className="btn btn-primary" onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending}>
            <Plus size={15} />زیاتول
          </button>
        </div>
        {error && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</div>}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <Tags size={15} />ثبت شوي ډولونه ({types?.length ?? 0})
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {types?.map((t) => (
            <div key={t.id} className="list-card" style={{ minWidth: 220, display: "grid", gap: 10 }}>
              {editing?.id === t.id ? (
                <>
                  <input className="form-input" value={editing.name} onChange={(event) => setEditing((value) => value ? { ...value, name: event.target.value } : value)} />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 13 }}>
                    <input type="checkbox" checked={editing.isActive} onChange={(event) => setEditing((value) => value ? { ...value, isActive: event.target.checked } : value)} />
                    فعال دی
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-primary btn-sm" disabled={!editing.name.trim() || updateMutation.isPending} onClick={() => updateMutation.mutate()}>
                      <Check size={14} /> ساتل
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => setEditing(null)}>
                      <X size={14} /> لغوه
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <strong>{visibleText(t.name, "ډول")}</strong>
                    <span className={`badge ${t.isActive ? "badge-success" : "badge-muted"}`}>{t.isActive ? "فعال" : "غیرفعال"}</span>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => setEditing({ id: t.id, name: t.name, isActive: t.isActive })}>
                    <Edit2 size={14} /> اصلاح
                  </button>
                </>
              )}
            </div>
          ))}
          {types?.length === 0 && <span style={{ color: "var(--muted)", fontSize: 13 }}>هیڅ ډول نشته.</span>}
        </div>
      </div>
    </div>
  );
}
