import { Op, type Model, type ModelStatic, type Transaction } from "sequelize";
import {
  CompanyPartner,
  DailyCashEntry,
  Decimal,
  Employee,
  EmployeeDocument,
  EmployeePayment,
  ExchangeTransaction,
  Expense,
  JournalTransaction,
  Partner,
  PartnerTransaction,
  Party,
  PartyRole,
  PostingLink,
  Project,
  Purchase,
  PurchasePayment,
  PurchaseReturn,
  Rental,
  RentalReceipt,
  Sale,
  SaleCredit,
  SaleDocument,
  SaleReceipt,
  TrashItem,
  Unit,
  sequelize,
  type PartyType,
} from "@workspace/db-sequelize";
import { recordAudit } from "./audit";

const RETENTION_DAYS = 30;

function purgeDateFrom(date: Date): Date {
  return new Date(date.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export async function moveToTrash(params: {
  userId: number | null;
  entityType: string;
  entityId: string | number;
  displayName: string;
  sourcePath?: string | null;
  snapshot?: unknown;
  reason: string;
}): Promise<TrashItem> {
  const deletedAt = new Date();
  const item = await TrashItem.create({
    entityType: params.entityType,
    entityId: String(params.entityId),
    displayName: params.displayName.slice(0, 256),
    sourcePath: params.sourcePath ?? null,
    snapshot: params.snapshot === undefined ? null : JSON.stringify(params.snapshot),
    deleteReason: params.reason,
    deletedByUserId: params.userId,
    deletedAt,
    purgeAfter: purgeDateFrom(deletedAt),
  });
  await recordAudit({
    userId: params.userId,
    action: "delete",
    entityType: params.entityType,
    entityId: String(params.entityId),
    details: {
      reason: params.reason,
      trashItemId: item.id,
      purgeAfter: item.purgeAfter,
      sourcePath: params.sourcePath ?? null,
    },
  });
  return item;
}

export async function purgeExpiredTrashItems(): Promise<number> {
  const expired = await TrashItem.findAll({
    where: { purgedAt: null, restoredAt: null, purgeAfter: { [Op.lte]: new Date() } },
    limit: 200,
  });
  for (const item of expired) {
    item.purgedAt = new Date();
    item.purgeReason = "۳۰ ورځې پوره شوې؛ ریکارډ د کثافت داني څخه اتومات پاک شو";
    await item.save();
    await recordAudit({
      userId: null,
      action: "trash_auto_purge",
      entityType: item.entityType,
      entityId: item.entityId,
      details: { trashItemId: item.id, reason: item.purgeReason },
    });
  }
  return expired.length;
}

export async function purgeTrashItem(params: { trashItemId: number; userId: number; reason: string }): Promise<TrashItem> {
  const item = await TrashItem.findByPk(params.trashItemId);
  if (!item) throw new Error("Trash item not found");
  if (item.purgedAt) throw new Error("Trash item is already purged");
  if (item.restoredAt) throw new Error("Trash item is already restored");
  item.purgedAt = new Date();
  item.purgedByUserId = params.userId;
  item.purgeReason = params.reason;
  await item.save();
  await recordAudit({
    userId: params.userId,
    action: "trash_purge",
    entityType: item.entityType,
    entityId: item.entityId,
    details: { trashItemId: item.id, reason: params.reason },
  });
  return item;
}

type RestorableModel = ModelStatic<Model> & { getAttributes: () => Record<string, unknown> };
type RestoredRecord = Model & {
  id?: number;
  save: (options?: { transaction?: Transaction }) => Promise<Model>;
  setDataValue: (key: string, value: unknown) => void;
  getDataValue: (key: string) => unknown;
};

const hardDeletedModels: Record<string, RestorableModel> = {
  EmployeeDocument: EmployeeDocument as unknown as RestorableModel,
  PurchaseReturn: PurchaseReturn as unknown as RestorableModel,
  SaleDocument: SaleDocument as unknown as RestorableModel,
};

function snapshotObject(item: TrashItem): Record<string, unknown> {
  if (!item.snapshot) return {};
  const parsed = JSON.parse(item.snapshot) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

function nestedObject(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function snapshotAttributes(model: RestorableModel, snapshot: Record<string, unknown>, id: number): Record<string, unknown> {
  const allowed = model.getAttributes();
  const attrs: Record<string, unknown> = {};
  for (const key of Object.keys(allowed)) {
    if (key in snapshot) attrs[key] = snapshot[key];
  }
  if ("id" in allowed && !("id" in attrs)) attrs["id"] = id;
  return attrs;
}

async function findOrCreateFromSnapshot(model: RestorableModel, item: TrashItem, transaction: Transaction): Promise<RestoredRecord> {
  const id = Number(item.entityId);
  if (!Number.isFinite(id)) throw new Error("Trash item id is invalid");
  const existing = await model.findByPk(id, { transaction });
  if (existing) return existing as RestoredRecord;
  const snapshot = snapshotObject(item);
  if (!Object.keys(snapshot).length) throw new Error("Trash item has no snapshot to restore");
  const attrs = snapshotAttributes(model, snapshot, id);
  return (await model.create(attrs, { transaction })) as RestoredRecord;
}

function setField(record: RestoredRecord, key: string, value: unknown): void {
  record.setDataValue(key, value);
}

function snapshotString(snapshot: Record<string, unknown>, key: string, fallback: string): string {
  const value = snapshot[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

async function restoreJournalTransaction(transactionId: number, transaction: Transaction, userId: number): Promise<void> {
  const original = await JournalTransaction.findByPk(transactionId, { transaction });
  if (!original) return;
  if (original.voidedAt) {
    original.voidedAt = null;
    original.voidedByUserId = null;
    original.voidReason = null;
    await original.save({ transaction });
  }
  const reversals = await JournalTransaction.findAll({ where: { reversalOfId: transactionId, voidedAt: null }, transaction });
  for (const reversal of reversals) {
    reversal.voidedAt = new Date();
    reversal.voidedByUserId = userId;
    reversal.voidReason = "د ټرش څخه د ریکارډ بېرته راوستلو له امله";
    await reversal.save({ transaction });
  }
  await restoreDailyCashEntryForTransaction(transactionId, transaction);
}

async function restorePostingForSource(
  sourceModule: string,
  sourceId: number,
  postingType: string,
  transaction: Transaction,
  userId: number,
): Promise<void> {
  const link = await PostingLink.findOne({ where: { sourceModule, sourceId, postingType }, transaction });
  if (!link) return;
  await restoreJournalTransaction(link.transactionId, transaction, userId);
}

async function restoreDailyCashEntryForTransaction(transactionId: number, transaction: Transaction): Promise<void> {
  const link = await PostingLink.findOne({ where: { transactionId }, transaction });
  if (link?.sourceModule !== "daily_cash") return;
  const entry = await DailyCashEntry.findByPk(link.sourceId, { transaction });
  if (!entry) return;
  if (entry.voidedAt) {
    entry.voidedAt = null;
    entry.voidedByUserId = null;
    entry.voidReason = null;
    await entry.save({ transaction });
  }
  if (entry.linkedEmployeePaymentId) {
    await EmployeePayment.update(
      { voidedAt: null, voidReason: null },
      { where: { id: entry.linkedEmployeePaymentId }, transaction },
    );
  }
}

async function restorePurchaseStatus(purchaseId: number, transaction: Transaction): Promise<void> {
  const purchase = await Purchase.findByPk(purchaseId, { transaction });
  if (!purchase || purchase.status === "cancelled") return;
  const payments = await PurchasePayment.findAll({ where: { purchaseId: purchase.id, voidedAt: null }, transaction });
  const returns = await PurchaseReturn.findAll({ where: { purchaseId: purchase.id }, transaction });
  const paid = payments.reduce((sum, payment) => sum.plus(new Decimal(payment.amount)), new Decimal(0));
  const returned = returns.reduce((sum, row) => sum.plus(new Decimal(row.amount)), new Decimal(0));
  const balance = new Decimal(purchase.totalAmount).minus(paid).minus(returned);
  purchase.status = balance.lessThanOrEqualTo(0) ? "paid" : "open";
  await purchase.save({ transaction });
}

async function restoreSaleStatus(saleId: number, transaction: Transaction): Promise<void> {
  const sale = await Sale.findByPk(saleId, { transaction });
  if (!sale || sale.status === "cancelled" || sale.status === "reversed") return;
  const receipts = await SaleReceipt.findAll({ where: { saleId: sale.id, voidedAt: null }, transaction });
  const received = receipts.reduce((sum, receipt) => sum.plus(new Decimal(receipt.amount)), new Decimal(0));
  const balance = new Decimal(sale.finalPrice).minus(received);
  sale.status = balance.lessThanOrEqualTo(0) ? "fully_paid" : "active";
  await sale.save({ transaction });
}

async function restoreTrashRecord(item: TrashItem, userId: number, transaction: Transaction): Promise<void> {
  const snapshot = snapshotObject(item);
  switch (item.entityType) {
    case "Project": {
      const record = await findOrCreateFromSnapshot(Project as unknown as RestorableModel, item, transaction);
      setField(record, "deletedAt", null);
      setField(record, "deletedByUserId", null);
      setField(record, "deleteReason", null);
      setField(record, "status", snapshotString(snapshot, "status", "active"));
      await record.save({ transaction });
      return;
    }
    case "Party": {
      const record = await findOrCreateFromSnapshot(Party as unknown as RestorableModel, item, transaction);
      setField(record, "deletedAt", null);
      setField(record, "deletedByUserId", null);
      setField(record, "deleteReason", null);
      setField(record, "isActive", typeof snapshot["isActive"] === "boolean" ? snapshot["isActive"] : true);
      await record.save({ transaction });
      const roles = Array.isArray(snapshot["roles"]) ? snapshot["roles"] : [];
      for (const roleEntry of roles) {
        const role = (roleEntry as { role?: unknown } | null)?.role;
        if (typeof role !== "string") continue;
        await PartyRole.findOrCreate({
          where: { partyId: Number(item.entityId), role: role as PartyType },
          defaults: { partyId: Number(item.entityId), role: role as PartyType },
          transaction,
        });
      }
      return;
    }
    case "Rental": {
      const record = await findOrCreateFromSnapshot(Rental as unknown as RestorableModel, item, transaction);
      await record.save({ transaction });
      await restorePostingForSource("rental", Number(item.entityId), "rental_creation", transaction, userId);
      const rentalSnapshotStatus = snapshotString(snapshot, "status", "active");
      const unitId = Number(record.getDataValue("unitId"));
      if (rentalSnapshotStatus === "active" && Number.isFinite(unitId)) {
        const unit = await Unit.findByPk(unitId, { transaction });
        const otherActive = await Rental.findOne({
          where: { unitId, status: "active", id: { [Op.ne]: Number(item.entityId) } },
          transaction,
        });
        if (unit && unit.status === "available" && !otherActive) {
          unit.status = "rented";
          await unit.save({ transaction });
        }
      }
      return;
    }
    case "PurchasePayment": {
      const record = await findOrCreateFromSnapshot(PurchasePayment as unknown as RestorableModel, item, transaction);
      setField(record, "voidedAt", null);
      setField(record, "voidReason", null);
      await record.save({ transaction });
      await restorePostingForSource("purchase_payment", Number(item.entityId), "purchase_payment", transaction, userId);
      const purchaseId = Number(record.getDataValue("purchaseId"));
      if (Number.isFinite(purchaseId)) await restorePurchaseStatus(purchaseId, transaction);
      return;
    }
    case "ExchangeTransaction": {
      const record = await findOrCreateFromSnapshot(ExchangeTransaction as unknown as RestorableModel, item, transaction);
      await record.save({ transaction });
      await restorePostingForSource("exchange", Number(item.entityId), "exchange_creation", transaction, userId);
      return;
    }
    case "PartnerTransaction": {
      const record = await findOrCreateFromSnapshot(PartnerTransaction as unknown as RestorableModel, item, transaction);
      await record.save({ transaction });
      await restorePostingForSource("partner_transaction", Number(item.entityId), "partner_transaction", transaction, userId);
      return;
    }
    case "Employee": {
      const record = await findOrCreateFromSnapshot(Employee as unknown as RestorableModel, item, transaction);
      setField(record, "deletedAt", null);
      setField(record, "deletedByUserId", null);
      setField(record, "deleteReason", null);
      setField(record, "status", snapshotString(snapshot, "status", "active"));
      await record.save({ transaction });
      return;
    }
    case "Partner": {
      const record = await findOrCreateFromSnapshot(Partner as unknown as RestorableModel, item, transaction);
      setField(record, "status", snapshotString(snapshot, "status", "active"));
      await record.save({ transaction });
      return;
    }
    case "CompanyPartner": {
      const record = await findOrCreateFromSnapshot(CompanyPartner as unknown as RestorableModel, item, transaction);
      setField(record, "status", snapshotString(snapshot, "status", "active"));
      await record.save({ transaction });
      return;
    }
    case "Expense": {
      const record = await findOrCreateFromSnapshot(Expense as unknown as RestorableModel, item, transaction);
      setField(record, "voidedAt", null);
      setField(record, "voidReason", null);
      await record.save({ transaction });
      await restorePostingForSource("expense", Number(item.entityId), "expense", transaction, userId);
      return;
    }
    case "Purchase": {
      const record = await findOrCreateFromSnapshot(Purchase as unknown as RestorableModel, item, transaction);
      setField(record, "status", snapshotString(snapshot, "status", "open"));
      await record.save({ transaction });
      await restorePostingForSource("purchase", Number(item.entityId), "purchase_creation", transaction, userId);
      return;
    }
    case "PurchaseReturn": {
      const record = await findOrCreateFromSnapshot(PurchaseReturn as unknown as RestorableModel, item, transaction);
      await record.save({ transaction });
      await restorePostingForSource("purchase_return", Number(item.entityId), "purchase_return", transaction, userId);
      const purchaseId = Number(record.getDataValue("purchaseId"));
      if (Number.isFinite(purchaseId)) await restorePurchaseStatus(purchaseId, transaction);
      return;
    }
    case "SaleReceipt": {
      const record = await findOrCreateFromSnapshot(SaleReceipt as unknown as RestorableModel, item, transaction);
      setField(record, "voidedAt", null);
      setField(record, "voidReason", null);
      await record.save({ transaction });
      await restorePostingForSource("sale_receipt", Number(item.entityId), "sale_receipt", transaction, userId);
      await SaleCredit.update({ voidedAt: null }, { where: { sourceReceiptId: Number(item.entityId) }, transaction });
      const saleId = Number(record.getDataValue("saleId"));
      if (Number.isFinite(saleId)) await restoreSaleStatus(saleId, transaction);
      return;
    }
    case "RentalReceipt": {
      const record = await findOrCreateFromSnapshot(RentalReceipt as unknown as RestorableModel, item, transaction);
      setField(record, "voidedAt", null);
      setField(record, "voidReason", null);
      await record.save({ transaction });
      await restorePostingForSource("rental_receipt", Number(item.entityId), "rental_receipt", transaction, userId);
      return;
    }
    case "DailyCashEntry": {
      const record = await findOrCreateFromSnapshot(DailyCashEntry as unknown as RestorableModel, item, transaction);
      setField(record, "voidedAt", null);
      setField(record, "voidedByUserId", null);
      setField(record, "voidReason", null);
      await record.save({ transaction });
      const journalTransactionId = Number(record.getDataValue("journalTransactionId"));
      if (Number.isFinite(journalTransactionId)) await restoreJournalTransaction(journalTransactionId, transaction, userId);
      const linkedEmployeePaymentId = Number(record.getDataValue("linkedEmployeePaymentId"));
      if (Number.isFinite(linkedEmployeePaymentId)) {
        await EmployeePayment.update({ voidedAt: null, voidReason: null }, { where: { id: linkedEmployeePaymentId }, transaction });
      }
      return;
    }
    case "JournalTransaction": {
      await restoreJournalTransaction(Number(item.entityId), transaction, userId);
      return;
    }
    case "PartyLedgerLine": {
      const line = nestedObject(snapshot, "line");
      const journal = nestedObject(snapshot, "journal");
      const transactionId = Number(line["transactionId"] ?? journal["id"]);
      if (!Number.isFinite(transactionId)) throw new Error("د کهاته د ریکارډ اصلي ژورنال ونه موندل شو");
      await restoreJournalTransaction(transactionId, transaction, userId);
      return;
    }
    default: {
      const model = hardDeletedModels[item.entityType];
      if (!model) throw new Error("دا ډول ریکارډ لا د بېرته راوستلو ملاتړ نه لري");
      const record = await findOrCreateFromSnapshot(model, item, transaction);
      await record.save({ transaction });
    }
  }
}

export async function restoreTrashItem(params: { trashItemId: number; userId: number; reason?: string | null }): Promise<TrashItem> {
  const item = await TrashItem.findByPk(params.trashItemId);
  if (!item) throw new Error("Trash item not found");
  if (item.purgedAt) throw new Error("Trash item is already purged");
  if (item.restoredAt) throw new Error("Trash item is already restored");

  return sequelize.transaction(async (transaction) => {
    await restoreTrashRecord(item, params.userId, transaction);
    item.restoredAt = new Date();
    item.restoredByUserId = params.userId;
    item.restoreReason = params.reason?.trim() || "د ټرش څخه بېرته راوستل شو";
    await item.save({ transaction });
    await recordAudit(
      {
        userId: params.userId,
        action: "trash_restore",
        entityType: item.entityType,
        entityId: item.entityId,
        details: { trashItemId: item.id, reason: item.restoreReason, sourcePath: item.sourcePath },
      },
      transaction,
    );
    return item;
  });
}
