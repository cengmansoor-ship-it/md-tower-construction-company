import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { api, type Project, type ProjectStatus, type Block, type BlockWithFloors, type UnitType, type FloorType, type FloorPurpose, type Unit, type UnitStatus, type UnitPurpose, type Floor } from "../lib/api";
import { ArrowRight, Edit3, Plus, Printer, Save, X } from "lucide-react";
import PrintHeader from "../components/PrintHeader";
import { unitTypeNameIsHouse, roomCountLabel } from "../lib/units";

const FLOOR_TYPE_LABELS: Record<FloorType, string> = {
  basement: "تهکوي", ground: "لومړی پوړ", mezzanine: "نیم پوړ", residential: "استوګنیز",
  commercial: "تجارتي", parking: "د موټر ځای", roof: "چت", other: "نور",
};

const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  draft: "مسوده", available: "خالي", reserved: "نیول شوی", sold: "فروش شوی",
  rented: "کرایه شوی", blocked: "بند شوی", cancelled: "لغوه شوی", inactive: "غیر فعال",
};

const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "مسوده", active: "فعال", on_hold: "ځنډول شوی", completed: "بشپړ شوی", archived: "آرشیف شوی",
};

const MANUAL_STATUSES: UnitStatus[] = ["draft", "available", "reserved", "sold", "rented", "blocked", "cancelled", "inactive"];

const UNIT_PURPOSE_LABELS: Record<UnitPurpose, string> = {
  for_sale: "د فروش لپاره", for_rent: "د کرایې لپاره", both: "دواړه", not_available: "نامیسر",
};
const FLOOR_PURPOSE_LABELS: Record<Exclude<FloorPurpose, null>, string> = {
  for_sale: "ټول منزل د فروش لپاره",
  for_rent: "ټول منزل د کرایې لپاره",
};
type FloorPurposeFormValue = Exclude<FloorPurpose, null> | "";

type UnitPatch = Partial<Pick<Unit, "unitNumber" | "unitTypeId" | "status" | "purpose" | "roomCount" | "areaSqm" | "notes">>;

function unitStyle(status: UnitStatus): CSSProperties {
  switch (status) {
    case "available": return { background: "var(--success-light)", color: "#065F46", borderColor: "#6EE7B7" };
    case "sold": return { background: "var(--danger-light)", color: "#991B1B", borderColor: "#FCA5A5" };
    case "rented": return { background: "var(--info-light)", color: "#1D4ED8", borderColor: "#93C5FD" };
    case "reserved": return { background: "var(--warning-light)", color: "#92400E", borderColor: "#FCD34D" };
    default: return { background: "var(--surface-2)", color: "var(--muted)", borderColor: "var(--border)" };
  }
}

function occupantOf(unit: Unit) {
  const sale = unit.sales?.find((item) => item.status !== "cancelled" && item.status !== "reversed");
  if (sale) {
    return { label: "فروش", name: sale.party?.name ?? "", phone: sale.party?.phone1 ?? sale.party?.phone2 ?? "", note: sale.contractNumber ?? sale.saleNumber };
  }
  const rental = unit.rentals?.find((item) => item.status === "active");
  if (rental) {
    return { label: "کرایه", name: rental.tenant?.name ?? "", phone: rental.tenant?.phone1 ?? rental.tenant?.phone2 ?? "", note: rental.rentalNumber };
  }
  return null;
}

function countUnits(blocks: BlockWithFloors[] | undefined, status?: UnitStatus): number {
  return (blocks ?? []).reduce((sum, block) => sum + block.floors.reduce((floorSum, floor) => floorSum + floor.units.filter((unit) => !status || unit.status === status).length, 0), 0);
}

function countFloors(blocks: BlockWithFloors[] | undefined): number {
  return (blocks ?? []).reduce((sum, block) => sum + block.floors.length, 0);
}

function nextFloorLevelNumber(block: BlockWithFloors): number {
  return block.floors.reduce((max, floor) => Math.max(max, floor.levelNumber), 0) + 1;
}

