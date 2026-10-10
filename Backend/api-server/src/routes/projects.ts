import { Router, type IRouter, type Response } from "express";
import { Op } from "sequelize";
import { Project, BlockGroup, Block, Floor, Unit, UnitType, Sale, Rental, Party } from "@workspace/db-sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";
import { moveToTrash } from "../lib/trash";
import { normalizeRoomCount, roomCountValidationError } from "../lib/unitValidation";
import type { FloorPurpose, FloorType } from "@workspace/db-sequelize";

const router: IRouter = Router();
const PROJECT_STATUSES = ["draft", "active", "on_hold", "completed", "archived"];
const FLOOR_TYPES: FloorType[] = ["basement", "ground", "mezzanine", "residential", "commercial", "parking", "roof", "other"];
const FLOOR_PURPOSES: FloorPurpose[] = ["for_sale", "for_rent"];

function normalizeFloorType(value: unknown): FloorType | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && FLOOR_TYPES.includes(value as FloorType)) return value as FloorType;
  throw new Error("د منزل ډول سم نه دی");
}

function normalizeFloorPurpose(value: unknown): FloorPurpose | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value === "string" && FLOOR_PURPOSES.includes(value as FloorPurpose)) return value as FloorPurpose;
  throw new Error("د منزل حالت باید د فروش لپاره، د کرایې لپاره، یا تش وي");
}

async function resolveFloorUnitType(value: unknown): Promise<UnitType | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null || value === "" || value === 0) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error("د منزل ډول باید د واحدونو له ډولونو څخه وي");
  }
  const unitType = await UnitType.findByPk(value);
  if (!unitType || !unitType.isActive) throw new Error("د منزل ډول ونه موندل شو");
  return unitType;
}

function floorTypeFromUnitTypeName(name: string | null | undefined): FloorType {
  const text = name ?? "";
  if (/پارک|موټر|parking|car/i.test(text)) return "parking";
  if (/دوکان|تجارت|shop|store|commercial/i.test(text)) return "commercial";
  if (/کور|اپارتمان|استوګ|house|home|apartment|residential/i.test(text)) return "residential";
  return "other";
}

router.get("/", requireAuth, async (_req, res) => {
  const projects = await Project.findAll({ where: { deletedAt: null }, order: [["id", "ASC"]] });
  res.json(projects);
});

router.get("/:id", requireAuth, async (req, res) => {
  const project = await Project.findByPk(Number(req.params.id));
  if (!project || project.deletedAt) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(project);
});

router.post("/", requireAuth, requirePermission("projects.manage"), async (req: AuthedRequest, res) => {
  const { name, code, description, status } = req.body ?? {};
  if (typeof name !== "string" || !name.trim() || typeof code !== "string" || !code.trim()) {
    res.status(400).json({ error: "name and code are required" });
    return;
  }
  const existing = await Project.findOne({ where: { code: code.trim() } });
  if (existing) {
    res.status(409).json({ error: "Project code already exists" });
    return;
  }
  const project = await Project.create({
    name: name.trim(),
    code: code.trim(),
    description: description ?? null,
    status: PROJECT_STATUSES.includes(status) ? status : "draft",
  });
  await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "Project", entityId: String(project.id) });
  res.status(201).json(project);
});

router.put("/:id", requireAuth, requirePermission("projects.manage"), async (req: AuthedRequest, res) => {
  const project = await Project.findByPk(Number(req.params.id));
  if (!project || project.deletedAt) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const { name, code, description, status } = req.body ?? {};
  if (typeof name === "string" && name.trim()) project.name = name.trim();
  if (typeof code === "string" && code.trim() && code.trim() !== project.code) {
    const existing = await Project.findOne({ where: { code: code.trim(), id: { [Op.ne]: project.id } } });
    if (existing) {
      res.status(409).json({ error: "د پروژې نښه له مخکې ثبت ده" });
      return;
    }
    project.code = code.trim();
  }
  if (typeof description === "string") project.description = description;
  if (PROJECT_STATUSES.includes(status)) project.status = status;
  await project.save();
  await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "Project", entityId: String(project.id), details: req.body });
  res.json(project);
});

