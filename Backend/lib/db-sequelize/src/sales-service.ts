import Decimal from "decimal.js";
import type { Transaction } from "sequelize";
import { sequelize } from "./connection";
import { Sale, SaleReceipt, SaleCredit, Unit, Floor, CashAccount, Account, PostingLink, type SaleStatus } from "./models";
import { postJournal, reverseJournal, PostingError } from "./posting";
import { nextDocumentNumber } from "./numbering";

const AR_ACCOUNT_CODE = "1100";
const SALES_REVENUE_ACCOUNT_CODE = "4000";
const CUSTOMER_CREDIT_ACCOUNT_CODE = "2000";

export interface CreateSaleInput {
  unitId: number;
  partyId: number;
  price: string | number;
  discount?: string | number;
  currencyCode: string;
  saleDate: string;
  paymentType?: string | null;
  contractNumber?: string | null;
  notes?: string | null;
  status?: "draft" | "reserved" | "active";
  createdByUserId?: number | null;
  /** Optional "first received amount" — records an initial receipt atomically with the sale. */
  firstReceivedAmount?: string | number | null;
  firstReceiptMethod?: string;
  firstReceiptCashAccountId?: number | null;
  firstReceiptReference?: string | null;
  firstReceiptNote?: string | null;
}

export async function createSale(input: CreateSaleInput): Promise<Sale> {
  const unit = await Unit.findByPk(input.unitId);
  if (!unit) throw new PostingError("Unit not found");
  if (unit.status === "sold" || unit.status === "rented") {
    throw new PostingError(`Unit is already ${unit.status} and cannot be sold`);
  }
  if (unit.status === "reserved") {
    throw new PostingError("Unit is reserved and cannot be sold to another party");
  }
  if (unit.purpose !== "for_sale" && unit.purpose !== "both") {
    throw new PostingError("Unit is not marked for sale");
  }
  const floor = await Floor.findByPk(unit.floorId);
  if (floor?.purpose === "for_rent") {
    throw new PostingError("دا منزل د کرایې لپاره ټاکل شوی؛ په فروش کې نه شي ثبتېدای");
  }

  const price = new Decimal(input.price);
  const discount = new Decimal(input.discount ?? 0);
  const finalPrice = price.minus(discount);
  if (finalPrice.lessThanOrEqualTo(0)) throw new PostingError("Final price must be greater than zero");

  const status: SaleStatus = input.status === "draft" ? "draft" : input.status === "reserved" ? "reserved" : "active";

  return sequelize.transaction(async (t) => {
    const saleNumber = await nextDocumentNumber("sales_contract", t);
    const sale = await Sale.create(
      {
        saleNumber,
        contractNumber: input.contractNumber ?? null,
        unitId: input.unitId,
        partyId: input.partyId,
        price: price.toFixed(),
        discount: discount.toFixed(),
        finalPrice: finalPrice.toFixed(),
        currencyCode: input.currencyCode,
        saleDate: input.saleDate,
        paymentType: input.paymentType ?? null,
        status,
        notes: input.notes ?? null,
        createdByUserId: input.createdByUserId ?? null,
      },
      { transaction: t },
    );

    if (status !== "draft") {
      const arAccount = await Account.findOne({ where: { code: AR_ACCOUNT_CODE }, transaction: t });
      const revenueAccount = await Account.findOne({ where: { code: SALES_REVENUE_ACCOUNT_CODE }, transaction: t });
      if (!arAccount || !revenueAccount) throw new PostingError("Core accounts (1100/4000) are missing");

      await postJournal(
        {
          transactionDate: input.saleDate,
          memo: `فروش ${saleNumber} - واحد ${unit.id}`,
          isManual: false,
          createdByUserId: input.createdByUserId ?? null,
          source: { module: "sale", sourceId: sale.id, postingType: "sale_creation" },
          lines: [
            {
              accountId: arAccount.id,
              currencyCode: input.currencyCode,
              direction: "debit",
              amount: finalPrice.toFixed(),
              partyType: "customer",
              partyId: input.partyId,
              description: `فروش ${saleNumber} د مشتری حساب`,
            },
            {
              accountId: revenueAccount.id,
              currencyCode: input.currencyCode,
              direction: "credit",
              amount: finalPrice.toFixed(),
              description: `فروش ${saleNumber} عاید`,
            },
          ],
        },
        t,
      );

      unit.status = status === "reserved" ? "reserved" : "sold";
      await unit.save({ transaction: t });

      if (input.firstReceivedAmount !== undefined && input.firstReceivedAmount !== null) {
        const firstAmount = new Decimal(input.firstReceivedAmount);
        if (firstAmount.greaterThan(0)) {
          await applyReceipt(
            sale,
            {
              saleId: sale.id,
              amount: input.firstReceivedAmount,
              currencyCode: input.currencyCode,
              receiptDate: input.saleDate,
              method: input.firstReceiptMethod,
              cashAccountId: input.firstReceiptCashAccountId ?? null,
              reference: input.firstReceiptReference ?? null,
              note: input.firstReceiptNote ?? "لومړنی رسید د فروش د ثبت پر وخت درج شو",
              receivedByUserId: input.createdByUserId ?? null,
            },
            t,
          );
        }
      }
    }

    return sale;
  });
}

