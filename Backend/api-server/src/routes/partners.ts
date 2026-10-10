import { Router, type Response, type IRouter } from "express";
import { Partner, PartnerTransaction, Party, PartyRole, Decimal, createPartner, addPartnerTransaction, getPartnerBalance, getPartnerBalances, PostingError } from "@workspace/db-sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";
import { moveToTrash } from "../lib/trash";

const router: IRouter = Router();

const partnerIncludes = [{ model: Party, as: "party" as const }];

router.get("/", requireAuth, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const where: Record<string, unknown> = {};
  if (status && status !== "all") where["status"] = status;
  if (!status) where["status"] = "active";
  const partners = await Partner.findAll({ where, order: [["id", "DESC"]], include: partnerIncludes });
  const withBalances = await Promise.all(
    partners.map(async (p) => ({ ...p.toJSON(), balance: await getPartnerBalance(p), balancesByCurrency: await getPartnerBalances(p) })),
  );
  res.json(withBalances);
});

router.get("/:id", requireAuth, async (req, res) => {
  const partner = await Partner.findByPk(Number(req.params.id), {
    include: [...partnerIncludes, { model: PartnerTransaction, as: "transactions" as const }],
  });
  if (!partner) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }
  const balance = await getPartnerBalance(partner);
  const balancesByCurrency = await getPartnerBalances(partner);
  res.json({ ...partner.toJSON(), balance, balancesByCurrency });
});

router.put("/:id", requireAuth, requirePermission("partners.manage"), async (req: AuthedRequest, res) => {
  const partner = await Partner.findByPk(Number(req.params.id), { include: partnerIncludes });
  if (!partner || partner.status === "inactive") {
    res.status(404).json({ error: "شریک ونه موندل شو" });
    return;
  }
  const { partyId, partyName, initialInvestment, ownershipPercent, joinDate, notes, status } = req.body ?? {};

  try {
    if (typeof partyId === "number" && partyId !== partner.partyId) {
      const party = await Party.findByPk(partyId);
      if (!party || party.type !== "partner") {
        res.status(400).json({ error: "د شریک نوم سم نه دی" });
        return;
      }
      const existing = await Partner.findOne({ where: { partyId } });
      if (existing && existing.id !== partner.id) {
        res.status(409).json({ error: "دا شخص له مخکې د شریک په توګه ثبت دی" });
        return;
      }
      partner.partyId = partyId;
      await PartyRole.findOrCreate({ where: { partyId, role: "partner" }, defaults: { partyId, role: "partner" } });
    }

    if (typeof partyName === "string" && partyName.trim()) {
      const party = await Party.findByPk(partner.partyId);
      if (party) {
        party.name = partyName.trim();
        if (party.type !== "partner") party.type = "partner";
        await party.save();
        await PartyRole.findOrCreate({ where: { partyId: party.id, role: "partner" }, defaults: { partyId: party.id, role: "partner" } });
      }
    }

    if (initialInvestment !== undefined) {
      const value = new Decimal(initialInvestment);
      if (value.lessThan(0)) {
        res.status(400).json({ error: "لومړنۍ سرمایه منفي نه شي کېدای" });
        return;
      }
      partner.initialInvestment = value.toFixed();
    }
    if (ownershipPercent !== undefined) {
      partner.ownershipPercent = ownershipPercent === null || ownershipPercent === "" ? null : new Decimal(ownershipPercent).toFixed(3);
    }
    if (typeof joinDate === "string" && joinDate.trim()) partner.joinDate = joinDate;
    if (typeof notes === "string" || notes === null) partner.notes = notes || null;
    if (status === "active" || status === "inactive") partner.status = status;

    await partner.save();
    await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "Partner", entityId: String(partner.id), details: req.body });

    const refreshed = await Partner.findByPk(partner.id, { include: partnerIncludes });
    const balance = await getPartnerBalance(partner);
    const balancesByCurrency = await getPartnerBalances(partner);
    res.json({ ...(refreshed ?? partner).toJSON(), balance, balancesByCurrency });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "د شریک اصلاح ناکامه شوه" });
  }
});

