import { Router, type IRouter } from "express";
import { Op } from "sequelize";
import { Delegation, Role, User, getKafilLedgerReport, hashPassword } from "@workspace/db-sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";
import { PASSWORD_POLICY_TEXT, passwordValidationMessage } from "../lib/passwordPolicy";

const router: IRouter = Router();
const KAFIL_ROLE = "kafil";

function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isCurrentlyActive(delegation: Delegation): boolean {
  const today = todayIsoDate();
  return delegation.isActive && delegation.startDate <= today && delegation.endDate >= today;
}

async function syncKafilRoleForUser(userId: number): Promise<void> {
  const user = await User.findByPk(userId);
  const kafilRole = await Role.findOne({ where: { name: KAFIL_ROLE } });
  if (!user || !kafilRole) return;

  const today = todayIsoDate();
  const hasActiveDelegation = await Delegation.findOne({
    where: {
      delegatedUserId: userId,
      isActive: true,
      startDate: { [Op.lte]: today },
      endDate: { [Op.gte]: today },
    },
  });
  const currentRoles = await user.getRoles();
  const hasKafilRole = currentRoles.some((role) => role.name === KAFIL_ROLE);

  if (hasActiveDelegation && !hasKafilRole) {
    await user.addRole(kafilRole);
    return;
  }
  if (!hasActiveDelegation && hasKafilRole) {
    await user.setRoles(currentRoles.filter((role) => role.name !== KAFIL_ROLE));
  }
}

async function expireOldDelegations(): Promise<void> {
  const today = todayIsoDate();
  const expired = await Delegation.findAll({
    where: { isActive: true, endDate: { [Op.lt]: today } },
  });
  for (const delegation of expired) {
    delegation.isActive = false;
    await delegation.save();
    await syncKafilRoleForUser(delegation.delegatedUserId);
  }
}

async function serializeDelegation(delegation: Delegation) {
  const delegatedUser = delegation.delegatedUser ?? (await User.findByPk(delegation.delegatedUserId));
  const delegatedBy = delegation.delegatedByUserId ? delegation.delegatedBy ?? (await User.findByPk(delegation.delegatedByUserId)) : null;
  return {
    id: delegation.id,
    delegatedUserId: delegation.delegatedUserId,
    delegatedUserName: delegatedUser?.fullName ?? "",
    delegatedUsername: delegatedUser?.username ?? "",
    delegatedByUserId: delegation.delegatedByUserId,
    delegatedByName: delegatedBy?.fullName ?? null,
    delegatedRole: delegation.delegatedRole,
    startDate: delegation.startDate,
    endDate: delegation.endDate,
    reason: delegation.reason,
    isActive: delegation.isActive,
    isCurrentlyActive: isCurrentlyActive(delegation),
    createdAt: delegation.createdAt,
    updatedAt: delegation.updatedAt,
  };
}

