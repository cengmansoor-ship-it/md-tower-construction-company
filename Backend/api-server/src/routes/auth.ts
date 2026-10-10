import { Router, type IRouter } from "express";
import { Op } from "sequelize";
import { User, Role, Delegation, hashPassword, verifyPassword, signAuthToken } from "@workspace/db-sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { recordAudit } from "../lib/audit";
import { PASSWORD_POLICY_TEXT, passwordValidationMessage } from "../lib/passwordPolicy";

const router: IRouter = Router();

const COOKIE_NAME = "auth_token";
const isProduction = process.env["NODE_ENV"] === "production";
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
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

async function serializeCurrentUser(user: User) {
  const roles = await user.getRoles();
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    lastLoginAt: user.lastLoginAt,
    roles: roles.map((r: Role) => r.name),
    activeRole: await activeRoleForUser(user.id),
  };
}

async function findSingleRecoverableUser(): Promise<User | null> {
  const adminUsers = await User.findAll({
    include: [{ model: Role, as: "roles", where: { name: "admin" }, required: true }],
    order: [["id", "ASC"]],
  });
  if (adminUsers.length === 1) return adminUsers[0] ?? null;

  const allUsers = await User.findAll({ order: [["id", "ASC"]] });
  if (allUsers.length === 1) return allUsers[0] ?? null;

  return null;
}

router.post("/recover-credentials", async (req, res) => {
  const { username, newPassword, confirmNewPassword } = req.body ?? {};
  if (typeof username !== "string" || !username.trim()) {
    res.status(400).json({ error: "کارن نوم اړین دی." });
    return;
  }
  if (typeof newPassword !== "string" || !newPassword) {
    res.status(400).json({ error: "نوی پټنوم اړین دی." });
    return;
  }
  if (typeof confirmNewPassword !== "string" || !confirmNewPassword) {
    res.status(400).json({ error: "نوی پټنوم بیا ولیکئ." });
    return;
  }
  if (newPassword !== confirmNewPassword) {
    res.status(400).json({ error: "نوی پټنوم یو شان نه دی." });
    return;
  }

  const trimmedUsername = username.trim();
  const passwordError = passwordValidationMessage(newPassword, trimmedUsername);
  if (passwordError) {
    res.status(400).json({ error: `${passwordError} ${PASSWORD_POLICY_TEXT}` });
    return;
  }

  let user = await User.findOne({ where: { username: trimmedUsername } });
  let createdAccount = false;
  let renamedAccount = false;

  if (!user) {
    const anyUserExists = (await User.count()) > 0;
    if (anyUserExists) {
      user = await findSingleRecoverableUser();
      if (!user) {
        res.status(404).json({ error: "کارن نوم ونه موندل شو." });
        return;
      }
      user.username = trimmedUsername;
      renamedAccount = true;
    } else {
      user = await User.create({
        username: trimmedUsername,
        fullName: "د سیستم اداره کوونکی",
        passwordHash: await hashPassword(newPassword),
        isActive: true,
      });
      const adminRole = await Role.findOne({ where: { name: "admin" } });
      if (adminRole) await user.addRole(adminRole);
      createdAccount = true;
    }
  }

  const actualPasswordError = passwordValidationMessage(newPassword, user.username);
  if (actualPasswordError) {
    res.status(400).json({ error: `${actualPasswordError} ${PASSWORD_POLICY_TEXT}` });
    return;
  }

  user.passwordHash = await hashPassword(newPassword);
  user.isActive = true;
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await user.save();

  await recordAudit({
    userId: null,
    action: "recover_credentials",
    entityType: "User",
    entityId: String(user.id),
    details: { username: user.username, requestedUsername: trimmedUsername, createdAccount, renamedAccount },
  });

  res.json({ username: user.username, fullName: user.fullName });
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "username and password are required" });
    return;
  }

  const trimmedUsername = username.trim();
  const user = await User.findOne({ where: { username: trimmedUsername } });

  if (!user) {
    // Do not reveal whether the username exists.
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await recordAudit({
      userId: user.id,
      action: "login_blocked_locked",
      entityType: "User",
      entityId: String(user.id),
      details: { lockedUntil: user.lockedUntil },
    });
    res.status(423).json({
      error: "Account is locked due to repeated failed login attempts. Contact an administrator to unlock it.",
      lockedUntil: user.lockedUntil,
    });
    return;
  }

  if (!user.isActive || !(await verifyPassword(password, user.passwordHash))) {
    if (user.isActive) {
      const attempts = user.failedLoginAttempts + 1;
      const patch: { failedLoginAttempts: number; lockedUntil?: Date } = { failedLoginAttempts: attempts };
      let locked = false;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        patch.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        locked = true;
      }
      await user.update(patch);
      await recordAudit({
        userId: user.id,
        action: locked ? "account_locked" : "login_failed",
        entityType: "User",
        entityId: String(user.id),
        details: { failedLoginAttempts: attempts },
      });
    }
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await user.update({ failedLoginAttempts: 0, lockedUntil: null });
  }

  await user.update({ lastLoginAt: new Date() });

  const token = signAuthToken({ userId: user.id, username: user.username });
  const secureCookie =
    isProduction && (req.secure || req.headers["x-forwarded-proto"] === "https") && !["localhost", "127.0.0.1"].includes(req.hostname);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  await recordAudit({ userId: user.id, action: "login", entityType: "User", entityId: String(user.id) });

  res.json(await serializeCurrentUser(user));
});

router.post("/logout", async (req: AuthedRequest, res) => {
  if (req.auth) {
    await recordAudit({ userId: req.auth.userId, action: "logout", entityType: "User", entityId: String(req.auth.userId) });
  }
  res.clearCookie(COOKIE_NAME);
  res.status(204).send();
});

router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await User.findByPk(req.auth!.userId);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json(await serializeCurrentUser(user));
});

router.post("/change-password", requireAuth, async (req: AuthedRequest, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ error: "اوسنی پټنوم او نوی پټنوم اړین دي" });
    return;
  }
  const user = await User.findByPk(req.auth!.userId);
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  const passwordError = passwordValidationMessage(newPassword, user.username);
  if (passwordError) {
    res.status(400).json({ error: `${passwordError} ${PASSWORD_POLICY_TEXT}` });
    return;
  }
  await user.update({ passwordHash: await hashPassword(newPassword), failedLoginAttempts: 0, lockedUntil: null });
  await recordAudit({ userId: user.id, action: "password_change", entityType: "User", entityId: String(user.id) });
  res.status(204).send();
});

export default router;
export { COOKIE_NAME };