async function softDeletePartner(req: AuthedRequest, res: Response): Promise<void> {
  const { reason } = req.body ?? {};
  if (typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "د حذف دلیل اړین دی" });
    return;
  }
  const partner = await Partner.findByPk(Number(req.params.id), {
    include: [...partnerIncludes, { model: PartnerTransaction, as: "transactions" as const }],
  });
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
    entityType: "Partner",
    entityId: partner.id,
    displayName: (partner as unknown as { party?: { name?: string | null } }).party?.name || partner.partnerNumber || `Partner ${partner.id}`,
    sourcePath: "/partners",
    snapshot,
    reason: reason.trim(),
  });
  const balance = await getPartnerBalance(partner);
  const balancesByCurrency = await getPartnerBalances(partner);
  res.json({ ...partner.toJSON(), balance, balancesByCurrency });
}

router.post("/:id/delete", requireAuth, requirePermission("partners.manage"), softDeletePartner);
router.delete("/:id", requireAuth, requirePermission("partners.manage"), softDeletePartner);

router.post("/", requireAuth, requirePermission("partners.manage"), async (req: AuthedRequest, res) => {
  const { partyId, partyName, initialInvestment, currencyCode, ownershipPercent, joinDate, notes } = req.body ?? {};
  const cleanPartyName = typeof partyName === "string" ? partyName.trim() : "";
  if ((typeof partyId !== "number" && !cleanPartyName) || initialInvestment === undefined || typeof currencyCode !== "string" || typeof joinDate !== "string") {
    res.status(400).json({ error: "د شریک نوم، لومړنۍ سرمایه، اسعار او د ګډون نېټه اړین دي" });
    return;
  }
  try {
    let resolvedPartyId = typeof partyId === "number" ? partyId : null;
    if (!resolvedPartyId) {
      const existingParty =
        (await Party.findOne({ where: { type: "partner", name: cleanPartyName, deletedAt: null } })) ??
        (await Party.findOne({
          where: { name: cleanPartyName, deletedAt: null },
          include: [{ model: PartyRole, as: "roles", where: { role: "partner" }, required: true }],
        })) ??
        (await Party.findOne({ where: { name: cleanPartyName, deletedAt: null } }));
      if (existingParty) {
        if (existingParty.type !== "partner") {
          existingParty.type = "partner";
          await existingParty.save();
        }
        await PartyRole.findOrCreate({ where: { partyId: existingParty.id, role: "partner" }, defaults: { partyId: existingParty.id, role: "partner" } });
        resolvedPartyId = existingParty.id;
      } else {
        const party = await Party.create({ type: "partner", name: cleanPartyName });
        await PartyRole.findOrCreate({ where: { partyId: party.id, role: "partner" }, defaults: { partyId: party.id, role: "partner" } });
        await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "Party", entityId: String(party.id), details: { type: "partner", name: cleanPartyName, source: "partners" } });
        resolvedPartyId = party.id;
      }
    }
    const existingPartner = await Partner.findOne({ where: { partyId: resolvedPartyId }, include: partnerIncludes });
    if (existingPartner) {
      if (existingPartner.status === "inactive") {
        existingPartner.status = "active";
        await existingPartner.save();
        await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "Partner", entityId: String(existingPartner.id), details: { status: "active", source: "reuse-existing-partner" } });
      }
      const balance = await getPartnerBalance(existingPartner);
      const balancesByCurrency = await getPartnerBalances(existingPartner);
      res.status(200).json({ ...existingPartner.toJSON(), balance, balancesByCurrency });
      return;
    }
    const partner = await createPartner({
      partyId: resolvedPartyId,
      initialInvestment,
      currencyCode,
      ownershipPercent: ownershipPercent ?? null,
      joinDate,
      notes: notes ?? null,
      createdByUserId: req.auth!.userId,
    });
    await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "Partner", entityId: String(partner.id), details: req.body });
    res.status(201).json(partner);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/:id/transactions", requireAuth, requirePermission("partners.manage"), async (req: AuthedRequest, res) => {
  const { type, amount, currencyCode, transactionDate, cashAccountId, description, note } = req.body ?? {};
  if (typeof type !== "string" || amount === undefined || typeof currencyCode !== "string" || typeof transactionDate !== "string") {
    res.status(400).json({ error: "type, amount, currencyCode and transactionDate are required" });
    return;
  }
  try {
    const tx = await addPartnerTransaction({
      partnerId: Number(req.params.id),
      type: type as "investment" | "withdrawal",
      amount,
      currencyCode,
      transactionDate,
      cashAccountId: cashAccountId ?? null,
      description: typeof description === "string" ? description : null,
      note: note ?? null,
      createdByUserId: req.auth!.userId,
    });
    await recordAudit({
      userId: req.auth!.userId,
      action: "create",
      entityType: "PartnerTransaction",
      entityId: String(tx.id),
      details: req.body,
    });
    res.status(201).json(tx);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
