import { Router, type IRouter } from "express";
import { CashAccount, Account } from "@workspace/db-sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";

const router: IRouter = Router();

router.get("/", requireAuth, async (_req, res) => {
  const accounts = await CashAccount.findAll({ include: [{ model: Account, as: "account" }], order: [["id", "ASC"]] });
  res.json(accounts);
});

router.post("/", requireAuth, requirePermission("accounting.manage"), async (req: AuthedRequest, res) => {
  const { name, currencyCode, accountId } = req.body ?? {};
  if (typeof name !== "string" || !name.trim() || typeof currencyCode !== "string" || typeof accountId !== "number") {
    res.status(400).json({ error: "name, currencyCode and accountId are required" });
    return;
  }
  const account = await Account.findByPk(accountId);
  if (!account) {
    res.status(400).json({ error: "Account not found" });
    return;
  }
  const cashAccount = await CashAccount.create({ name: name.trim(), currencyCode, accountId, isActive: true });
  await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "CashAccount", entityId: String(cashAccount.id) });
  res.status(201).json(cashAccount);
});

export default router;