async function softDeleteProject(req: AuthedRequest, res: Response): Promise<void> {
  const { reason } = req.body ?? {};
  if (typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "د حذف دلیل اړین دی" });
    return;
  }
  const project = await Project.findByPk(Number(req.params.id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (project.deletedAt) {
    res.status(400).json({ error: "دا پروژه مخکې حذف شوې ده" });
    return;
  }
  const snapshot = project.toJSON();
  project.deletedAt = new Date();
  project.deletedByUserId = req.auth!.userId;
  project.deleteReason = reason.trim();
  project.status = "archived";
  await project.save();
  await moveToTrash({
    userId: req.auth!.userId,
    entityType: "Project",
    entityId: project.id,
    displayName: project.name || project.code || `Project ${project.id}`,
    sourcePath: "/projects/list",
    snapshot,
    reason: reason.trim(),
  });
  res.json(project);
}

router.post("/:id/delete", requireAuth, requirePermission("projects.manage"), softDeleteProject);
router.delete("/:id", requireAuth, requirePermission("projects.manage"), softDeleteProject);

// ---- Block groups ----
router.get("/:id/block-groups", requireAuth, async (req, res) => {
  const groups = await BlockGroup.findAll({ where: { projectId: Number(req.params.id) }, order: [["order", "ASC"]] });
  res.json(groups);
});

router.post("/:id/block-groups", requireAuth, requirePermission("projects.manage"), async (req: AuthedRequest, res) => {
  const { name, order } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const group = await BlockGroup.create({ projectId: Number(req.params.id), name: name.trim(), order: order ?? 0 });
  await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "BlockGroup", entityId: String(group.id) });
  res.status(201).json(group);
});

// ---- Blocks ----
router.get("/:id/blocks", requireAuth, async (req, res) => {
  const blocks = await Block.findAll({ where: { projectId: Number(req.params.id) }, order: [["order", "ASC"]] });
  res.json(blocks);
});

router.post("/:id/blocks", requireAuth, requirePermission("projects.manage"), async (req: AuthedRequest, res) => {
  const { name, code, blockGroupId, order, notes } = req.body ?? {};
  if (typeof name !== "string" || !name.trim() || typeof code !== "string" || !code.trim()) {
    res.status(400).json({ error: "name and code are required" });
    return;
  }
  const projectId = Number(req.params.id);
  const existing = await Block.findOne({ where: { projectId, code: code.trim() } });
  if (existing) {
    res.status(409).json({ error: "Block code already exists in this project" });
    return;
  }
  const block = await Block.create({
    projectId,
    blockGroupId: blockGroupId ?? null,
    name: name.trim(),
    code: code.trim(),
    order: order ?? 0,
    notes: notes ?? null,
  });
  await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "Block", entityId: String(block.id) });
  res.status(201).json(block);
});

router.put("/:id/blocks/:blockId", requireAuth, requirePermission("projects.manage"), async (req: AuthedRequest, res) => {
  const block = await Block.findOne({ where: { id: Number(req.params.blockId), projectId: Number(req.params.id) } });
  if (!block) {
    res.status(404).json({ error: "Block not found" });
    return;
  }
  const { name, code, order, notes, blockGroupId } = req.body ?? {};
  if (typeof name === "string" && name.trim()) block.name = name.trim();
  if (typeof code === "string" && code.trim() && code.trim() !== block.code) {
    const existing = await Block.findOne({ where: { projectId: Number(req.params.id), code: code.trim(), id: { [Op.ne]: block.id } } });
    if (existing) {
      res.status(409).json({ error: "د بلاک نښه له مخکې ثبت ده" });
      return;
    }
    block.code = code.trim();
  }
  if (typeof order === "number") block.order = order;
  if (typeof notes === "string") block.notes = notes;
  if (blockGroupId !== undefined) block.blockGroupId = blockGroupId;
  await block.save();
  await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "Block", entityId: String(block.id) });
  res.json(block);
});

// ---- Floors ----
router.get("/:id/blocks/:blockId/floors", requireAuth, async (req, res) => {
  const floors = await Floor.findAll({ where: { blockId: Number(req.params.blockId) }, include: [{ model: UnitType, as: "unitType" }], order: [["order", "ASC"]] });
  res.json(floors);
});

router.post("/:id/blocks/:blockId/floors", requireAuth, requirePermission("projects.manage"), async (req: AuthedRequest, res) => {
  const { name, levelNumber, floorType, unitTypeId, purpose, order } = req.body ?? {};
  if (typeof name !== "string" || !name.trim() || typeof levelNumber !== "number") {
    res.status(400).json({ error: "name and levelNumber are required" });
    return;
  }
  let floorPurpose: FloorPurpose | null | undefined;
  let floorUnitType: UnitType | null | undefined;
  let normalizedFloorType: FloorType | undefined;
  try {
    normalizedFloorType = normalizeFloorType(floorType);
    floorPurpose = normalizeFloorPurpose(purpose);
    floorUnitType = await resolveFloorUnitType(unitTypeId);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "د منزل معلومات سم نه دي" });
    return;
  }
  const blockId = Number(req.params.blockId);
  const existing = await Floor.findOne({ where: { blockId, levelNumber } });
  if (existing) {
    res.status(409).json({ error: "A floor with this level number already exists in this block" });
    return;
  }
  const floor = await Floor.create({
    blockId,
    name: name.trim(),
    levelNumber,
    floorType: floorUnitType ? floorTypeFromUnitTypeName(floorUnitType.name) : normalizedFloorType ?? "residential",
    unitTypeId: floorUnitType?.id ?? null,
    purpose: floorPurpose ?? null,
    order: order ?? levelNumber,
  });
  await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "Floor", entityId: String(floor.id) });
  res.status(201).json(floor);
});

