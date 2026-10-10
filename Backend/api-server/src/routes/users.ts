import { Router, type IRouter } from "express";
import { User, Role, hashPassword } from "@workspace/db-sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";
import { PASSWORD_POLICY_TEXT, passwordValidationMessage } from "../lib/passwordPolicy";

const router: IRouter = Router();

async function serializeUser(user: User) {
  const roles = await user.getRoles();
  const isLocked = !!(user.lockedUntil && user.lockedUntil.getTime() > Date.now());
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    isActive: user.isActive,
    roles: roles.map((r) => r.name),
    createdAt: user.createdAt,
    failedLoginAttempts: user.failedLoginAttempts,
    isLocked,
    lockedUntil: user.lockedUntil,
  };
}

router.get("/", requireAuth, requirePermission("users.manage"), async (_req, res) => {
  const users = await User.findAll({ order: [["id", "ASC"]] });
  res.json(await Promise.all(users.map(serializeUser)));
});

router.post("/", requireAuth, requirePermission("users.manage"), async (req: AuthedRequest, res) => {
  const { username, fullName, password, roleNames } = req.body ?? {};
  if (typeof username !== "string" || !username.trim() || typeof fullName !== "string" || !fullName.trim() || typeof password !== "string") {
    res.status(400).json({ error: "کارن نوم، بشپړ نوم او پټنوم اړین دي." });
    return;
  }
  const passwordError = passwordValidationMessage(password, username);
  if (passwordError) {
    res.status(400).json({ error: `${passwordError} ${PASSWORD_POLICY_TEXT}` });
    return;
  }
  const existing = await User.findOne({ where: { username: username.trim() } });
  if (existing) {
    res.status(409).json({ error: "دا کارن نوم مخکې ثبت شوی دی." });
    return;
  }
  const user = await User.create({
    username: username.trim(),
    fullName: fullName.trim(),
    passwordHash: await hashPassword(password),
    isActive: true,
  });
  if (Array.isArray(roleNames) && roleNames.length > 0) {
    const roles = await Role.findAll({ where: { name: roleNames } });
    await user.setRoles(roles);
  }
  await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "User", entityId: String(user.id) });
  res.status(201).json(await serializeUser(user));
});

router.put("/:id", requireAuth, requirePermission("users.manage"), async (req: AuthedRequest, res) => {
  const user = await User.findByPk(Number(req.params.id));
  if (!user) {
    res.status(404).json({ error: "کاروونکی ونه موندل شو." });
    return;
  }
  const { username, fullName, isActive, password, roleNames } = req.body ?? {};
  if (typeof username === "string") {
    const nextUsername = username.trim();
    if (!nextUsername) {
      res.status(400).json({ error: "کارن نوم اړین دی." });
      return;
    }
    if (nextUsername !== user.username) {
      const existing = await User.findOne({ where: { username: nextUsername } });
      if (existing && existing.id !== user.id) {
        res.status(409).json({ error: "دا کارن نوم مخکې ثبت شوی دی." });
        return;
      }
      user.username = nextUsername;
    }
  }
  if (typeof fullName === "string" && fullName.trim()) user.fullName = fullName.trim();
  if (typeof isActive === "boolean") user.isActive = isActive;
  if (typeof password === "string" && password.length > 0) {
    const passwordError = passwordValidationMessage(password, user.username);
    if (passwordError) {
      res.status(400).json({ error: `${passwordError} ${PASSWORD_POLICY_TEXT}` });
      return;
    }
    user.passwordHash = await hashPassword(password);
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
  }
  await user.save();
  if (Array.isArray(roleNames)) {
    const roles = await Role.findAll({ where: { name: roleNames } });
    await user.setRoles(roles);
  }
  await recordAudit({
    userId: req.auth!.userId,
    action: "update",
    entityType: "User",
    entityId: String(user.id),
    details: { username, fullName, isActive, roleNames },
  });
  res.json(await serializeUser(user));
});

/** Administrator-only: unlock an account that was locked after repeated failed logins. */
router.post("/:id/unlock", requireAuth, requirePermission("users.manage"), async (req: AuthedRequest, res) => {
  const user = await User.findByPk(Number(req.params.id));
  if (!user) {
    res.status(404).json({ error: "کاروونکی ونه موندل شو." });
    return;
  }
  await user.update({ failedLoginAttempts: 0, lockedUntil: null });
  await recordAudit({
    userId: req.auth!.userId,
    action: "account_unlocked",
    entityType: "User",
    entityId: String(user.id),
  });
  res.json(await serializeUser(user));
});

export default router;