async function prepareDelegatedUser(params: {
  delegatedUserId: unknown;
  username: unknown;
  password: unknown;
  requirePassword: boolean;
}): Promise<{ user?: User; status?: number; error?: string }> {
  const userId = Number(params.delegatedUserId);
  if (!Number.isInteger(userId) || userId <= 0) return { status: 400, error: "delegatedUserId is required" };

  const delegatedUser = await User.findByPk(userId);
  if (!delegatedUser || !delegatedUser.isActive) return { status: 404, error: "Active user not found" };

  const username = cleanText(params.username);
  if (!username) return { status: 400, error: "username is required" };
  if (username.length > 64) return { status: 400, error: "username is too long" };

  const password = typeof params.password === "string" ? params.password : "";
  if (params.requirePassword && !password) return { status: 400, error: "پټنوم اړین دی." };
  if (password) {
    const passwordError = passwordValidationMessage(password, username);
    if (passwordError) return { status: 400, error: `${passwordError} ${PASSWORD_POLICY_TEXT}` };
  }

  const existingUser = await User.findOne({ where: { username } });
  const delegatedUserRoles = await delegatedUser.getRoles();
  const delegatedUserIsAdmin = delegatedUserRoles.some((role) => role.name === "admin" || role.name === "super_admin");

  if (existingUser && existingUser.id !== delegatedUser.id) {
    if (!delegatedUserIsAdmin) return { status: 409, error: "Username already exists" };
    if (!existingUser.isActive) return { status: 404, error: "Active user not found" };
    if (password) {
      existingUser.passwordHash = await hashPassword(password);
      existingUser.failedLoginAttempts = 0;
      existingUser.lockedUntil = null;
      await existingUser.save();
    }
    return { user: existingUser };
  }

  if (delegatedUserIsAdmin) {
    if (username === delegatedUser.username) {
      return { status: 400, error: "د سوپر آډمین اکاونټ د کفیل لپاره مه کاروئ؛ د کفیل لپاره جلا کارن نوم ولیکئ." };
    }
    if (!password) return { status: 400, error: "د نوي کفیل لپاره پټنوم اړین دی." };
    const user = await User.create({
      username,
      fullName: username,
      passwordHash: await hashPassword(password),
      isActive: true,
    });
    return { user };
  }

  delegatedUser.username = username;
  if (password) delegatedUser.passwordHash = await hashPassword(password);
  await delegatedUser.save();

  return { user: delegatedUser };
}

router.get("/", requireAuth, requirePermission("delegations.view"), async (_req, res) => {
  await expireOldDelegations();
  const delegations = await Delegation.findAll({
    include: [
      { model: User, as: "delegatedUser" },
      { model: User, as: "delegatedBy" },
    ],
    order: [
      ["isActive", "DESC"],
      ["createdAt", "DESC"],
    ],
  });
  res.json(await Promise.all(delegations.map(serializeDelegation)));
});

router.get("/active", requireAuth, requirePermission("delegations.view"), async (_req, res) => {
  await expireOldDelegations();
  const today = todayIsoDate();
  const delegations = await Delegation.findAll({
    where: {
      isActive: true,
      startDate: { [Op.lte]: today },
      endDate: { [Op.gte]: today },
    },
    include: [
      { model: User, as: "delegatedUser" },
      { model: User, as: "delegatedBy" },
    ],
    order: [["endDate", "ASC"]],
  });
  res.json(await Promise.all(delegations.map(serializeDelegation)));
});

router.get("/:id/ledger", requireAuth, requirePermission("delegations.view"), async (req, res) => {
  const delegationId = Number(req.params.id);
  if (!Number.isInteger(delegationId) || delegationId <= 0) {
    res.status(400).json({ error: "Invalid delegation id" });
    return;
  }
  const delegation = await Delegation.findByPk(delegationId);
  if (!delegation) {
    res.status(404).json({ error: "Delegation not found" });
    return;
  }
  const startDate = typeof req.query.startDate === "string" && isIsoDate(req.query.startDate) ? req.query.startDate : delegation.startDate;
  const endDate = typeof req.query.endDate === "string" && isIsoDate(req.query.endDate) ? req.query.endDate : delegation.endDate;
  const currencyCode = typeof req.query.currency === "string" ? req.query.currency : undefined;
  res.json(await getKafilLedgerReport({ delegationId, startDate, endDate, currencyCode }));
});

router.post("/", requireAuth, requirePermission("delegations.manage"), async (req: AuthedRequest, res) => {
  const { delegatedUserId, username, password, startDate, endDate, reason } = req.body ?? {};
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    res.status(400).json({ error: "startDate and endDate are required" });
    return;
  }
  if (endDate < startDate) {
    res.status(400).json({ error: "endDate must be after startDate" });
    return;
  }
  const prepared = await prepareDelegatedUser({ delegatedUserId, username, password, requirePassword: true });
  if (!prepared.user) {
    res.status(prepared.status ?? 400).json({ error: prepared.error ?? "Invalid delegated user" });
    return;
  }

  const delegation = await Delegation.create({
    delegatedUserId: prepared.user.id,
    delegatedByUserId: req.auth!.userId,
    delegatedRole: KAFIL_ROLE,
    startDate,
    endDate,
    reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
    isActive: true,
  });
  await syncKafilRoleForUser(prepared.user.id);
  await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "Delegation", entityId: String(delegation.id) });
  res.status(201).json(await serializeDelegation(delegation));
});