/**
 * Always pass the caller's transaction (when inside one) — SQLite/Sequelize may route a
 * transaction-less query to a different pooled connection that cannot see this transaction's
 * uncommitted writes yet, so an untransacted read here can compute a stale balance mid-transaction
 * (this previously caused a reversed receipt to leave the sale stuck as "fully_paid").
 */
async function computeBalance(sale: Sale, t?: Transaction): Promise<Decimal> {
  const receipts = await SaleReceipt.findAll({ where: { saleId: sale.id, voidedAt: null }, transaction: t });
  const received = receipts.reduce((sum, r) => sum.plus(new Decimal(r.amount)), new Decimal(0));
  return new Decimal(sale.finalPrice).minus(received);
}

export interface AddReceiptInput {
  saleId: number;
  amount: string | number;
  currencyCode: string;
  receiptDate: string;
  method?: string;
  cashAccountId?: number | null;
  reference?: string | null;
  note?: string | null;
  receivedByUserId?: number | null;
  allowOverpayment?: boolean;
}

/**
 * Core receipt-posting logic, shared by addSaleReceipt (its own transaction) and createSale
 * (an initial receipt posted inside the sale's own transaction). Must always run inside a
 * transaction the caller already owns — never opens one itself — to avoid the nested/independent
 * transaction bug that previously caused sale creation to fail with a 500 on SQLite.
 */
async function applyReceipt(sale: Sale, input: AddReceiptInput, t: Transaction): Promise<SaleReceipt> {
  if (sale.status === "cancelled" || sale.status === "reversed") {
    throw new PostingError(`Cannot add a receipt to a ${sale.status} sale`);
  }
  if (sale.currencyCode !== input.currencyCode) {
    throw new PostingError(`Sale is in ${sale.currencyCode}; receipt must use the same currency`);
  }

  const amount = new Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) throw new PostingError("Receipt amount must be greater than zero");

  const balance = await computeBalance(sale, t);
  const appliedAmount = Decimal.min(amount, Decimal.max(balance, 0));
  const overpayAmount = amount.minus(appliedAmount);

  if (overpayAmount.greaterThan(0) && !input.allowOverpayment) {
    throw new PostingError(
      `Amount exceeds remaining balance of ${balance.toFixed()} — confirm overpayment to record the excess as customer credit`,
    );
  }

  let cashAccount: CashAccount | null = null;
  if (input.cashAccountId) {
    cashAccount = await CashAccount.findByPk(input.cashAccountId, { transaction: t });
    if (!cashAccount) throw new PostingError("Cash account not found");
    if (cashAccount.currencyCode !== input.currencyCode) {
      throw new PostingError("Cash account currency does not match receipt currency");
    }
  }

  const receiptNumber = await nextDocumentNumber("receipt", t);
  const receipt = await SaleReceipt.create(
      {
        receiptNumber,
        saleId: sale.id,
        receiptDate: input.receiptDate,
        amount: amount.toFixed(),
        previousBalance: balance.toFixed(),
        newBalance: balance.minus(appliedAmount).toFixed(),
        currencyCode: input.currencyCode,
        method: input.method ?? "cash",
        cashAccountId: input.cashAccountId ?? null,
        reference: input.reference ?? null,
        note: input.note ?? null,
        receivedByUserId: input.receivedByUserId ?? null,
      },
      { transaction: t },
    );

    const cashLedgerAccount =
      cashAccount != null ? await Account.findByPk(cashAccount.accountId, { transaction: t }) : await Account.findOne({ where: { code: "1000" }, transaction: t });
    const arAccount = await Account.findOne({ where: { code: AR_ACCOUNT_CODE }, transaction: t });
    const creditAccount = await Account.findOne({ where: { code: CUSTOMER_CREDIT_ACCOUNT_CODE }, transaction: t });
    if (!cashLedgerAccount || !arAccount || !creditAccount) throw new PostingError("Core accounts are missing");

    const lines = [
      {
        accountId: cashLedgerAccount.id,
        currencyCode: input.currencyCode,
        direction: "debit" as const,
        amount: amount.toFixed(),
        description: `رسید ${receiptNumber} د فروش ${sale.saleNumber}`,
      },
      {
        accountId: arAccount.id,
        currencyCode: input.currencyCode,
        direction: "credit" as const,
        amount: appliedAmount.toFixed(),
        partyType: "customer" as const,
        partyId: sale.partyId,
        description: `رسید ${receiptNumber} د فروش ${sale.saleNumber} ته تطبیق`,
      },
    ];
    if (overpayAmount.greaterThan(0)) {
      lines.push({
        accountId: creditAccount.id,
        currencyCode: input.currencyCode,
        direction: "credit" as const,
        amount: overpayAmount.toFixed(),
        partyType: "customer" as const,
        partyId: sale.partyId,
        description: `اضافي رسید ${receiptNumber} د مشتری اعتبار`,
      });
    }

    await postJournal(
      {
        transactionDate: input.receiptDate,
        memo: `رسید ${receiptNumber} د فروش ${sale.saleNumber}`,
        isManual: false,
        createdByUserId: input.receivedByUserId ?? null,
        source: { module: "sale_receipt", sourceId: receipt.id, postingType: "sale_receipt" },
        lines,
      },
      t,
    );

    if (overpayAmount.greaterThan(0)) {
      await SaleCredit.create(
        {
          partyId: sale.partyId,
          sourceSaleId: sale.id,
          sourceReceiptId: receipt.id,
          currencyCode: input.currencyCode,
          amount: overpayAmount.toFixed(),
          notes: `اضافي پیسې په رسید ${receiptNumber} کې`,
        },
        { transaction: t },
      );
    }

    const newBalance = balance.minus(appliedAmount);
    if (newBalance.lessThanOrEqualTo(0)) {
      sale.status = "fully_paid";
    } else if (sale.status === "reserved") {
      sale.status = "active";
    }
    await sale.save({ transaction: t });

  return receipt;
}

