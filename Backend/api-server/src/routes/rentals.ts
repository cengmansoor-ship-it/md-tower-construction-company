import { Router, type IRouter } from "express";
import {
  Rental,
  RentalReceipt,
  Unit,
  UnitType,
  Floor,
  Block,
  Party,
  PartyRole,
  createRental,
  addRentalReceipt,
  reverseRentalReceipt,
  endRental,
  getRentalBalance,
  PostingError,
  type RentalFrequency,
} from "@workspace/db-sequelize";
import { Op } from "sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";
import { moveToTrash } from "../lib/trash";

const router: IRouter = Router();

function unitTypeMatches(name: string | undefined, filter: string | undefined): boolean {
  if (!filter) return true;
  const normalizedFilter = filter.trim().toLowerCase();
  const normalizedName = (name ?? "").trim().toLowerCase();
  if (normalizedFilter === "shop") {
    return normalizedName.includes("shop") || normalizedName.includes("دوکان") || normalizedName.includes("دکان");
  }
  return normalizedName === normalizedFilter;
}

function rentalMatchesSearch(row: unknown, search: string | undefined): boolean {
  if (!search) return true;
  const rental = row as {
    rentalNumber?: string | null;
    notes?: string | null;
    tenant?: { name?: string | null; fatherName?: string | null; phone1?: string | null; tazkiraNumber?: string | null };
    unit?: { unitNumber?: string | null; floor?: { name?: string | null; block?: { name?: string | null; code?: string | null } } };
  };
  const needle = search.trim().toLowerCase();
  const haystack = [
    rental.rentalNumber,
    rental.notes,
    rental.tenant?.name,
    rental.tenant?.fatherName,
    rental.tenant?.phone1,
    rental.tenant?.tazkiraNumber,
    rental.unit?.unitNumber,
    rental.unit?.floor?.name,
    rental.unit?.floor?.block?.name,
    rental.unit?.floor?.block?.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function normalizeOptionalPhone(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{10}$/.test(value.trim())) {
    throw new Error(`${label} باید دقیق ۱۰ عدده وي`);
  }
  return value.trim();
}

function partySearchClauses(search: string): Record<string, unknown>[] {
  return [
    { name: { [Op.like]: `%${search}%` } },
    { fatherName: { [Op.like]: `%${search}%` } },
    { tazkiraNumber: { [Op.like]: `%${search}%` } },
    { phone1: { [Op.like]: `%${search}%` } },
    { address: { [Op.like]: `%${search}%` } },
    { notes: { [Op.like]: `%${search}%` } },
  ];
}

async function tenantRolePartyIds(): Promise<number[]> {
  const roles = await PartyRole.findAll({ where: { role: "tenant" }, attributes: ["partyId"] });
  return Array.from(new Set(roles.map((role) => role.partyId)));
}

const rentalIncludes = [
  { model: Party, as: "tenant" as const, where: { deletedAt: null }, required: true },
  {
    model: Unit,
    as: "unit" as const,
    include: [
      { model: UnitType, as: "unitType" as const },
      { model: Floor, as: "floor" as const, include: [{ model: Block, as: "block" as const }] },
    ],
  },
];

router.get("/", requireAuth, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const unitType = typeof req.query.unitType === "string" ? req.query.unitType : undefined;
  const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const where: Record<string, unknown> = {};
  if (status) where["status"] = status;
  if (startDate || endDate) {
    where["startDate"] = {
      ...(startDate ? { [Op.gte]: startDate } : {}),
      ...(endDate ? { [Op.lte]: endDate } : {}),
    };
  }
  const rentals = await Rental.findAll({ where, order: [["id", "DESC"]], include: rentalIncludes });
  const withBalances = await Promise.all(
    rentals.map(async (r) => ({ ...r.toJSON(), balance: await getRentalBalance(r) })),
  );
  res.json(
    withBalances.filter((r) =>
      unitTypeMatches((r as { unit?: { unitType?: { name?: string } } }).unit?.unitType?.name, unitType) &&
      rentalMatchesSearch(r, q),
    ),
  );
});