router.put("/:id", requireAuth, requirePermission("delegations.manage"), async (req: AuthedRequest, res) => {
  const delegation = await Delegation.findByPk(Number(req.params.id));
  if (!delegation) {
    res.status(404).json({ error: "Delegation not found" });
    return;
  }
  const originalUserId = delegation.delegatedUserId;
  const { delegatedUserId, username, password, startDate, endDate, reason, isActive } = req.body ?? {};

  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    res.status(400).json({ error: "startDate and endDate are required" });
    return;
  }
  if (endDate < startDate) {
    res.status(400).json({ error: "endDate must be after startDate" });
    return;
  }
  const prepared = await prepareDelegatedUser({ delegatedUserId, username, password, requirePassword: false });
  if (!prepared.user) {
    res.status(prepared.status ?? 400).json({ error: prepared.error ?? "Invalid delegated user" });
    return;
  }
  const nextUserId = prepared.user.id;

  delegation.delegatedUserId = nextUserId;
  delegation.startDate = startDate;
  delegation.endDate = endDate;
  delegation.reason = typeof reason === "string" && reason.trim() ? reason.trim() : null;
  if (typeof isActive === "boolean") delegation.isActive = isActive;
  await delegation.save();
  await syncKafilRoleForUser(originalUserId);
  if (originalUserId !== nextUserId) await syncKafilRoleForUser(nextUserId);
  await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "Delegation", entityId: String(delegation.id) });
  res.json(await serializeDelegation(delegation));
});

router.put("/:id/deactivate", requireAuth, requirePermission("delegations.manage"), async (req: AuthedRequest, res) => {
  const delegation = await Delegation.findByPk(Number(req.params.id));
  if (!delegation) {
    res.status(404).json({ error: "Delegation not found" });
    return;
  }
  delegation.isActive = false;
  await delegation.save();
  await syncKafilRoleForUser(delegation.delegatedUserId);
  await recordAudit({ userId: req.auth!.userId, action: "deactivate", entityType: "Delegation", entityId: String(delegation.id) });
  res.json(await serializeDelegation(delegation));
});

router.put("/:id/activate", requireAuth, requirePermission("delegations.manage"), async (req: AuthedRequest, res) => {
  const delegation = await Delegation.findByPk(Number(req.params.id));
  if (!delegation) {
    res.status(404).json({ error: "Delegation not found" });
    return;
  }
  if (delegation.endDate < todayIsoDate()) {
    res.status(400).json({ error: "Expired delegation cannot be activated" });
    return;
  }
  delegation.isActive = true;
  await delegation.save();
  await syncKafilRoleForUser(delegation.delegatedUserId);
  await recordAudit({ userId: req.auth!.userId, action: "activate", entityType: "Delegation", entityId: String(delegation.id) });
  res.json(await serializeDelegation(delegation));
});

router.delete("/:id", requireAuth, requirePermission("delegations.manage"), async (req: AuthedRequest, res) => {
  const delegation = await Delegation.findByPk(Number(req.params.id));
  if (!delegation) {
    res.status(404).json({ error: "Delegation not found" });
    return;
  }
  const userId = delegation.delegatedUserId;
  await delegation.destroy();
  await syncKafilRoleForUser(userId);
  await recordAudit({ userId: req.auth!.userId, action: "delete", entityType: "Delegation", entityId: String(req.params.id) });
  res.status(204).send();
});

export default router;