function projectText(value: string | null | undefined, fallback: string): string {
  const text = value?.trim();
  return text ? text : fallback;
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const qc = useQueryClient();

  useEffect(() => {
    document.body.classList.add("project-print-route");
    return () => document.body.classList.remove("project-print-route");
  }, []);

  const { data: project } = useQuery({ queryKey: ["project", projectId], queryFn: () => api.get<Project>(`/projects/${projectId}`) });
  const { data: unitMap } = useQuery({ queryKey: ["unit-map", projectId], queryFn: () => api.get<BlockWithFloors[]>(`/projects/${projectId}/unit-map`) });
  const { data: unitTypes } = useQuery({ queryKey: ["unit-types"], queryFn: () => api.get<UnitType[]>("/unit-types") });

  const [blockForm, setBlockForm] = useState({ name: "", code: "" });
  const [floorTarget, setFloorTarget] = useState<number | null>(null);
  const [floorForm, setFloorForm] = useState({ name: "", unitTypeId: 0, purpose: "" as FloorPurposeFormValue });
  const [unitTarget, setUnitTarget] = useState<{ blockId: number; floorId: number } | null>(null);
  const [unitForm, setUnitForm] = useState({ unitNumber: "", unitTypeId: 0, purpose: "not_available" as UnitPurpose, roomCount: "" });
  const [projectEdit, setProjectEdit] = useState<Project | null>(null);
  const [blockEdit, setBlockEdit] = useState<Block | null>(null);
  const [floorEdit, setFloorEdit] = useState<Floor | null>(null);
  const [unitEdit, setUnitEdit] = useState<Unit | null>(null);
  const [unitPatch, setUnitPatch] = useState<UnitPatch>({});

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["project", projectId] });
    qc.invalidateQueries({ queryKey: ["unit-map", projectId] });
  };

  const createBlock = useMutation({
    mutationFn: () => api.post<Block>(`/projects/${projectId}/blocks`, blockForm),
    onSuccess: () => { refresh(); setBlockForm({ name: "", code: "" }); },
  });
  const createFloor = useMutation({
    mutationFn: (block: BlockWithFloors) => {
      const levelNumber = nextFloorLevelNumber(block);
      return api.post(`/projects/${projectId}/blocks/${block.id}/floors`, {
        ...floorForm,
        levelNumber,
        order: levelNumber,
        purpose: floorForm.purpose || null,
      });
    },
    onSuccess: () => { refresh(); setFloorTarget(null); setFloorForm({ name: "", unitTypeId: 0, purpose: "" }); },
  });
  const createUnit = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/blocks/${unitTarget!.blockId}/floors/${unitTarget!.floorId}/units`, {
      ...unitForm,
      roomCount: unitForm.roomCount.trim() ? Number(unitForm.roomCount) : null,
    }),
    onSuccess: () => { refresh(); setUnitTarget(null); setUnitForm({ unitNumber: "", unitTypeId: 0, purpose: "not_available", roomCount: "" }); },
  });
  const updateProject = useMutation({
    mutationFn: (patch: Partial<Project>) => api.put(`/projects/${projectId}`, patch),
    onSuccess: () => { refresh(); setProjectEdit(null); },
  });
  const updateBlock = useMutation({
    mutationFn: (block: Block) => api.put(`/projects/${projectId}/blocks/${block.id}`, block),
    onSuccess: () => { refresh(); setBlockEdit(null); },
  });
  const updateFloor = useMutation({
    mutationFn: (floor: Floor) => api.put(`/projects/${projectId}/blocks/${floor.blockId}/floors/${floor.id}`, floor),
    onSuccess: () => { refresh(); setFloorEdit(null); },
  });
  const updateUnit = useMutation({
    mutationFn: ({ unitId, patch }: { unitId: number; patch: UnitPatch }) => api.put(`/units/${unitId}`, patch),
    onSuccess: () => { refresh(); setUnitEdit(null); setUnitPatch({}); },
  });

  const reportRows = useMemo(() => {
    return (unitMap ?? []).flatMap((block) => block.floors.map((floor) => {
      const sold = floor.units.filter((unit) => unit.status === "sold");
      const rented = floor.units.filter((unit) => unit.status === "rented");
      return {
        block,
        floor,
        total: floor.units.length,
        available: floor.units.filter((unit) => unit.status === "available").length,
        reserved: floor.units.filter((unit) => unit.status === "reserved").length,
        sold,
        rented,
      };
    }));
  }, [unitMap]);

  const reportStats = useMemo(() => {
    const floorPatterns = new Map<number, { floors: number; units: number }>();
    const unitTypeTotals = new Map<string, { total: number; sold: number; available: number }>();
    for (const block of unitMap ?? []) {
      for (const floor of block.floors) {
        const unitsPerFloor = floor.units.length;
        const pattern = floorPatterns.get(unitsPerFloor) ?? { floors: 0, units: 0 };
        pattern.floors += 1;
        pattern.units += unitsPerFloor;
        floorPatterns.set(unitsPerFloor, pattern);

        for (const unit of floor.units) {
          const name = projectText(unit.unitType?.name, "کور");
          const bucket = unitTypeTotals.get(name) ?? { total: 0, sold: 0, available: 0 };
          bucket.total += 1;
          if (unit.status === "sold") bucket.sold += 1;
          if (unit.status === "available") bucket.available += 1;
          unitTypeTotals.set(name, bucket);
        }
      }
    }
    return {
      blockCount: unitMap?.length ?? 0,
      floorCount: countFloors(unitMap),
      unitCount: countUnits(unitMap),
      floorPatterns: Array.from(floorPatterns.entries()).sort(([left], [right]) => left - right),
      unitTypeTotals: Array.from(unitTypeTotals.entries()).sort(([left], [right]) => left.localeCompare(right)),
    };
  }, [unitMap]);

  const selectedCreateUnitType = unitTypes?.find((type) => type.id === unitForm.unitTypeId);
  const createUnitNeedsRoomCount = unitTypeNameIsHouse(selectedCreateUnitType?.name);
  const createRoomCountValue = Number(unitForm.roomCount);
  const createRoomCountValid = !createUnitNeedsRoomCount || (Number.isInteger(createRoomCountValue) && createRoomCountValue > 0);
  const selectedEditUnitType = unitTypes?.find((type) => type.id === (unitPatch.unitTypeId ?? unitEdit?.unitTypeId));
  const editUnitNeedsRoomCount = unitTypeNameIsHouse(selectedEditUnitType?.name);
  const activeUnitTypes = useMemo(() => (unitTypes ?? []).filter((type) => type.isActive), [unitTypes]);

  if (!project) return null;

  return (
    <div className="project-detail-page">
      <PrintHeader title={`${projectText(project.name, "پروژه")} - د پروژې راپور`} />

      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Link to="/projects" style={{ color: "var(--muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
          پروژې <ArrowRight size={13} />
        </Link>
        <span style={{ color: "var(--muted)" }}>/</span>
        <span style={{ fontSize: 13 }}>{projectText(project.name, "عربین ډي استوګنځای")}</span>
      </div>

      <div className="page-header no-print">
        <div>
          <h1 className="page-title">{projectText(project.name, "عربین ډي استوګنځای")}</h1>
          <p className="page-sub">نښه: {projectText(project.code, "اصلي")}</p>
        </div>
        <button className="btn btn-outline" onClick={() => setProjectEdit(project)}><Edit3 size={16} /> معلومات بدلول</button>
      </div>

      <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", marginBottom: 18 }}>
        <button className="btn btn-outline" onClick={() => window.print()}><Printer size={16} /> د پروژې راپور چاپ</button>
        <Link className="btn btn-primary" to={`/sales?projectId=${projectId}&customerType=sales_customer&openForm=1`} style={{ textDecoration: "none" }}><Plus size={16} /> د پروژې فروش</Link>
      </div>

      <div className="summary-grid project-print-summary" style={{ marginBottom: 18 }}>
        <div className="summary-card info"><span>ټول بلاکونه</span><strong>{reportStats.blockCount}</strong></div>
        <div className="summary-card info"><span>ټول منزلونه</span><strong>{reportStats.floorCount}</strong></div>
        <div className="summary-card"><span>ټول ځایونه</span><strong>{countUnits(unitMap)}</strong></div>
        <div className="summary-card success"><span>خالي</span><strong>{countUnits(unitMap, "available")}</strong></div>
        <div className="summary-card danger"><span>فروش شوي</span><strong>{countUnits(unitMap, "sold")}</strong></div>
        <div className="summary-card info"><span>کرایه شوي</span><strong>{countUnits(unitMap, "rented")}</strong></div>
      </div>

      <div className="card elevated-card project-report-card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>د پروژې راپور</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12, marginBottom: 14 }}>
          <div className="summary-card" style={{ boxShadow: "none" }}><span>بلاکونه × منزلونه</span><strong>{reportStats.blockCount} × {reportStats.blockCount ? Math.round(reportStats.floorCount / reportStats.blockCount) : 0} = {reportStats.floorCount}</strong></div>
          {reportStats.floorPatterns.map(([unitsPerFloor, data]) => (
            <div key={unitsPerFloor} className="summary-card" style={{ boxShadow: "none" }}>
              <span>په هر منزل کې {unitsPerFloor} کورونه</span>
              <strong>{data.floors} × {unitsPerFloor} = {data.units}</strong>
            </div>
          ))}
        </div>
        {reportStats.unitTypeTotals.length ? (
          <div className="project-report-table-wrap" style={{ overflow: "auto", marginBottom: 14 }}>
            <table className="fl-table compact-table" style={{ minWidth: 560 }}>
              <thead>
                <tr><th>د کور/واحد ډول</th><th>ټول</th><th>فروش شوي</th><th>خالي</th></tr>
              </thead>
              <tbody>
                {reportStats.unitTypeTotals.map(([name, totals]) => (
                  <tr key={name}><td>{name}</td><td>{totals.total}</td><td>{totals.sold}</td><td>{totals.available}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="project-report-table-wrap" style={{ overflow: "auto" }}>
          <table className="fl-table compact-table" style={{ minWidth: 940 }}>
            <thead>
              <tr><th>بلاک</th><th>منزل</th><th>ټول</th><th>فروش</th><th>کرایه</th><th>خالي</th><th>نیول شوي</th><th>د نیول شوو لنډ معلومات</th></tr>
            </thead>
            <tbody>
              {reportRows.map((row) => (
                <tr key={`${row.block.id}-${row.floor.id}`}>
                  <td>{projectText(row.block.name, "بلاک")}</td>
                  <td>{projectText(row.floor.name, "منزل")}</td>
                  <td>{row.total}</td>
                  <td>{row.sold.length}</td>
                  <td>{row.rented.length}</td>
                  <td>{row.available}</td>
                  <td>{row.reserved}</td>
                  <td>
                    {[...row.sold, ...row.rented].map((unit) => {
                      const occupant = occupantOf(unit);
                      return `${unit.unitNumber}${occupant?.name ? `: ${occupant.name}` : ""}`;
                    }).join("، ") || "۰"}
                  </td>
                </tr>
              ))}
              {!reportRows.length && <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)" }}>راپور نشته</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card elevated-card no-print" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <Plus size={15} /> نوی بلاک
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input className="form-input" placeholder="نوم" value={blockForm.name} onChange={(e) => setBlockForm((f) => ({ ...f, name: e.target.value }))} style={{ width: 180 }} />
          <input className="form-input" placeholder="نښه" value={blockForm.code} onChange={(e) => setBlockForm((f) => ({ ...f, code: e.target.value }))} style={{ width: 120 }} />
          <button className="btn btn-primary" onClick={() => createBlock.mutate()} disabled={!blockForm.name.trim() || !blockForm.code.trim() || createBlock.isPending}>جوړول</button>
        </div>
      </div>

      <div className="no-print" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {unitMap?.map((block) => (
          <div key={block.id} className="card elevated-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 15 }}>
                {projectText(block.name, "بلاک")} <span style={{ color: "var(--muted)", fontWeight: 500, fontSize: 12 }}>({projectText(block.code, "نښه")})</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setBlockEdit(block)}><Edit3 size={13} /> بدلول</button>
                <button className="btn btn-outline btn-sm" onClick={() => setFloorTarget(floorTarget === block.id ? null : block.id)}><Plus size={13} /> منزل</button>
              </div>
            </div>

              {floorTarget === block.id && (
                <div className="inline-editor">
                  <input className="form-input" placeholder="نوم" value={floorForm.name} onChange={(e) => setFloorForm((f) => ({ ...f, name: e.target.value }))} style={{ width: 140 }} />
                  <select className="form-select" value={floorForm.unitTypeId} onChange={(e) => setFloorForm((f) => ({ ...f, unitTypeId: Number(e.target.value) }))} style={{ width: 150 }}>
                  <option value={0}>ډول وټاکئ</option>
                  {activeUnitTypes.map((type) => <option key={type.id} value={type.id}>{projectText(type.name, "ډول")}</option>)}
                </select>
                <select className="form-select" value={floorForm.purpose} onChange={(e) => setFloorForm((f) => ({ ...f, purpose: e.target.value as FloorPurposeFormValue }))} style={{ width: 190 }}>
                  <option value="">مختلط / دواړه</option>
                  <option value="for_sale">د فروش لپاره</option>
                  <option value="for_rent">د کرایې لپاره</option>
                </select>
                <button className="btn btn-primary btn-sm" onClick={() => createFloor.mutate(block)} disabled={!floorForm.name.trim() || !floorForm.unitTypeId || createFloor.isPending}>زیاتول</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setFloorTarget(null)}><X size={14} /></button>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {block.floors.map((floor) => (
                <div key={floor.id} className="floor-panel">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 800 }}>
                      {projectText(floor.name, "منزل")} <span style={{ color: "var(--muted)", fontWeight: 500, fontSize: 11 }}>({projectText(floor.unitType?.name, FLOOR_TYPE_LABELS[floor.floorType])})</span>
                      <span style={{ color: "var(--muted)", fontWeight: 500, fontSize: 11 }}> - {floor.purpose ? FLOOR_PURPOSE_LABELS[floor.purpose] : "مختلط / دواړه"}</span>
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setFloorEdit(floor)}><Edit3 size={13} /> بدلول</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: "var(--primary)" }} onClick={() => setUnitTarget(unitTarget?.floorId === floor.id ? null : { blockId: block.id, floorId: floor.id })}>
                        <Plus size={13} /> اضافه کول
                      </button>
                    </div>
                  </div>

                  {unitTarget?.floorId === floor.id && (
                    <div className="inline-editor">
                      <input className="form-input" placeholder="شمېره" value={unitForm.unitNumber} onChange={(e) => setUnitForm((f) => ({ ...f, unitNumber: e.target.value }))} style={{ width: 110 }} />
                      <select className="form-select" value={unitForm.unitTypeId} onChange={(e) => setUnitForm((f) => ({ ...f, unitTypeId: Number(e.target.value) }))} style={{ width: 150 }}>
                        <option value={0}>ډول وټاکئ</option>
                        {unitTypes?.map((type) => <option key={type.id} value={type.id}>{projectText(type.name, "ډول")}</option>)}
                      </select>
                      <select className="form-select" value={unitForm.purpose} onChange={(e) => setUnitForm((f) => ({ ...f, purpose: e.target.value as UnitPurpose }))} style={{ width: 150 }}>
                        {Object.entries(UNIT_PURPOSE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <input
                        className="form-input"
                        type="number"
                        min={1}
                        placeholder={createUnitNeedsRoomCount ? "اطاقونه" : "اطاقونه (اختیاري)"}
                        value={unitForm.roomCount}
                        onChange={(e) => setUnitForm((f) => ({ ...f, roomCount: e.target.value }))}
                        style={{ width: 130 }}
                      />
                      <button className="btn btn-primary btn-sm" onClick={() => createUnit.mutate()} disabled={!unitForm.unitNumber.trim() || !unitForm.unitTypeId || !createRoomCountValid || createUnit.isPending}>زیاتول</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setUnitTarget(null)}><X size={14} /></button>
                    </div>
                  )}

                  <div className="unit-grid">
                    {floor.units.map((unit) => {
                      const occupant = occupantOf(unit);
                      return (
                        <button
                          key={unit.id}
                          className="unit-tile"
                          onClick={() => { setUnitEdit(unit); setUnitPatch({ unitNumber: unit.unitNumber, unitTypeId: unit.unitTypeId, status: unit.status, purpose: unit.purpose, roomCount: unit.roomCount, areaSqm: unit.areaSqm, notes: unit.notes }); }}
                          style={unitStyle(unit.status)}
                        >
                          <strong>{unit.unitNumber}</strong>
                          <span>{projectText(unit.unitType?.name, "ډول")} - {UNIT_STATUS_LABELS[unit.status]}</span>
                          {unitTypeNameIsHouse(unit.unitType?.name) && <small>اطاقونه: {roomCountLabel(unit)}</small>}
                          {occupant && <small>{occupant.label}: {projectText(occupant.name, "شخص")} {occupant.phone ? `، ${occupant.phone}` : ""}</small>}
                        </button>
                      );
                    })}
                    {floor.units.length === 0 && <span style={{ fontSize: 12, color: "var(--muted)" }}>هیڅ کور نشته</span>}
                  </div>
                </div>
              ))}
              {block.floors.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)" }}>هیڅ منزل نشته</p>}
            </div>
          </div>
        ))}
        {unitMap?.length === 0 && <div style={{ textAlign: "center", padding: 48, color: "var(--muted)", fontSize: 14 }}>تر اوسه هیڅ بلاک نشته.</div>}
      </div>

      {projectEdit && (
        <Modal title="د پروژې معلومات بدلول" onClose={() => setProjectEdit(null)}>
          <label className="form-label">نوم</label>
          <input className="form-input" value={projectEdit.name} onChange={(e) => setProjectEdit({ ...projectEdit, name: e.target.value })} />
          <label className="form-label">نښه</label>
          <input className="form-input" value={projectEdit.code} onChange={(e) => setProjectEdit({ ...projectEdit, code: e.target.value })} />
          <label className="form-label">حالت</label>
          <select className="form-select" value={projectEdit.status} onChange={(e) => setProjectEdit({ ...projectEdit, status: e.target.value as ProjectStatus })}>
            {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="form-label">یادښت</label>
          <textarea className="form-input" value={projectEdit.description ?? ""} onChange={(e) => setProjectEdit({ ...projectEdit, description: e.target.value })} style={{ height: 80, padding: 12 }} />
          <ModalActions onSave={() => updateProject.mutate(projectEdit)} />
        </Modal>
      )}

      {blockEdit && (
        <Modal title="د بلاک معلومات بدلول" onClose={() => setBlockEdit(null)}>
          <label className="form-label">نوم</label>
          <input className="form-input" value={blockEdit.name} onChange={(e) => setBlockEdit({ ...blockEdit, name: e.target.value })} />
          <label className="form-label">نښه</label>
          <input className="form-input" value={blockEdit.code} onChange={(e) => setBlockEdit({ ...blockEdit, code: e.target.value })} />
          <label className="form-label">یادښت</label>
          <textarea className="form-input" value={blockEdit.notes ?? ""} onChange={(e) => setBlockEdit({ ...blockEdit, notes: e.target.value })} style={{ height: 80, padding: 12 }} />
          <ModalActions onSave={() => updateBlock.mutate(blockEdit)} />
        </Modal>
      )}

      {floorEdit && (
        <Modal title="د منزل معلومات بدلول" onClose={() => setFloorEdit(null)}>
          <label className="form-label">نوم</label>
          <input className="form-input" value={floorEdit.name} onChange={(e) => setFloorEdit({ ...floorEdit, name: e.target.value })} />
          <label className="form-label">کچه</label>
          <input className="form-input" type="number" value={floorEdit.levelNumber} onChange={(e) => setFloorEdit({ ...floorEdit, levelNumber: Number(e.target.value) })} />
          <label className="form-label">ډول</label>
          <select className="form-select" value={floorEdit.unitTypeId ?? 0} onChange={(e) => setFloorEdit({ ...floorEdit, unitTypeId: Number(e.target.value) || null })}>
            <option value={0}>ډول وټاکئ</option>
            {(unitTypes ?? []).map((type) => <option key={type.id} value={type.id}>{projectText(type.name, "ډول")}</option>)}
          </select>
          <label className="form-label">د منزل حالت</label>
          <select className="form-select" value={floorEdit.purpose ?? ""} onChange={(e) => setFloorEdit({ ...floorEdit, purpose: e.target.value ? e.target.value as Exclude<FloorPurpose, null> : null })}>
            <option value="">مختلط / دواړه</option>
            <option value="for_sale">د فروش لپاره</option>
            <option value="for_rent">د کرایې لپاره</option>
          </select>
          <ModalActions onSave={() => updateFloor.mutate(floorEdit)} />
        </Modal>
      )}

      {unitEdit && (
        <Modal title={`کور ${unitEdit.unitNumber}`} onClose={() => { setUnitEdit(null); setUnitPatch({}); }}>
          {occupantOf(unitEdit) && (
            <div className="occupied-box">
              <strong>{occupantOf(unitEdit)?.label}</strong>
              <span>{projectText(occupantOf(unitEdit)?.name, "شخص")}</span>
              {occupantOf(unitEdit)?.phone && <span>{occupantOf(unitEdit)?.phone}</span>}
            </div>
          )}
          <label className="form-label">کور نمبر</label>
          <input className="form-input" value={String(unitPatch.unitNumber ?? "")} onChange={(e) => setUnitPatch((patch) => ({ ...patch, unitNumber: e.target.value }))} />
          <label className="form-label">ډول</label>
          <select className="form-select" value={unitPatch.unitTypeId ?? unitEdit.unitTypeId} onChange={(e) => setUnitPatch((patch) => ({ ...patch, unitTypeId: Number(e.target.value) }))}>
            {unitTypes?.map((type) => <option key={type.id} value={type.id}>{projectText(type.name, "ډول")}</option>)}
          </select>
          <label className="form-label">کارونه</label>
          <select className="form-select" value={unitPatch.purpose ?? unitEdit.purpose} onChange={(e) => setUnitPatch((patch) => ({ ...patch, purpose: e.target.value as UnitPurpose }))}>
            {Object.entries(UNIT_PURPOSE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="form-label">حالت</label>
          <select className="form-select" value={unitPatch.status ?? unitEdit.status} onChange={(e) => setUnitPatch((patch) => ({ ...patch, status: e.target.value as UnitStatus }))}>
            {Object.entries(UNIT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value} disabled={!MANUAL_STATUSES.includes(value as UnitStatus) && value !== unitEdit.status}>{label}</option>
            ))}
          </select>
          {editUnitNeedsRoomCount && (
            <>
              <label className="form-label">د اطاقونو تعداد</label>
              <input
                className="form-input"
                type="number"
                min={1}
                value={unitPatch.roomCount ?? ""}
                onChange={(e) => setUnitPatch((patch) => ({ ...patch, roomCount: e.target.value ? Number(e.target.value) : null }))}
              />
            </>
          )}
          <label className="form-label">مساحت</label>
          <input className="form-input" type="text" inputMode="decimal" value={unitPatch.areaSqm ?? ""} onChange={(e) => setUnitPatch((patch) => ({ ...patch, areaSqm: e.target.value ? Number(e.target.value) : null }))} />
          <label className="form-label">یادښت</label>
          <textarea className="form-input" value={unitPatch.notes ?? ""} onChange={(e) => setUnitPatch((patch) => ({ ...patch, notes: e.target.value }))} style={{ height: 80, padding: 12 }} />
          <ModalActions onSave={() => updateUnit.mutate({ unitId: unitEdit.id, patch: unitPatch })} />
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop no-print" onClick={onClose}>
      <div className="card modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title"><span>{title}</span><button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button></div>
        <div style={{ display: "grid", gap: 12 }}>{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ onSave }: { onSave: () => void }) {
  return <button className="btn btn-primary" onClick={onSave} style={{ marginTop: 8 }}><Save size={16} /> ثبتول</button>;
}