router.get("/tenants", requireAuth, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const rolePartyIds = await tenantRolePartyIds();
  const tenantFilters: Record<string, unknown>[] = [{ type: "tenant" }];
  if (rolePartyIds.length) tenantFilters.push({ id: { [Op.in]: rolePartyIds } });
  const andFilters: Array<Record<string | symbol, unknown>> = [{ [Op.or]: tenantFilters }];
  if (q) andFilters.push({ [Op.or]: partySearchClauses(q) });
  const parties = await Party.findAll({
    where: { deletedAt: null, [Op.and]: andFilters },
    order: [["name", "ASC"]],
    limit: 200,
  });
  res.json(parties);
});

router.post("/tenants", requireAuth, requirePermission("rentals.manage"), async (req: AuthedRequest, res) => {
  const { name, fatherName, tazkiraNumber, phone1, address, notes } = req.body ?? {};
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanName) {
    res.status(400).json({ error: "د کرایه دار نوم اړین دی" });
    return;
  }

  let normalizedPhone1: string | null;
  try {
    normalizedPhone1 = normalizeOptionalPhone(phone1, "تماس شمېره");
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "د تماس شمېره ناسمه ده" });
    return;
  }

  const cleanFatherName = typeof fatherName === "string" && fatherName.trim() ? fatherName.trim() : null;
  const cleanTazkiraNumber = typeof tazkiraNumber === "string" && tazkiraNumber.trim() ? tazkiraNumber.trim() : null;
  const identityClauses: Record<string, unknown>[] = [];
  if (cleanTazkiraNumber) identityClauses.push({ tazkiraNumber: cleanTazkiraNumber });
  if (normalizedPhone1) identityClauses.push({ phone1: normalizedPhone1 });

  let existingTenant = identityClauses.length
    ? await Party.findOne({ where: { deletedAt: null, [Op.or]: identityClauses }, order: [["id", "ASC"]] })
    : null;

  if (!existingTenant) {
    const rolePartyIds = await tenantRolePartyIds();
    const nameClauses: Record<string, unknown>[] = [{ type: "tenant", name: cleanName, fatherName: cleanFatherName }];
    if (rolePartyIds.length) nameClauses.push({ id: { [Op.in]: rolePartyIds }, name: cleanName, fatherName: cleanFatherName });
    existingTenant = await Party.findOne({ where: { deletedAt: null, [Op.or]: nameClauses }, order: [["id", "ASC"]] });
  }

  if (existingTenant) {
    let changed = false;
    if (!existingTenant.isActive) {
      existingTenant.isActive = true;
      changed = true;
    }
    if (!existingTenant.fatherName && cleanFatherName) {
      existingTenant.fatherName = cleanFatherName;
      changed = true;
    }
    if (!existingTenant.tazkiraNumber && cleanTazkiraNumber) {
      existingTenant.tazkiraNumber = cleanTazkiraNumber;
      changed = true;
    }
    if (!existingTenant.phone1 && normalizedPhone1) {
      existingTenant.phone1 = normalizedPhone1;
      changed = true;
    }
    if (!existingTenant.address && typeof address === "string" && address.trim()) {
      existingTenant.address = address.trim();
      changed = true;
    }
    if (!existingTenant.notes && typeof notes === "string" && notes.trim()) {
      existingTenant.notes = notes.trim();
      changed = true;
    }
    if (changed) await existingTenant.save();
    await PartyRole.findOrCreate({ where: { partyId: existingTenant.id, role: "tenant" }, defaults: { partyId: existingTenant.id, role: "tenant" } });
    await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "Party", entityId: String(existingTenant.id), details: { source: "rentals-tenant-reuse" } });
    res.status(200).json(existingTenant);
    return;
  }

  const tenant = await Party.create({
    type: "tenant",
    name: cleanName,
    fatherName: cleanFatherName,
    grandfatherName: null,
    tazkiraNumber: cleanTazkiraNumber,
    taxRegNumber: null,
    phone1: normalizedPhone1,
    phone2: null,
    address: typeof address === "string" && address.trim() ? address.trim() : null,
    notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
    photoUrl: null,
    isActive: true,
  });
  await PartyRole.findOrCreate({ where: { partyId: tenant.id, role: "tenant" }, defaults: { partyId: tenant.id, role: "tenant" } });
  await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "Party", entityId: String(tenant.id), details: { ...req.body, type: "tenant", source: "rentals" } });
  res.status(201).json(tenant);
});

