import { Router, type IRouter } from "express";
import {
  Unit,
  Floor,
  Block,
  Project,
  UnitType,
  MANUALLY_SETTABLE_UNIT_STATUSES,
  type UnitStatus,
  type UnitPurpose,
} from "@workspace/db-sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";
import { normalizeRoomCount, roomCountValidationError } from "../lib/unitValidation";

const router: IRouter = Router();

function unitTypeMatches(name: string | undefined, filter: string | undefined): boolean {
  if (!filter) return true;
  const normalizedFilter = filter.trim().toLowerCase();
  const normalizedName = (name ?? "").trim().toLowerCase();
  if (normalizedFilter === "shop") {
    return normalizedName.includes("shop") || normalizedName.includes("دوکان") || normalizedName.includes("دکان");
  }
  return normalizedName === normalizedFilter;
}

router.get("/", requireAuth, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const purpose = typeof req.query.purpose === "string" ? req.query.purpose : undefined;
  const availability = typeof req.query.availability === "string" ? req.query.availability : undefined;
  const unitType = typeof req.query.unitType === "string" ? req.query.unitType : undefined;
  const projectId = typeof req.query.projectId === "string" ? Number(req.query.projectId) : null;
  const blockId = typeof req.query.blockId === "string" ? Number(req.query.blockId) : null;
  const floorId = typeof req.query.floorId === "string" ? Number(req.query.floorId) : null;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const where: Record<string, unknown> = {};
  if (status) where["status"] = status;
  if (purpose) where["purpose"] = purpose;
  if (floorId && Number.isFinite(floorId)) where["floorId"] = floorId;

  const blockWhere: Record<string, unknown> = {};
  if (projectId && Number.isFinite(projectId)) blockWhere["projectId"] = projectId;
  if (blockId && Number.isFinite(blockId)) blockWhere["id"] = blockId;

  const units = await Unit.findAll({
    where,
    include: [
      { model: UnitType, as: "unitType" as const },
      {
        model: Floor,
        as: "floor" as const,
        required: Object.keys(blockWhere).length > 0,
        include: [{
          model: Block,
          as: "block" as const,
          required: Object.keys(blockWhere).length > 0,
          ...(Object.keys(blockWhere).length ? { where: blockWhere } : {}),
          include: [{ model: Project, as: "project" as const }],
        }],
      },
    ],
    order: [["id", "DESC"]],
    limit: 500,
  });

  const filtered = units.filter((u) => {
    const row = u.toJSON() as {
      unitType?: { name?: string };
      floor?: {
        name?: string | null;
        purpose?: "for_sale" | "for_rent" | null;
        block?: { name?: string | null; code?: string | null; project?: { name?: string | null; code?: string | null } };
      };
    };
    const unitTypeName = row.unitType?.name;
    const matchesType = unitTypeMatches(unitTypeName, unitType);
    const matchesAvailability =
      availability === "sale" ? row.floor?.purpose !== "for_rent" :
      availability === "rent" ? row.floor?.purpose !== "for_sale" :
      true;
    const haystack = [
      u.unitNumber,
      row.unitType?.name,
      row.floor?.name,
      row.floor?.block?.name,
      row.floor?.block?.code,
      row.floor?.block?.project?.name,
      row.floor?.block?.project?.code,
    ].filter(Boolean).join(" ").toLowerCase();
    const matchesQuery = !q || haystack.includes(q.toLowerCase());
    return matchesType && matchesAvailability && matchesQuery;
  });

  res.json(filtered);
});

router.put("/:id", requireAuth, requirePermission("projects.manage"), async (req: AuthedRequest, res) => {
  const unit = await Unit.findByPk(Number(req.params.id));
  if (!unit) {
    res.status(404).json({ error: "واحد ونه موندل شو" });
    return;
  }

  const { unitNumber, unitTypeId, status, purpose, roomCount, areaSqm, notes } = req.body ?? {};
  let validationUnitTypeName: string | null | undefined;
  if (typeof unitNumber === "string" && unitNumber.trim() && unitNumber.trim() !== unit.unitNumber) {
    const existing = await Unit.findOne({ where: { floorId: unit.floorId, unitNumber: unitNumber.trim() } });
    if (existing) {
      res.status(409).json({ error: "په دې منزل کې دا کور نمبر له مخکې ثبت دی" });
      return;
    }
    unit.unitNumber = unitNumber.trim();
  }
  if (typeof unitTypeId === "number") {
    const unitType = await UnitType.findByPk(unitTypeId);
    if (!unitType) {
      res.status(404).json({ error: "د واحد ډول ونه موندل شو" });
      return;
    }
    validationUnitTypeName = unitType.name;
    unit.unitTypeId = unitTypeId;
  }
  if (roomCount !== undefined) {
    try {
      unit.roomCount = normalizeRoomCount(roomCount);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "د اطاقونو تعداد سم نه دی" });
      return;
    }
  }
  if (status !== undefined) {
    if (!MANUALLY_SETTABLE_UNIT_STATUSES.includes(status as UnitStatus)) {
      res.status(400).json({ error: "فروش، کرایه او نیول شوی حالت یوازې د قرارداد له لارې بدلېږي" });
      return;
    }
    unit.status = status as UnitStatus;
  }
  if (typeof purpose === "string") unit.purpose = purpose as UnitPurpose;
  if (areaSqm !== undefined) unit.areaSqm = areaSqm;
  if (typeof notes === "string") unit.notes = notes;
  if (validationUnitTypeName === undefined) {
    const currentUnitType = await UnitType.findByPk(unit.unitTypeId);
    validationUnitTypeName = currentUnitType?.name;
  }
  const roomError = roomCountValidationError(validationUnitTypeName, unit.roomCount ?? null);
  if (roomError) {
    res.status(400).json({ error: roomError });
    return;
  }
  await unit.save();
  await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "Unit", entityId: String(unit.id), details: req.body });
  res.json(unit);
});

export default router;
