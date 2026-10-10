import { Router, type Response, type IRouter } from "express";
import { CompanyPartner, Decimal, nextDocumentNumber, sequelize } from "@workspace/db-sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";
import { moveToTrash } from "../lib/trash";

const router: IRouter = Router();

router.get("/", requireAuth, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const where: Record<string, unknown> = {};
  if (status && status !== "all") where["status"] = status;
  if (!status) where["status"] = "active";
  const partners = await CompanyPartner.findAll({ where, order: [["id", "DESC"]] });
  res.json(partners);
});

router.post("/", requireAuth, requirePermission("partners.manage"), async (req: AuthedRequest, res) => {
  const { name, initialInvestment, currencyCode, ownershipPercent, joinDate, notes } = req.body ?? {};
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanName || initialInvestment === undefined || typeof currencyCode !== "string" || typeof joinDate !== "string") {
    res.status(400).json({ error: "د شریک نوم، لومړنۍ سرمایه، اسعار او د ګډون نېټه اړین دي" });
    return;
  }
  try {
    const investment = new Decimal(initialInvestment);
    if (investment.lessThan(0)) {
      res.status(400).json({ error: "لومړنۍ سرمایه منفي نه شي کېدای" });
      return;
    }
    const partner = await sequelize.transaction(async (transaction) => {
      const partnerNumber = await nextDocumentNumber("company_partner", transaction);
      return CompanyPartner.create(
        {
          partnerNumber,
          name: cleanName,
          initialInvestment: investment.toFixed(),
          currencyCode,
          ownershipPercent: ownershipPercent === null || ownershipPercent === "" ? null : new Decimal(ownershipPercent).toFixed(3),
          joinDate,
          notes: notes ?? null,
          createdByUserId: req.auth!.userId,
        },
        { transaction },
      );
    });
    await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "CompanyPartner", entityId: String(partner.id), details: req.body });
    res.status(201).json(partner);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "د شریک ثبت ناکام شو" });
  }
});

router.put("/:id", requireAuth, requirePermission("partners.manage"), async (req: AuthedRequest, res) => {
  const partner = await CompanyPartner.findByPk(Number(req.params.id));
  if (!partner || partner.status === "inactive") {
    res.status(404).json({ error: "شریک ونه موندل شو" });
    return;
  }
  const { name, initialInvestment, ownershipPercent, joinDate, notes, status } = req.body ?? {};
  try {
    if (typeof name === "string" && name.trim()) partner.name = name.trim();
    if (initialInvestment !== undefined) {
      const investment = new Decimal(initialInvestment);
      if (investment.lessThan(0)) {
        res.status(400).json({ error: "لومړنۍ سرمایه منفي نه شي کېدای" });
        return;
      }
      partner.initialInvestment = investment.toFixed();
    }
    if (ownershipPercent !== undefined) {
      partner.ownershipPercent = ownershipPercent === null || ownershipPercent === "" ? null : new Decimal(ownershipPercent).toFixed(3);
    }
    if (typeof joinDate === "string" && joinDate.trim()) partner.joinDate = joinDate;
    if (typeof notes === "string" || notes === null) partner.notes = notes || null;
    if (status === "active" || status === "inactive") partner.status = status;
    await partner.save();
    await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "CompanyPartner", entityId: String(partner.id), details: req.body });
    res.json(partner);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "د شریک اصلاح ناکامه شوه" });
  }
});

async function softDeleteCompanyPartner(req: AuthedRequest, res: Response): Promise<void> {
  const { reason } = req.body ?? {};
  if (typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "د حذف دلیل اړین دی" });
    return;
  }
  const partner = await CompanyPartner.findByPk(Number(req.params.id));
  if (!partner) {
    res.status(404).json({ error: "شریک ونه موندل شو" });
    return;
  }
  if (partner.status === "inactive") {
    res.status(400).json({ error: "دا شریک مخکې حذف شوی دی" });
    return;
  }
  const snapshot = partner.toJSON();
  partner.status = "inactive";
  await partner.save();
  await moveToTrash({
    userId: req.auth!.userId,
    entityType: "CompanyPartner",
    entityId: partner.id,
    displayName: partner.name,
    sourcePath: "/partners",
    snapshot,
    reason: reason.trim(),
  });
  res.json(partner);
}

router.post("/:id/delete", requireAuth, requirePermission("partners.manage"), softDeleteCompanyPartner);
router.delete("/:id", requireAuth, requirePermission("partners.manage"), softDeleteCompanyPartner);

export default router;
