import { Op } from "sequelize";
import {
  DailyCashEntry,
  ExchangeTransaction,
  JournalLine,
  JournalTransaction,
  Partner,
  PartnerTransaction,
  Party,
  PartyRole,
  PostingLink,
  Purchase,
  PurchasePayment,
  PurchaseReturn,
  Rental,
  RentalReceipt,
  Sale,
  SaleCredit,
  Unit,
  reverseJournal,
  reverseRentalReceipt,
  reverseSale,
  voidDailyCashEntry,
  type PartyType,
} from "@workspace/db-sequelize";
import { moveToTrash } from "./trash";

/** Maps the broader Party master types to the narrower journal_lines.partyType enum. */
function toJournalPartyType(type: PartyType): string {
  switch (type) {
    case "individual_customer":
    case "market_customer":
    case "sales_customer":
      return "customer";
    case "supplier":
      return "supplier";
    case "tenant":
      return "tenant";
    case "exchange_dealer":
      return "exchange_dealer";
    case "employee":
      return "employee";
    case "partner":
      return "partner";
    default:
      return "customer";
  }
}

const DAILY_CASH_PARTY_TARGETS: PartyType[] = ["supplier", "sales_customer", "exchange_dealer", "market_customer", "individual_customer"];

interface CascadeParams {
  userId: number;
  reason: string;
}

interface CascadeSummary {
  sales: number;
  rentals: number;
  rentalReceipts: number;
  purchases: number;
  purchasePayments: number;
  purchaseReturns: number;
  exchangeTransactions: number;
  partnerTransactions: number;
  dailyCashEntries: number;
  ledgerTransactions: number;
  saleCredits: number;
}

/** Reverses the journal posting linked to a source record, if one exists and is still live. */
async function reversePostingLink(
  sourceModule: string,
  sourceId: number,
  postingType: string,
  params: CascadeParams,
): Promise<void> {
  const link = await PostingLink.findOne({ where: { sourceModule, sourceId, postingType } });
  if (!link) return;
  const journal = await JournalTransaction.findByPk(link.transactionId);
  if (!journal || journal.voidedAt) return;
  await reverseJournal(link.transactionId, params);
}

/**
 * Removes every record related to a party from the active system before the party itself is
 * soft-deleted. Each business row is reversed (financial postings voided), moved to trash with a
 * snapshot for restore, and the affected rows are excluded from dashboard/reports by their own
 * status/void filters — no other party's data is touched.
 */
