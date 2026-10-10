import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api, type Project, type ProjectStatus } from "../lib/api";
import { Edit3, Eye, FolderPlus, Save, Search, Trash2, X } from "lucide-react";
import { visibleText } from "../lib/labels";
import ViewModeToggle, { type ViewMode } from "../components/ViewModeToggle";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "مسوده",
  active: "فعال",
  on_hold: "ځنډول شوی",
  completed: "بشپړ شوی",
  archived: "آرشیف شوی",
};

const STATUS_BADGE: Record<ProjectStatus, string> = {
  draft: "badge-muted",
  active: "badge-success",
  on_hold: "badge-warning",
  completed: "badge-info",
  archived: "badge-muted",
};

export default function ProjectsPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("q") ?? "";
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });

  const [form, setForm] = useState({ name: "", code: "" });
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [q, setQ] = useState(urlSearch);
  const [statusFilter, setStatusFilter] = useState("");
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setQ(urlSearch);
  }, [urlSearch]);

  const createMutation = useMutation({
    mutationFn: () => api.post<Project>("/projects", form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); setForm({ name: "", code: "" }); setError(null); },
    onError: (err) => setError(err instanceof Error ? err.message : "ستونزه رامنځته شوه"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ProjectStatus }) => api.put(`/projects/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
    onError: (err) => setActionError(err instanceof Error ? err.message : "ستونزه رامنځته شوه"),
  });

  const updateMutation = useMutation({
    mutationFn: (project: Project) =>
      api.put<Project>(`/projects/${project.id}`, {
        name: project.name,
        code: project.code,
        description: project.description ?? "",
        status: project.status,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setEditProject(null);
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "ستونزه رامنځته شوه"),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => api.post<Project>(`/projects/${id}/delete`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["trash"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
      setDeleteProject(null);
      setDeleteReason("");
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "ستونزه رامنځته شوه"),
  });

  const openEdit = (project: Project) => {
    setActionError(null);
    setEditProject({ ...project });
  };

  const openDelete = (project: Project) => {
    setActionError(null);
    setDeleteReason("");
    setDeleteProject(project);
  };

  const filteredProjects = (projects ?? []).filter((project) => {
    const needle = q.trim().toLowerCase();
    const matchesStatus = !statusFilter || project.status === statusFilter;
    const matchesSearch =
      !needle ||
      [project.name, project.code, project.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    return matchesStatus && matchesSearch;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">پروژې</h1>
          <p className="page-sub">د پروژو، بلاکونو، منزلونو، کورونو او دوکانونو اداره</p>
        </div>
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>

      <div className="card elevated-card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <FolderPlus size={17} /> نوې پروژه
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="form-label">د پروژې نوم</label>
            <input className="form-input" placeholder="عربین ډي استوګنځای" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
          </div>
          <div style={{ width: 140 }}>
            <label className="form-label">نښه</label>
            <input className="form-input" placeholder="اصلي" value={form.code} onChange={(e) => setForm((current) => ({ ...current, code: e.target.value }))} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn btn-primary" onClick={() => createMutation.mutate()} disabled={!form.name.trim() || !form.code.trim() || createMutation.isPending}>
              جوړول
            </button>
          </div>
        </div>
        {error && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</div>}
      </div>

      <div className="card no-print" style={{ padding: 16, marginBottom: 18, display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, position: "relative", minWidth: 240, maxWidth: 460 }}>
          <label className="form-label filter-search-label">لټون</label>
          <Search size={18} style={{ position: "absolute", bottom: 14, right: 16, color: "var(--muted)", pointerEvents: "none" }} />
          <input
            className="form-input"
            placeholder="د پروژې نوم، نښه یا یادښت..."
            value={q}
            onChange={(event) => setQ(event.target.value)}
            style={{ paddingRight: 44 }}
          />
        </div>
        <div>
          <label className="form-label">حالت</label>
          <select className="form-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ width: 180 }}>
            <option value="">ټول حالتونه</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="list-grid">
          {filteredProjects.length === 0 && (
            <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
              تر اوسه هېڅ پروژه نشته.
            </div>
          )}
          {filteredProjects.map((project) => (
            <div key={project.id} className="list-card">
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
                <Link to={`/projects/${project.id}`} style={{ fontWeight: 900, fontSize: 15, color: "var(--primary)", textDecoration: "none" }}>
                  {visibleText(project.name, "عربین ډي استوګنځای")}
                </Link>
                <span className={`badge ${STATUS_BADGE[project.status]}`}>{STATUS_LABELS[project.status]}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>نښه: {visibleText(project.code, "اصلي")}</div>
              {project.description && !/[A-Za-z]/.test(project.description) && <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>{project.description}</div>}
              <select
                className="form-select"
                value={project.status}
                onChange={(e) => statusMutation.mutate({ id: project.id, status: e.target.value as ProjectStatus })}
                style={{ fontSize: 13 }}
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Link className="btn btn-outline btn-sm" to={`/projects/${project.id}`} style={{ textDecoration: "none" }}>
                  <Eye size={14} /> لیدل
                </Link>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => openEdit(project)}>
                  <Edit3 size={14} /> ایډیټ
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => openDelete(project)}
                  disabled={deleteMutation.isPending && deleteProject?.id === project.id}
                >
                  <Trash2 size={14} /> ډیلیټ
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card elevated-card" style={{ overflow: "auto" }}>
          <table className="fl-table" style={{ minWidth: 860 }}>
            <thead><tr><th>نوم</th><th>نښه</th><th>حالت</th><th>یادښت</th><th>تګ لاره</th><th>عملونه</th></tr></thead>
            <tbody>
          {filteredProjects.map((project) => (
                <tr key={project.id}>
                  <td style={{ fontWeight: 900 }}>{visibleText(project.name, "عربین ډي استوګنځای")}</td>
                  <td>{visibleText(project.code, "اصلي")}</td>
                  <td><span className={`badge ${STATUS_BADGE[project.status]}`}>{STATUS_LABELS[project.status]}</span></td>
                  <td>{project.description && !/[A-Za-z]/.test(project.description) ? project.description : "—"}</td>
                  <td><Link to={`/projects/${project.id}`} style={{ color: "var(--primary)", fontWeight: 800, textDecoration: "none" }}>لیدل</Link></td>
                  <td>
                    <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                      <Link className="btn btn-outline btn-sm" to={`/projects/${project.id}`} style={{ textDecoration: "none" }}>
                        <Eye size={14} /> لیدل
                      </Link>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => openEdit(project)}>
                        <Edit3 size={14} /> ایډیټ
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => openDelete(project)}
                        disabled={deleteMutation.isPending && deleteProject?.id === project.id}
                      >
                        <Trash2 size={14} /> ډیلیټ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredProjects.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 36 }}>تر اوسه هېڅ پروژه نشته.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {editProject && (
        <Modal title="د پروژې معلومات بدلول" onClose={() => { setEditProject(null); setActionError(null); }}>
          <label className="form-label">نوم</label>
          <input className="form-input" value={editProject.name} onChange={(e) => setEditProject({ ...editProject, name: e.target.value })} />
          <label className="form-label">نښه</label>
          <input className="form-input" value={editProject.code} onChange={(e) => setEditProject({ ...editProject, code: e.target.value })} />
          <label className="form-label">حالت</label>
          <select className="form-select" value={editProject.status} onChange={(e) => setEditProject({ ...editProject, status: e.target.value as ProjectStatus })}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="form-label">یادښت</label>
          <textarea
            className="form-input"
            value={editProject.description ?? ""}
            onChange={(e) => setEditProject({ ...editProject, description: e.target.value })}
            style={{ height: 80, padding: 12 }}
          />
          {actionError && <div style={{ color: "var(--danger)", fontSize: 13 }}>{actionError}</div>}
          <ModalActions
            onSave={() => updateMutation.mutate(editProject)}
            disabled={!editProject.name.trim() || !editProject.code.trim() || updateMutation.isPending}
          />
        </Modal>
      )}

      {deleteProject && (
        <Modal title="پروژه حذفول" onClose={() => { setDeleteProject(null); setDeleteReason(""); setActionError(null); }}>
          <div style={{ color: "var(--text)", lineHeight: 1.8 }}>
            ایا دا پروژه حذف کړئ؟
            <strong style={{ display: "block", marginTop: 6 }}>{visibleText(deleteProject.name, "پروژه")}</strong>
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.8 }}>
            پروژه به له لېست څخه پټه شي او د کثافت داني ته به د ۳۰ ورځو لپاره ولاړه شي. تړلي بلاکونه، واحدونه او مالي ریکارډونه نه پاکېږي.
          </div>
          <label className="form-label">د حذف دلیل</label>
          <textarea
            className="form-input"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            placeholder="د حذف دلیل ولیکئ"
            style={{ height: 90, padding: 12 }}
          />
          {actionError && <div style={{ color: "var(--danger)", fontSize: 13 }}>{actionError}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
            <button type="button" className="btn btn-outline" onClick={() => { setDeleteProject(null); setDeleteReason(""); setActionError(null); }}>
              لغوه
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => deleteMutation.mutate({ id: deleteProject.id, reason: deleteReason.trim() })}
              disabled={!deleteReason.trim() || deleteMutation.isPending}
            >
              <Trash2 size={16} /> حذفول
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop no-print" onClick={onClose}>
      <div className="card modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">
          <span>{title}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div style={{ display: "grid", gap: 12 }}>{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ onSave, disabled }: { onSave: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="btn btn-primary" onClick={onSave} disabled={disabled} style={{ marginTop: 8 }}>
      <Save size={16} /> ثبتول
    </button>
  );
}
