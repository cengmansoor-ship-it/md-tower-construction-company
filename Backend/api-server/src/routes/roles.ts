import { Router, type IRouter } from "express";
import { Role, Permission } from "@workspace/db-sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";

const router: IRouter = Router();

router.get("/", requireAuth, async (_req, res) => {
  const roles = await Role.findAll({ order: [["id", "ASC"]] });
  const withPermissions = await Promise.all(
    roles.map(async (role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: (await role.getPermissions()).map((p) => p.key),
    })),
  );
  res.json(withPermissions);
});

router.get("/permissions", requireAuth, async (_req, res) => {
  const permissions = await Permission.findAll({ order: [["id", "ASC"]] });
  res.json(permissions);
});

router.post("/", requireAuth, requirePermission("roles.manage"), async (req: AuthedRequest, res) => {
  const { name, description } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const existing = await Role.findOne({ where: { name: name.trim() } });
  if (existing) {
    res.status(409).json({ error: "Role name already exists" });
    return;
  }
  const role = await Role.create({ name: name.trim(), description: description ?? null });
  await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "Role", entityId: String(role.id) });
  res.status(201).json(role);
});

router.put("/:id/permissions", requireAuth, requirePermission("roles.manage"), async (req: AuthedRequest, res) => {
  const role = await Role.findByPk(Number(req.params.id));
  if (!role) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  const keys: unknown = req.body?.permissionKeys;
  if (!Array.isArray(keys) || !keys.every((k) => typeof k === "string")) {
    res.status(400).json({ error: "permissionKeys must be a string array" });
    return;
  }
  const permissions = await Permission.findAll({ where: { key: keys } });
  await role.setPermissions(permissions);
  await recordAudit({
    userId: req.auth!.userId,
    action: "update",
    entityType: "Role",
    entityId: String(role.id),
    details: { permissionKeys: keys },
  });
  res.json({ id: role.id, name: role.name, permissions: permissions.map((p) => p.key) });
});

export default router;