export async function addSaleReceipt(input: AddReceiptInput): Promise<SaleReceipt> {
  const sale = await Sale.findByPk(input.saleId);
  if (!sale) throw new PostingError("Sale not found");
  return sequelize.transaction((t) => applyReceipt(sale, input, t));
}

async function reverseSaleReceiptInTransaction(
  receipt: SaleReceipt,
  params: { userId: number; reason: string },
  t: Transaction,
): Promise<SaleReceipt> {
  if (receipt.voidedAt) throw new PostingError("Receipt is already voided");

  const link = await PostingLink.findOne({ where: { sourceModule: "sale_receipt", sourceId: receipt.id, postingType: "sale_receipt" }, transaction: t });
  if (!link) throw new PostingError("No posting found for this receipt");

  await reverseJournal(link.transactionId, params, t);

  receipt.voidedAt = new Date();
  receipt.voidReason = params.reason;
  await receipt.save({ transaction: t });

  // Void any standing customer credit that was created from this receipt's overpayment,
  // so reversing a receipt cannot leave an orphaned credit the party never actually has.
  await SaleCredit.update(
    { voidedAt: new Date() },
    { where: { sourceReceiptId: receipt.id, voidedAt: null }, transaction: t },
  );

  const sale = await Sale.findByPk(receipt.saleId, { transaction: t });
  if (sale) {
    const balance = await computeBalance(sale, t);
    if (balance.greaterThan(0) && sale.status === "fully_paid") {
      sale.status = "active";
      await sale.save({ transaction: t });
    }
  }

  return receipt;
}

export async function reverseSaleReceipt(receiptId: number, params: { userId: number; reason: string }): Promise<SaleReceipt> {
  const receipt = await SaleReceipt.findByPk(receiptId);
  if (!receipt) throw new PostingError("Receipt not found");
  return sequelize.transaction((t) => reverseSaleReceiptInTransaction(receipt, params, t));
}

export async function reverseSale(saleId: number, params: { userId: number; reason: string }): Promise<Sale> {
  const sale = await Sale.findByPk(saleId);
  if (!sale) throw new PostingError("Sale not found");
  if (sale.status === "cancelled" || sale.status === "reversed") throw new PostingError(`Sale is already ${sale.status}`);

  return sequelize.transaction(async (t) => {
    const receipts = await SaleReceipt.findAll({ where: { saleId: sale.id, voidedAt: null }, transaction: t });
    for (const receipt of receipts) {
      await reverseSaleReceiptInTransaction(receipt, params, t);
    }

    const link = await PostingLink.findOne({ where: { sourceModule: "sale", sourceId: sale.id, postingType: "sale_creation" }, transaction: t });
    if (link) await reverseJournal(link.transactionId, params, t);

    sale.status = "reversed";
    await sale.save({ transaction: t });

    const unit = await Unit.findByPk(sale.unitId, { transaction: t });
    if (unit && (unit.status === "sold" || unit.status === "reserved")) {
      unit.status = "available";
      await unit.save({ transaction: t });
    }

    return sale;
  });
}

export async function getSaleBalance(sale: Sale): Promise<string> {
  const balance = await computeBalance(sale);
  return balance.toFixed();
}