export async function cascadePartyRecords(party: Party, params: CascadeParams): Promise<CascadeSummary> {
  const summary: CascadeSummary = {
    sales: 0,
    rentals: 0,
    rentalReceipts: 0,
    purchases: 0,
    purchasePayments: 0,
    purchaseReturns: 0,
    exchangeTransactions: 0,
    partnerTransactions: 0,
    dailyCashEntries: 0,
    ledgerTransactions: 0,
    saleCredits: 0,
  };

  // 1. Property sales (sales_customer and any party type that carries sales).
  const relatedSales = await Sale.findAll({ where: { partyId: party.id, status: { [Op.notIn]: ["cancelled", "reversed"] } } });
  for (const sale of relatedSales) {
    const saleSnapshot = sale.toJSON();
    await reverseSale(sale.id, params);
    await moveToTrash({
      userId: params.userId,
      entityType: "Sale",
      entityId: sale.id,
      displayName: sale.saleNumber || `فروش ${sale.id}`,
      sourcePath: "/sales?customerType=sales_customer&salesDetail=1&allDates=1",
      snapshot: saleSnapshot,
      reason: params.reason,
    });
    summary.sales += 1;
  }

  // 2. Rentals (tenant).
  const relatedRentals = await Rental.findAll({ where: { tenantPartyId: party.id, status: { [Op.ne]: "cancelled" } } });
  for (const rental of relatedRentals) {
    const rentalSnapshot = rental.toJSON();
    const receipts = await RentalReceipt.findAll({ where: { rentalId: rental.id, voidedAt: null } });
    for (const receipt of receipts) {
      const receiptSnapshot = receipt.toJSON();
      await reverseRentalReceipt(receipt.id, params);
      await moveToTrash({
        userId: params.userId,
        entityType: "RentalReceipt",
        entityId: receipt.id,
        displayName: receipt.receiptNumber || `رسید ${receipt.id}`,
        sourcePath: `/rentals/${rental.id}`,
        snapshot: receiptSnapshot,
        reason: params.reason,
      });
      summary.rentalReceipts += 1;
    }
    await reversePostingLink("rental", rental.id, "rental_creation", params);
    rental.status = "cancelled";
    await rental.save();
    const unit = await Unit.findByPk(rental.unitId);
    if (unit && unit.status === "rented") {
      unit.status = "available";
      await unit.save();
    }
    await moveToTrash({
      userId: params.userId,
      entityType: "Rental",
      entityId: rental.id,
      displayName: rental.rentalNumber || `کرایه ${rental.id}`,
      sourcePath: "/rentals",
      snapshot: rentalSnapshot,
      reason: params.reason,
    });
    summary.rentals += 1;
  }

  // 3. Purchases (supplier): payments, returns, then the purchase itself.
  const relatedPurchases = await Purchase.findAll({ where: { supplierPartyId: party.id, status: { [Op.ne]: "cancelled" } } });
  for (const purchase of relatedPurchases) {
    const purchaseSnapshot = purchase.toJSON();
    const payments = await PurchasePayment.findAll({ where: { purchaseId: purchase.id, voidedAt: null } });
    for (const payment of payments) {
      const paymentSnapshot = payment.toJSON();
      await reversePostingLink("purchase_payment", payment.id, "purchase_payment", params);
      payment.voidedAt = new Date();
      payment.voidReason = params.reason;
      await payment.save();
      await moveToTrash({
        userId: params.userId,
        entityType: "PurchasePayment",
        entityId: payment.id,
        displayName: payment.paymentNumber || `تادیه ${payment.id}`,
        sourcePath: `/purchases/${purchase.id}`,
        snapshot: paymentSnapshot,
        reason: params.reason,
      });
      summary.purchasePayments += 1;
    }
    const returns = await PurchaseReturn.findAll({ where: { purchaseId: purchase.id } });
    for (const purchaseReturn of returns) {
      const returnSnapshot = purchaseReturn.toJSON();
      await reversePostingLink("purchase_return", purchaseReturn.id, "purchase_return", params);
      await purchaseReturn.destroy();
      await moveToTrash({
        userId: params.userId,
        entityType: "PurchaseReturn",
        entityId: purchaseReturn.id,
        displayName: purchaseReturn.returnNumber || `واپسي ${purchaseReturn.id}`,
        sourcePath: `/purchases/${purchase.id}`,
        snapshot: returnSnapshot,
        reason: params.reason,
      });
      summary.purchaseReturns += 1;
    }
    await reversePostingLink("purchase", purchase.id, "purchase_creation", params);
    purchase.status = "cancelled";
    await purchase.save();
    await moveToTrash({
      userId: params.userId,
      entityType: "Purchase",
      entityId: purchase.id,
      displayName: purchase.purchaseNumber || purchase.itemName || `خرید ${purchase.id}`,
      sourcePath: `/purchases/${purchase.id}`,
      snapshot: purchaseSnapshot,
      reason: params.reason,
    });
    summary.purchases += 1;
  }

  // 4. Exchange transactions (exchange_dealer).
  const exchangeTransactions = await ExchangeTransaction.findAll({ where: { partyId: party.id } });
  for (const exchange of exchangeTransactions) {
    const exchangeSnapshot = exchange.toJSON();
    await reversePostingLink("exchange", exchange.id, "exchange_creation", params);
    await exchange.destroy();
    await moveToTrash({
      userId: params.userId,
      entityType: "ExchangeTransaction",
      entityId: exchange.id,
      displayName: exchange.exchangeNumber || `تبادله ${exchange.id}`,
      sourcePath: "/exchange/transactions",
      snapshot: exchangeSnapshot,
      reason: params.reason,
    });
    summary.exchangeTransactions += 1;
  }

  // 5. Partner record and its transactions (partner).
  if (party.type === "partner") {
    const partner = await Partner.findOne({ where: { partyId: party.id } });
    if (partner) {
      const partnerSnapshot = partner.toJSON();
      await reversePostingLink("partner", partner.id, "partner_initial_investment", params);
      const transactions = await PartnerTransaction.findAll({ where: { partnerId: partner.id } });
      for (const transaction of transactions) {
        const transactionSnapshot = transaction.toJSON();
        await reversePostingLink("partner_transaction", transaction.id, "partner_transaction", params);
        await transaction.destroy();
        await moveToTrash({
          userId: params.userId,
          entityType: "PartnerTransaction",
          entityId: transaction.id,
          displayName: transaction.transactionNumber || `د شریک راکړه/ورکړه ${transaction.id}`,
          sourcePath: `/haji-ledger/${partner.id}`,
          snapshot: transactionSnapshot,
          reason: params.reason,
        });
        summary.partnerTransactions += 1;
      }
      partner.status = "inactive";
      await partner.save();
      await moveToTrash({
        userId: params.userId,
        entityType: "Partner",
        entityId: partner.id,
        displayName: (partner as unknown as { party?: { name?: string | null } }).party?.name || partner.partnerNumber || `Partner ${partner.id}`,
        sourcePath: "/partners",
        snapshot: partnerSnapshot,
        reason: params.reason,
      });
    }
  }

  // 6. Daily cash (market) entries that target this party.
  const dailyCashEntries = await DailyCashEntry.findAll({
    where: { targetType: { [Op.in]: DAILY_CASH_PARTY_TARGETS } as never, targetId: party.id, voidedAt: null },
  });
  for (const entry of dailyCashEntries) {
    const entrySnapshot = entry.toJSON();
    await voidDailyCashEntry(entry.id, params);
    await moveToTrash({
      userId: params.userId,
      entityType: "DailyCashEntry",
      entityId: entry.id,
      displayName: entry.description || `روزنامچه ${entry.id}`,
      sourcePath: "/journal",
      snapshot: entrySnapshot,
      reason: params.reason,
    });
    summary.dailyCashEntries += 1;
  }

  // 7. Direct party-ledger journal transactions (manual entries without a business source).
  const journalPartyType = toJournalPartyType(party.type);
  const partyLines = await JournalLine.findAll({
    where: { partyType: journalPartyType, partyId: party.id },
    attributes: ["transactionId"],
  });
  const transactionIds = Array.from(new Set(partyLines.map((line) => line.transactionId)));
  if (transactionIds.length > 0) {
    const transactions = await JournalTransaction.findAll({
      where: { id: { [Op.in]: transactionIds }, voidedAt: null, reversalOfId: null },
    });
    const liveIds = new Set(transactions.map((transaction) => transaction.id));
    const links = await PostingLink.findAll({ where: { transactionId: { [Op.in]: Array.from(liveIds) } } });
    const linkedIds = new Set(links.map((link) => link.transactionId));
    for (const transaction of transactions) {
      if (linkedIds.has(transaction.id)) continue; // belongs to a business source handled above
      const partyLine = partyLines.find((line) => line.transactionId === transaction.id);
      await reverseJournal(transaction.id, params);
      await moveToTrash({
        userId: params.userId,
        entityType: "PartyLedgerLine",
        entityId: String(partyLine?.transactionId ?? transaction.id),
        displayName: transaction.memo || `کهاته ریکارډ ${transaction.id}`,
        sourcePath: `/parties/${party.id}`,
        snapshot: { party: party.toJSON(), line: partyLine?.toJSON() ?? null, journal: transaction.toJSON() },
        reason: params.reason,
      });
      summary.ledgerTransactions += 1;
    }
  }

  // 8. Standing sale credits for the party.
  const [creditsCount] = await SaleCredit.update({ voidedAt: new Date() }, { where: { partyId: party.id, voidedAt: null } });
  summary.saleCredits = creditsCount;

  // 9. Party roles are recreated from the snapshot when the party is restored from trash.
  await PartyRole.destroy({ where: { partyId: party.id } });

  return summary;
}
