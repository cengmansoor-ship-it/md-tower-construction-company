import { Router, type IRouter } from "express";
import { UnitType } from "@workspace/db-sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";

const router: IRouter = Router();

router.get("/", requireAuth, async (_req, res) => {
  const types = await UnitType.findAll({ order: [["id", "ASC"]] });
  res.json(types);
});

router.post("/", requireAuth, requirePermission("projects.manage"), async (req: AuthedRequest, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "نوم اړین دی" });
    return;
  }
  const existing = await UnitType.findOne({ where: { name: name.trim() } });
  if (existing) {
    res.status(409).json({ error: "دا ډول له مخکې ثبت دی" });
    return;
  }
  const unitType = await UnitType.create({ name: name.trim(), isActive: true });
  await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "UnitType", entityId: String(unitType.id) });
  res.status(201).json(unitType);
});

router.put("/:id", requireAuth, requirePermission("projects.manage"), async (req: AuthedRequest, res) => {
  const unitType = await UnitType.findByPk(Number(req.params.id));
  if (!unitType) {
    res.status(404).json({ error: "د واحد ډول ونه موندل شو" });
    return;
  }
  const { name, isActive } = req.body ?? {};
  if (typeof name === "string") {
    const trimmed = name.trim();
    if (!trimmed) {
      res.status(400).json({ error: "نوم اړین دی" });
      return;
    }
    const existing = await UnitType.findOne({ where: { name: trimmed } });
    if (existing && existing.id !== unitType.id) {
      res.status(409).json({ error: "دا ډول له مخکې ثبت دی" });
      return;
    }
    unitType.name = trimmed;
  }
  if (typeof isActive === "boolean") unitType.isActive = isActive;
  await unitType.save();
  await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "UnitType", entityId: String(unitType.id), details: req.body });
  res.json(unitType);
});

export default router;