router.get("/:id", requireAuth, async (req, res) => {
  const rental = await Rental.findByPk(Number(req.params.id), {
    include: [...rentalIncludes, { model: RentalReceipt, as: "receipts" as const }],
  });
  if (!rental) {
    res.status(404).json({ error: "کرایه ونه موندل شوه" });
    return;
  }
  const balance = await getRentalBalance(rental);
  res.json({ ...rental.toJSON(), balance });
});

router.post("/", requireAuth, requirePermission("rentals.manage"), async (req: AuthedRequest, res) => {
  const {
    unitId,
    tenantPartyId,
    startDate,
    endDate,
    rentAmount,
    frequency,
    depositAmount,
    currencyCode,
    notes,
    firstReceivedAmount,
    firstReceiptMethod,
    firstReceiptCashAccountId,
    firstReceiptReference,
    firstReceiptNote,
  } = req.body ?? {};
  if (
    typeof unitId !== "number" ||
    typeof tenantPartyId !== "number" ||
    typeof startDate !== "string" ||
    rentAmount === undefined ||
    typeof frequency !== "string" ||
    typeof currencyCode !== "string"
  ) {
    res.status(400).json({ error: "ملکیت، کرایه دار، تاریخ، کرایه، تکرار او اسعار اړین دي" });
    return;
  }
  try {
    const rental = await createRental({
      unitId,
      tenantPartyId,
      startDate,
      endDate: endDate ?? null,
      rentAmount,
      frequency: frequency as RentalFrequency,
      depositAmount: depositAmount ?? 0,
      currencyCode,
      notes: notes ?? null,
      createdByUserId: req.auth!.userId,
      firstReceivedAmount: firstReceivedAmount ?? null,
      firstReceiptMethod: firstReceiptMethod ?? undefined,
      firstReceiptCashAccountId: firstReceiptCashAccountId ?? null,
      firstReceiptReference: firstReceiptReference ?? null,
      firstReceiptNote: firstReceiptNote ?? null,
    });
    await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "Rental", entityId: String(rental.id), details: req.body });
    res.status(201).json(rental);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/:id/receipts", requireAuth, requirePermission("rentals.manage"), async (req: AuthedRequest, res) => {
  const { amount, currencyCode, receiptDate, method, cashAccountId, reference, note, allowOverpayment } = req.body ?? {};
  if (amount === undefined || typeof currencyCode !== "string" || typeof receiptDate !== "string") {
    res.status(400).json({ error: "پیسې، اسعار او تاریخ اړین دي" });
    return;
  }
  try {
    const receipt = await addRentalReceipt({
      rentalId: Number(req.params.id),
      amount,
      currencyCode,
      receiptDate,
      method,
      cashAccountId: cashAccountId ?? null,
      reference: reference ?? null,
      note: note ?? null,
      receivedByUserId: req.auth!.userId,
      allowOverpayment: Boolean(allowOverpayment),
    });
    await recordAudit({
      userId: req.auth!.userId,
      action: "create",
      entityType: "RentalReceipt",
      entityId: String(receipt.id),
      details: req.body,
    });
    res.status(201).json(receipt);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/:id/receipts/:receiptId/reverse", requireAuth, requirePermission("rentals.manage"), async (req: AuthedRequest, res) => {
  const { reason } = req.body ?? {};
  if (typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "د بېرته کولو دلیل اړین دی" });
    return;
  }
  try {
    const snapshot = await RentalReceipt.findByPk(Number(req.params.receiptId));
    const receipt = await reverseRentalReceipt(Number(req.params.receiptId), { userId: req.auth!.userId, reason: reason.trim() });
    await moveToTrash({
      userId: req.auth!.userId,
      entityType: "RentalReceipt",
      entityId: receipt.id,
      displayName: receipt.receiptNumber || `رسید ${receipt.id}`,
      sourcePath: `/rentals/${req.params.id}`,
      snapshot: snapshot?.toJSON() ?? receipt.toJSON(),
      reason: reason.trim(),
    });
    res.status(201).json(receipt);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/:id/end", requireAuth, requirePermission("rentals.manage"), async (req: AuthedRequest, res) => {
  const { endDate } = req.body ?? {};
  if (typeof endDate !== "string") {
    res.status(400).json({ error: "د ختم تاریخ اړین دی" });
    return;
  }
  try {
    const rental = await endRental(Number(req.params.id), { userId: req.auth!.userId, endDate });
    await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "Rental", entityId: String(rental.id), details: { endDate } });
    res.json(rental);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
