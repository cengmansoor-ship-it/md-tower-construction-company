import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ManagedUser, type RoleWithPermissions } from "../lib/api";
import { Eye, EyeOff, Pencil, Save, UserPlus, X } from "lucide-react";
import { roleLabel, userDisplayName } from "../lib/labels";
import { PASSWORD_POLICY_TEXT, passwordValidationMessage } from "../lib/passwordPolicy";
import { useAuth } from "../lib/auth";

export default function UsersPage() {
  const qc = useQueryClient();
  const { refreshUser } = useAuth();
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => api.get<ManagedUser[]>("/users") });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => api.get<RoleWithPermissions[]>("/roles") });

  const [form, setForm] = useState({ username: "", fullName: "", password: "", roleNames: [] as string[] });
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState({ username: "", fullName: "", password: "", roleNames: [] as string[], isActive: true });
  const [editError, setEditError] = useState<string | null>(null);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const passwordError = form.password ? passwordValidationMessage(form.password, form.username) : "پټنوم اړین دی.";
  const editPasswordError = editForm.password ? passwordValidationMessage(editForm.password, editForm.username) : null;

  const createMutation = useMutation({
    mutationFn: () => {
      const currentPasswordError = passwordValidationMessage(form.password, form.username);
      if (currentPasswordError) throw new Error(currentPasswordError);
      return api.post<ManagedUser>("/users", form);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setForm({ username: "", fullName: "", password: "", roleNames: [] }); setError(null); },
    onError: (err) => setError(err instanceof Error ? err.message : "ستونزه رامنځته شوه"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.put(`/users/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingUser) throw new Error("کاروونکی نه دی ټاکل شوی.");
      const currentPasswordError = editForm.password ? passwordValidationMessage(editForm.password, editForm.username) : null;
      if (currentPasswordError) throw new Error(currentPasswordError);
      return api.put<ManagedUser>(`/users/${editingUser.id}`, {
        username: editForm.username,
        fullName: editForm.fullName,
        isActive: editForm.isActive,
        roleNames: editForm.roleNames,
        ...(editForm.password ? { password: editForm.password } : {}),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setEditingUser(null);
      setEditForm({ username: "", fullName: "", password: "", roleNames: [], isActive: true });
      setEditError(null);
      setShowEditPassword(false);
      void refreshUser();
    },
    onError: (err) => setEditError(err instanceof Error ? err.message : "ستونزه رامنځته شوه"),
  });

  const unlockMutation = useMutation({
    mutationFn: (id: number) => api.post(`/users/${id}/unlock`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  function toggleRole(role: string) {
    setForm((f) => ({ ...f, roleNames: f.roleNames.includes(role) ? f.roleNames.filter((r) => r !== role) : [...f.roleNames, role] }));
  }

  function toggleEditRole(role: string) {
    setEditForm((f) => ({ ...f, roleNames: f.roleNames.includes(role) ? f.roleNames.filter((r) => r !== role) : [...f.roleNames, role] }));
  }

  function startEdit(user: ManagedUser) {
    setEditingUser(user);
    setEditForm({ username: user.username, fullName: user.fullName, password: "", roleNames: user.roles, isActive: user.isActive });
    setEditError(null);
    setShowEditPassword(false);
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">کاروونکي</h1>
        <div className="page-breadcrumb">
          <span>ډشبورډ</span>
          <span>/</span>
          <span>کاروونکي</span>
        </div>
      </div>

      {/* Create form */}
      <div className="card" style={{ marginBottom: 28 }}>
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UserPlus size={18} /> نوی کاروونکی
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 20, marginBottom: 20 }}>
            <div><label className="form-label">کارن نوم</label><input className="form-input" name="arabian-new-user-name" autoComplete="off" autoCorrect="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true" placeholder="کارن نوم" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} /></div>
            <div><label className="form-label">بشپړ نوم</label><input className="form-input" name="arabian-new-user-full-name" autoComplete="off" autoCorrect="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true" placeholder="احمد خان" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} /></div>
            <div>
              <label className="form-label">پټنوم</label>
              <div style={{ position: "relative" }}>
                <input className="form-input" style={{ paddingLeft: 44 }} name="arabian-new-user-secret" autoComplete="new-password" autoCorrect="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true" type={showPassword ? "text" : "password"} placeholder="قوي پټنوم" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  title={showPassword ? "پټنوم پټول" : "پټنوم ښکاره کول"}
                  aria-label={showPassword ? "پټنوم پټول" : "پټنوم ښکاره کول"}
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted-light)", cursor: "pointer", border: "none", background: "transparent", padding: 4, display: "flex" }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className={`password-policy-hint ${passwordError ? "is-error" : "is-ok"}`}>
                {passwordError || PASSWORD_POLICY_TEXT}
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="form-label">رولونه</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {roles?.map((r) => (
                <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 6, border: `1px solid ${form.roleNames.includes(r.name) ? "var(--primary)" : "var(--border)"}`, background: form.roleNames.includes(r.name) ? "var(--primary-light)" : "transparent", cursor: "pointer", fontSize: 14 }}>
                  <input type="checkbox" checked={form.roleNames.includes(r.name)} onChange={() => toggleRole(r.name)} style={{ accentColor: "var(--primary)", width: 16, height: 16 }} />
                  {roleLabel(r.name)}
                </label>
              ))}
            </div>
          </div>
          {error && <div style={{ color: "var(--danger)", fontSize: 14, marginBottom: 16 }}>{error}</div>}
          <button className="btn btn-primary" onClick={() => createMutation.mutate()} disabled={!form.username || !form.fullName || !!passwordError || createMutation.isPending}>
            {createMutation.isPending ? "..." : "جوړول"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <table className="fl-table">
          <thead>
            <tr>
              <th>کارن نوم</th><th>بشپړ نوم</th><th>رولونه</th><th>حالت</th><th></th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 700 }}>{u.username}</td>
                <td>{userDisplayName(u.fullName, u.username)}</td>
                <td>{u.roles.map(roleLabel).join("، ")}</td>
                <td>
                  <span className={`badge ${u.isActive ? "badge-success" : "badge-danger"}`}>
                    {u.isActive ? "فعال" : "غیرفعال"}
                  </span>
                  {u.isLocked && (
                    <span className="badge badge-danger" style={{ marginInlineStart: 8 }}>
                      بند شوی ({u.failedLoginAttempts} ناسمې هڅې)
                    </span>
                  )}
                </td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-outline btn-sm" type="button" onClick={() => startEdit(u)}>
                    <Pencil size={14} />
                    تغیر
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleActiveMutation.mutate({ id: u.id, isActive: !u.isActive })}>
                    {u.isActive ? "غیرفعالول" : "فعالول"}
                  </button>
                  {u.isLocked && (
                    <button className="btn btn-ghost btn-sm" onClick={() => unlockMutation.mutate(u.id)} disabled={unlockMutation.isPending}>
                      خلاصول
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users?.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: "32px" }}>هیڅ کاروونکی ونه موندل شو.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editingUser ? (
        <div className="modal-backdrop no-print" onClick={() => setEditingUser(null)}>
          <div className="card modal-card" onClick={(event) => event.stopPropagation()} style={{ width: "min(720px, 100%)" }}>
            <div className="modal-title">
              <span>د کاروونکي معلومات بدلول</span>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditingUser(null)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
              <div>
                <label className="form-label">کارن نوم</label>
                <input
                  className="form-input"
                  value={editForm.username}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => setEditForm((f) => ({ ...f, username: event.target.value }))}
                />
              </div>
              <div>
                <label className="form-label">بشپړ نوم</label>
                <input
                  className="form-input"
                  value={editForm.fullName}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => setEditForm((f) => ({ ...f, fullName: event.target.value }))}
                />
              </div>
              <div>
                <label className="form-label">نوی پټنوم</label>
                <div style={{ position: "relative" }}>
                  <input
                    className="form-input"
                    style={{ paddingLeft: 44 }}
                    type={showEditPassword ? "text" : "password"}
                    value={editForm.password}
                    autoComplete="new-password"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="تش پرېښودل يې نه بدلوي"
                    onChange={(event) => setEditForm((f) => ({ ...f, password: event.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword((value) => !value)}
                    title={showEditPassword ? "پټنوم پټول" : "پټنوم ښکاره کول"}
                    aria-label={showEditPassword ? "پټنوم پټول" : "پټنوم ښکاره کول"}
                    style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted-light)", cursor: "pointer", border: "none", background: "transparent", padding: 4, display: "flex" }}
                  >
                    {showEditPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <div className={`password-policy-hint ${editPasswordError ? "is-error" : "is-ok"}`}>
                  {editPasswordError || (editForm.password ? PASSWORD_POLICY_TEXT : "که پټنوم نه بدلوئ، دا خانه تشه پرېږدئ.")}
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 26, fontWeight: 800 }}>
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(event) => setEditForm((f) => ({ ...f, isActive: event.target.checked }))}
                  style={{ accentColor: "var(--primary)", width: 16, height: 16 }}
                />
                فعال حساب
              </label>
            </div>

            <div style={{ marginTop: 18 }}>
              <label className="form-label">رولونه</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {roles?.map((role) => (
                  <label key={role.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 8, border: `1px solid ${editForm.roleNames.includes(role.name) ? "var(--primary)" : "var(--border)"}`, background: editForm.roleNames.includes(role.name) ? "var(--primary-light)" : "transparent", cursor: "pointer", fontSize: 14 }}>
                    <input type="checkbox" checked={editForm.roleNames.includes(role.name)} onChange={() => toggleEditRole(role.name)} style={{ accentColor: "var(--primary)", width: 16, height: 16 }} />
                    {roleLabel(role.name)}
                  </label>
                ))}
              </div>
            </div>

            {editError && <div style={{ color: "var(--danger)", fontSize: 14, marginTop: 14 }}>{editError}</div>}

            <div style={{ display: "flex", justifyContent: "flex-start", gap: 10, marginTop: 22 }}>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => updateMutation.mutate()}
                disabled={!editForm.username.trim() || !editForm.fullName.trim() || !!editPasswordError || updateMutation.isPending}
              >
                <Save size={15} />
                {updateMutation.isPending ? "..." : "خوندي کول"}
              </button>
              <button className="btn btn-outline" type="button" onClick={() => setEditingUser(null)}>
                بندول
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
