import type { NextFunction, Response } from "express";
import { Op } from "sequelize";
import { Delegation, User } from "@workspace/db-sequelize";
import type { AuthedRequest } from "./requireAuth";

const KAFIL_ROLE = "kafil";

function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function activeRoleForUser(userId: number): Promise<string | null> {
  const today = todayIsoDate();
  const activeDelegation = await Delegation.findOne({
    where: {
      delegatedUserId: userId,
      delegatedRole: KAFIL_ROLE,
      isActive: true,
      startDate: { [Op.lte]: today },
      endDate: { [Op.gte]: today },
    },
  });
  return activeDelegation ? KAFIL_ROLE : null;
}

export function requirePermission(permissionKey: string) {
  return async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const user = await User.findByPk(req.auth.userId);
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const roles = await user.getRoles();
    const activeRole = await activeRoleForUser(user.id);
    const effectiveRoles = activeRole ? roles.filter((role) => role.name === activeRole) : roles;
    for (const role of effectiveRoles) {
      const permissions = await role.getPermissions?.();
      if (permissions?.some((p) => p.key === permissionKey)) {
        next();
        return;
      }
    }
    res.status(403).json({ error: "Forbidden — missing permission: " + permissionKey });
  };
}
