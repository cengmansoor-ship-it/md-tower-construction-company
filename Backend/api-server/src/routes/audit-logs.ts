import { Router, type IRouter } from "express";
import { AuditLog, User } from "@workspace/db-sequelize";
import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";

const router: IRouter = Router();

router.get("/", requireAuth, requirePermission("settings.manage"), async (req, res) => {
  const limit = Math.min(Number(req.query["limit"]) || 50, 200);
  const offset = Number(req.query["offset"]) || 0;
  const { rows, count } = await AuditLog.findAndCountAll({
    order: [["id", "DESC"]],
    limit,
    offset,
  });
  const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is number => id !== null))];
  const users = await User.findAll({ where: { id: userIds } });
  const userMap = new Map(users.map((u) => [u.id, u.username]));
  res.json({
    total: count,
    items: rows.map((r) => ({
      id: r.id,
      username: r.userId !== null ? (userMap.get(r.userId) ?? null) : null,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      details: r.details ? JSON.parse(r.details) : null,
      createdAt: r.createdAt,
    })),
  });
});

export default router;
