import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Permission, type RoleWithPermissions } from "../lib/api";
import { ShieldPlus } from "lucide-react";
import { permissionLabel, roleLabel } from "../lib/labels";

export default function RolesPage() {
  const qc = useQueryClient();
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => api.get<RoleWithPermissions[]>("/roles") });
  const { data: permissions } = useQuery({ queryKey: ["permissions"], queryFn: () => api.get<Permission[]>("/roles/permissions") });

  const [newRole, setNewRole] = useState({ name: "", description: "" });
  const createRoleMutation = useMutation({
    mutationFn: () => api.post("/roles", newRole),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles"] }); setNewRole({ name: "", description: "" }); },
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: ({ roleId, permissionKeys }: { roleId: number; permissionKeys: string[] }) =>
      api.put(`/roles/${roleId}/permissions`, { permissionKeys }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });

  function togglePermission(role: RoleWithPermissions, key: string) {
    const next = role.permissions.includes(key) ? role.permissions.filter((p) => p !== key) : [...role.permissions, key];
    updatePermissionsMutation.mutate({ roleId: role.id, permissionKeys: next });
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">رولونه او واکونه</h1>
        <div className="page-breadcrumb">
          <span>ډشبورډ</span>
          <span>/</span>
          <span>رولونه</span>
        </div>
      </div>

      {/* Create role */}
      <div className="card" style={{ marginBottom: 28 }}>
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldPlus size={18} /> نوی رول
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            <div style={{ flex: "1 1 200px" }}>
              <label className="form-label">نوم</label>
              <input className="form-input" placeholder="مسوول" value={newRole.name} onChange={(e) => setNewRole((r) => ({ ...r, name: e.target.value }))} />
            </div>
            <div style={{ flex: "2 1 300px" }}>
              <label className="form-label">تشریح</label>
              <input className="form-input" placeholder="د رول تشریح" value={newRole.description} onChange={(e) => setNewRole((r) => ({ ...r, description: e.target.value }))} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button className="btn btn-primary" onClick={() => createRoleMutation.mutate()} disabled={!newRole.name || createRoleMutation.isPending}>
                جوړول
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Roles list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {roles?.map((role) => (
          <div key={role.id} className="card">
            <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{roleLabel(role.name)}</div>
                {role.description && !/[A-Za-z]/.test(role.description) && <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 4, fontWeight: 500 }}>{role.description}</div>}
              </div>
              <span className="badge badge-muted" style={{ fontSize: 13 }}>{role.permissions.length} واکونه</span>
            </div>
            <div className="card-body">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {permissions?.map((p) => {
                  const active = role.permissions.includes(p.key);
                  return (
                    <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 6, border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`, background: active ? "var(--primary-light)" : "var(--surface-2)", cursor: "pointer", fontSize: 14, fontWeight: active ? 600 : 500, color: active ? "var(--primary-dark)" : "var(--muted)" }}>
                      <input type="checkbox" checked={active} onChange={() => togglePermission(role, p.key)} style={{ accentColor: "var(--primary)", width: 16, height: 16 }} />
                      {permissionLabel(p.key)}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
