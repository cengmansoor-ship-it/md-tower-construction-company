import { Router, type IRouter } from "express";
import { TrashItem, User } from "@workspace/db-sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { purgeExpiredTrashItems, purgeTrashItem, restoreTrashItem } from "../lib/trash";

const router: IRouter = Router();

router.get("/", requireAuth, requirePermission("settings.manage"), async (_req, res) => {
  await purgeExpiredTrashItems();
  const items = await TrashItem.findAll({
    where: { purgedAt: null, restoredAt: null },
    order: [["deletedAt", "DESC"]],
    include: [{ model: User, as: "deletedBy" }],
    limit: 500,
  });
  res.json(items.map((item) => {
    const row = item.toJSON() as Record<string, unknown> & { deletedBy?: { username?: string | null } };
    return {
      ...row,
      snapshot: item.snapshot ? JSON.parse(item.snapshot) : null,
      deletedByUsername: row.deletedBy?.username ?? null,
    };
  }));
});

router.post("/:id/restore", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  const { reason } = req.body ?? {};
  try {
    const item = await restoreTrashItem({
      trashItemId: Number(req.params.id),
      userId: req.auth!.userId,
      reason: typeof reason === "string" ? reason.trim() : null,
    });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Trash restore failed" });
  }
});

router.post("/:id/purge", requireAuth, requirePermission("settings.manage"), async (req: AuthedRequest, res) => {
  const { reason } = req.body ?? {};
  if (typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "reason is required" });
    return;
  }
  try {
    const item = await purgeTrashItem({ trashItemId: Number(req.params.id), userId: req.auth!.userId, reason: reason.trim() });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Trash purge failed" });
  }
});

export default router;