router.put("/:id/blocks/:blockId/floors/:floorId", requireAuth, requirePermission("projects.manage"), async (req: AuthedRequest, res) => {
  const floor = await Floor.findOne({ where: { id: Number(req.params.floorId), blockId: Number(req.params.blockId) } });
  if (!floor) {
    res.status(404).json({ error: "منزل ونه موندل شو" });
    return;
  }
  const { name, levelNumber, floorType, unitTypeId, purpose, order } = req.body ?? {};
  if (typeof levelNumber === "number" && levelNumber !== floor.levelNumber) {
    const existing = await Floor.findOne({ where: { blockId: Number(req.params.blockId), levelNumber, id: { [Op.ne]: floor.id } } });
    if (existing) {
      res.status(409).json({ error: "په دې بلاک کې دا منزل له مخکې ثبت دی" });
      return;
    }
    floor.levelNumber = levelNumber;
  }
  if (typeof name === "string" && name.trim()) floor.name = name.trim();
  if (floorType !== undefined) {
    try {
      const normalizedFloorType = normalizeFloorType(floorType);
      if (normalizedFloorType) floor.floorType = normalizedFloorType;
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "د منزل ډول سم نه دی" });
      return;
    }
  }
  if (unitTypeId !== undefined) {
    try {
      const floorUnitType = await resolveFloorUnitType(unitTypeId);
      floor.unitTypeId = floorUnitType?.id ?? null;
      if (floorUnitType) floor.floorType = floorTypeFromUnitTypeName(floorUnitType.name);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "د منزل ډول سم نه دی" });
      return;
    }
  }
  if (purpose !== undefined) {
    try {
      floor.purpose = normalizeFloorPurpose(purpose) ?? null;
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "د منزل حالت سم نه دی" });
      return;
    }
  }
  if (typeof order === "number") floor.order = order;
  await floor.save();
  await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "Floor", entityId: String(floor.id), details: req.body });
  res.json(floor);
});

// ---- Units ----
router.get("/:id/unit-map", requireAuth, async (req, res) => {
  const projectId = Number(req.params.id);
  const blocks = await Block.findAll({
    where: { projectId },
    order: [["order", "ASC"]],
    include: [
      {
        model: Floor,
        as: "floors",
        include: [
          { model: UnitType, as: "unitType" },
          {
            model: Unit,
            as: "units",
            include: [
              { model: UnitType, as: "unitType" },
              {
                model: Sale,
                as: "sales",
                required: false,
                where: { status: { [Op.notIn]: ["cancelled", "reversed"] } },
                include: [{ model: Party, as: "party" }],
              },
              {
                model: Rental,
                as: "rentals",
                required: false,
                where: { status: "active" },
                include: [{ model: Party, as: "tenant" }],
              },
            ],
          },
        ],
      },
    ],
  });
  res.json(blocks);
});

router.post("/:id/blocks/:blockId/floors/:floorId/units", requireAuth, requirePermission("projects.manage"), async (req: AuthedRequest, res) => {
  const { unitNumber, unitTypeId, purpose, roomCount, areaSqm, notes } = req.body ?? {};
  if (typeof unitNumber !== "string" || !unitNumber.trim() || typeof unitTypeId !== "number") {
    res.status(400).json({ error: "unitNumber and unitTypeId are required" });
    return;
  }
  const unitType = await UnitType.findByPk(unitTypeId);
  if (!unitType) {
    res.status(404).json({ error: "د واحد ډول ونه موندل شو" });
    return;
  }
  let cleanRoomCount: number | null;
  try {
    cleanRoomCount = normalizeRoomCount(roomCount);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "د اطاقونو تعداد سم نه دی" });
    return;
  }
  const roomError = roomCountValidationError(unitType.name, cleanRoomCount);
  if (roomError) {
    res.status(400).json({ error: roomError });
    return;
  }
  const floorId = Number(req.params.floorId);
  const existing = await Unit.findOne({ where: { floorId, unitNumber: unitNumber.trim() } });
  if (existing) {
    res.status(409).json({ error: "A unit with this number already exists on this floor" });
    return;
  }
  const unit = await Unit.create({
    floorId,
    unitTypeId,
    unitNumber: unitNumber.trim(),
    purpose: purpose ?? "not_available",
    roomCount: cleanRoomCount,
    areaSqm: areaSqm ?? null,
    notes: notes ?? null,
  });
  await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "Unit", entityId: String(unit.id) });
  res.status(201).json(unit);
});

export default router;
