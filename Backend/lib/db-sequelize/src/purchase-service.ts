import Decimal from "decimal.js";
import { Op, type Transaction } from "sequelize";
import { sequelize } from "./connection";
import { Purchase, PurchasePayment, PurchaseReturn, CashAccount, Account, PostingLink, JournalTransaction, JournalLine, Party } from "./models";
import { postJournal, reverseJournal, PostingError } from "./posting";
import { findVoidedPostedSourceIds } from "./posting-source";
import { nextDocumentNumber } from "./numbering";

const AP_ACCOUNT_CODE = "2000";
const EXPENSE_ACCOUNT_CODE = "5000";

export interface CreatePurchaseInput {
  purchaseNumber?: string | null;
  customerBillNumber?: string | null;
  supplierPartyId: number;
  purchaseDate: string;
  itemName: string;
  quantity: string | number;
  unitOfMeasure?: string | null;
  unitPrice: string | number;
  currencyCode: string;
  notes?: string | null;
  createdByUserId?: number | null;
}

export interface UpdatePurchaseInput {
  purchaseId: number;
  purchaseNumber?: string | null;
  customerBillNumber?: string | null;
  supplierPartyId: number;
  purchaseDate: string;
  itemName: string;
  quantity: string | number;
  unitOfMeasure?: string | null;
  unitPrice: string | number;
  currencyCode: string;
  notes?: string | null;
}

function normalizeRequiredBillNumber(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new PostingError("بیل نمبر اړین دی");
  return normalized;
}

function purchaseBillText(purchase: Pick<Purchase, "purchaseNumber" | "customerBillNumber">): string {
  return purchase.customerBillNumber || purchase.purchaseNumber;
}

function returnBillText(ret: Pick<PurchaseReturn, "returnNumber" | "customerBillNumber">): string {
  return ret.customerBillNumber ? `${ret.returnNumber} / ${ret.customerBillNumber}` : ret.returnNumber;
}

export async function createPurchase(input: CreatePurchaseInput): Promise<Purchase> {
  const purchaseNumber = normalizeRequiredBillNumber(input.purchaseNumber ?? input.customerBillNumber);
  const quantity = new Decimal(input.quantity);
  const unitPrice = new Decimal(input.unitPrice);
  if (quantity.lessThanOrEqualTo(0)) throw new PostingError("مقدار باید تر صفر زیات وي");
  if (unitPrice.lessThanOrEqualTo(0)) throw new PostingError("قیمت باید تر صفر زیات وي");
  const totalAmount = quantity.times(unitPrice);

  return sequelize.transaction(async (t) => {
    const supplier = await Party.findByPk(input.supplierPartyId, { transaction: t });
    if (!supplier || supplier.type !== "supplier" || supplier.deletedAt) throw new PostingError("د اجناسو د خریداري مشتری ونه موندل شو");
    const duplicate = await Purchase.findOne({ where: { purchaseNumber }, transaction: t });
    if (duplicate) throw new PostingError("دا بیل نمبر مخکې ثبت شوی دی");
    const purchase = await Purchase.create(
      {
        purchaseNumber,
        customerBillNumber: null,
        supplierPartyId: input.supplierPartyId,
        purchaseDate: input.purchaseDate,
        itemName: input.itemName,
        quantity: quantity.toFixed(),
        unitOfMeasure: input.unitOfMeasure ?? null,
        unitPrice: unitPrice.toFixed(),
        totalAmount: totalAmount.toFixed(),
        currencyCode: input.currencyCode,
        notes: input.notes ?? null,
        createdByUserId: input.createdByUserId ?? null,
      },
      { transaction: t },
    );

    const expenseAccount = await Account.findOne({ where: { code: EXPENSE_ACCOUNT_CODE }, transaction: t });
    const apAccount = await Account.findOne({ where: { code: AP_ACCOUNT_CODE }, transaction: t });
    if (!expenseAccount || !apAccount) throw new PostingError("اصلي حسابونه ونه موندل شول");

    await postJournal(
      {
        transactionDate: input.purchaseDate,
        memo: `د خرید بیل ${purchaseBillText(purchase)}: ${input.itemName}`,
        isManual: false,
        createdByUserId: input.createdByUserId ?? null,
        source: { module: "purchase", sourceId: purchase.id, postingType: "purchase_creation" },
        lines: [
          {
            accountId: expenseAccount.id,
            currencyCode: input.currencyCode,
            direction: "debit",
            amount: totalAmount.toFixed(),
            description: `خرید ${purchaseBillText(purchase)} - ${input.itemName} × ${quantity.toFixed(2)}`,
          },
          {
            accountId: apAccount.id,
            currencyCode: input.currencyCode,
            direction: "credit",
            amount: totalAmount.toFixed(),
            partyType: "supplier",
            partyId: input.supplierPartyId,
            description: `د خرید ${purchaseBillText(purchase)} الباقی حساب`,
          },
        ],
      },
      t,
    );

    return purchase;
  });
}

export async function updatePurchase(input: UpdatePurchaseInput): Promise<Purchase> {
  const purchaseNumber = normalizeRequiredBillNumber(input.purchaseNumber ?? input.customerBillNumber);
  const quantity = new Decimal(input.quantity);
  const unitPrice = new Decimal(input.unitPrice);
  if (quantity.lessThanOrEqualTo(0)) throw new PostingError("مقدار باید تر صفر زیات وي");
  if (unitPrice.lessThanOrEqualTo(0)) throw new PostingError("قیمت باید تر صفر زیات وي");
  const totalAmount = quantity.times(unitPrice);

  return sequelize.transaction(async (t) => {
    const purchase = await Purchase.findByPk(input.purchaseId, { transaction: t });
    if (!purchase) throw new PostingError("خریداري ونه موندل شوه");
    if (purchase.status === "cancelled") throw new PostingError("لغوه شوې خریداري نه اصلاح کېږي");
    const supplier = await Party.findByPk(input.supplierPartyId, { transaction: t });
    if (!supplier || supplier.type !== "supplier" || supplier.deletedAt) throw new PostingError("د اجناسو د خریداري مشتری ونه موندل شو");
    const duplicate = await Purchase.findOne({ where: { purchaseNumber }, transaction: t });
    if (duplicate && duplicate.id !== purchase.id) throw new PostingError("دا بیل نمبر مخکې ثبت شوی دی");

    const payments = await PurchasePayment.findAll({ where: { purchaseId: purchase.id, voidedAt: null }, transaction: t });
    const returns = await PurchaseReturn.findAll({ where: { purchaseId: purchase.id }, transaction: t });
    const downstreamTotal = payments
      .reduce((sum, payment) => sum.plus(new Decimal(payment.amount)), new Decimal(0))
      .plus(returns.reduce((sum, ret) => sum.plus(new Decimal(ret.amount)), new Decimal(0)));
    const hasDownstream = !downstreamTotal.isZero();
    if (hasDownstream && purchase.currencyCode !== input.currencyCode) {
      throw new PostingError("له رسیدګۍ یا واپسي وروسته اسعار نه بدلېږي");
    }
    if (hasDownstream && purchase.supplierPartyId !== input.supplierPartyId) {
      throw new PostingError("له رسیدګۍ یا واپسي وروسته مشتری نه بدلېږي");
    }
    if (totalAmount.lessThan(downstreamTotal)) {
      throw new PostingError(`مجموعه د موجودې رسیدګۍ/واپسي ${downstreamTotal.toFixed()} څخه کمه نه شي کېدای`);
    }

    purchase.purchaseNumber = purchaseNumber;
    purchase.customerBillNumber = null;
    purchase.supplierPartyId = input.supplierPartyId;
    purchase.purchaseDate = input.purchaseDate;
    purchase.itemName = input.itemName;
    purchase.quantity = quantity.toFixed();
    purchase.unitOfMeasure = input.unitOfMeasure ?? null;
    purchase.unitPrice = unitPrice.toFixed();
    purchase.totalAmount = totalAmount.toFixed();
    purchase.currencyCode = input.currencyCode;
    purchase.notes = input.notes ?? null;
    purchase.status = totalAmount.minus(downstreamTotal).lessThanOrEqualTo(0) ? "paid" : "open";
    await purchase.save({ transaction: t });

    const link = await PostingLink.findOne({
      where: { sourceModule: "purchase", sourceId: purchase.id, postingType: "purchase_creation" },
      transaction: t,
    });
    if (link) {
      const journal = await JournalTransaction.findByPk(link.transactionId, { transaction: t });
      if (journal) {
        journal.transactionDate = input.purchaseDate;
        journal.memo = `د خرید بیل ${purchaseBillText(purchase)}: ${input.itemName}`;
        await journal.save({ transaction: t });
      }
      const lines = await JournalLine.findAll({ where: { transactionId: link.transactionId }, transaction: t });
      for (const line of lines) {
        line.amount = totalAmount.toFixed();
        line.currencyCode = input.currencyCode;
        if (line.direction === "credit") {
          line.partyType = "supplier";
          line.partyId = input.supplierPartyId;
          line.description = `د خرید ${purchaseBillText(purchase)} الباقی حساب`;
        } else {
          line.description = `خرید ${purchaseBillText(purchase)} - ${input.itemName} × ${quantity.toFixed()}`;
        }
        await line.save({ transaction: t });
      }
    }

    return purchase;
  });
}

/**
 * Remaining balance owed to the supplier = total - payments received back to the purchase in
 * cash-out (payments) + returns (which reduce what is owed), all threaded through the caller's
 * transaction when supplied — see memory note on Sequelize/SQLite mid-transaction reads.
 */
async function computeBalance(purchase: Purchase, t?: Transaction): Promise<Decimal> {
  const paymentsRaw = await PurchasePayment.findAll({ where: { purchaseId: purchase.id, voidedAt: null }, transaction: t });
  const returnsRaw = await PurchaseReturn.findAll({ where: { purchaseId: purchase.id }, transaction: t });
  const voidedPaymentIds = await findVoidedPostedSourceIds({
    sourceModule: "purchase_payment",
    sourceIds: paymentsRaw.map((payment) => payment.id),
    postingType: "purchase_payment",
    transaction: t,
  });
  const voidedReturnIds = await findVoidedPostedSourceIds({
    sourceModule: "purchase_return",
    sourceIds: returnsRaw.map((ret) => ret.id),
    postingType: "purchase_return",
    transaction: t,
  });
  const payments = paymentsRaw.filter((payment) => !voidedPaymentIds.has(payment.id));
  const returns = returnsRaw.filter((ret) => !voidedReturnIds.has(ret.id));
  const paid = payments.reduce((sum, p) => sum.plus(new Decimal(p.amount)), new Decimal(0));
  const returned = returns.reduce((sum, r) => sum.plus(new Decimal(r.amount)), new Decimal(0));
  return new Decimal(purchase.totalAmount).minus(paid).minus(returned);
}

async function computeReturnedQuantity(purchase: Purchase, t?: Transaction, excludeReturnId?: number): Promise<Decimal> {
  const where: Record<string | symbol, unknown> = { purchaseId: purchase.id };
  if (excludeReturnId) where["id"] = { [Op.ne]: excludeReturnId };
  const returnsRaw = await PurchaseReturn.findAll({ where, transaction: t });
  const voidedReturnIds = await findVoidedPostedSourceIds({
    sourceModule: "purchase_return",
    sourceIds: returnsRaw.map((ret) => ret.id),
    postingType: "purchase_return",
    transaction: t,
  });
  const returns = returnsRaw.filter((ret) => !voidedReturnIds.has(ret.id));
  return returns.reduce((sum, ret) => sum.plus(new Decimal(ret.quantity)), new Decimal(0));
}

export interface AddPurchasePaymentInput {
  purchaseId: number;
  amount: string | number;
  currencyCode: string;
  paymentDate: string;
  method?: string;
  cashAccountId?: number | null;
  reference?: string | null;
  note?: string | null;
  paidByUserId?: number | null;
}

export async function addPurchasePayment(input: AddPurchasePaymentInput): Promise<PurchasePayment> {
  const purchase = await Purchase.findByPk(input.purchaseId);
  if (!purchase) throw new PostingError("Purchase not found");
  if (purchase.status === "cancelled") throw new PostingError("Cannot pay a cancelled purchase");
  if (purchase.currencyCode !== input.currencyCode) {
    throw new PostingError(`Purchase is in ${purchase.currencyCode}; payment must use the same currency`);
  }

  const amount = new Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) throw new PostingError("Payment amount must be greater than zero");

  return sequelize.transaction(async (t) => {
    const balance = await computeBalance(purchase, t);
    if (amount.greaterThan(balance)) {
      throw new PostingError(`Payment of ${amount.toFixed()} exceeds remaining balance of ${balance.toFixed()}`);
    }

    let cashAccount: CashAccount | null = null;
    if (input.cashAccountId) {
      cashAccount = await CashAccount.findByPk(input.cashAccountId, { transaction: t });
      if (!cashAccount) throw new PostingError("Cash account not found");
      if (cashAccount.currencyCode !== input.currencyCode) {
        throw new PostingError("Cash account currency does not match payment currency");
      }
    }

    const paymentNumber = await nextDocumentNumber("purchase_payment", t);
    const payment = await PurchasePayment.create(
      {
        paymentNumber,
        purchaseId: purchase.id,
        paymentDate: input.paymentDate,
        amount: amount.toFixed(),
        previousBalance: balance.toFixed(),
        newBalance: balance.minus(amount).toFixed(),
        currencyCode: input.currencyCode,
        method: input.method ?? "cash",
        cashAccountId: input.cashAccountId ?? null,
        reference: input.reference ?? null,
        note: input.note ?? null,
        paidByUserId: input.paidByUserId ?? null,
      },
      { transaction: t },
    );

    const apAccount = await Account.findOne({ where: { code: AP_ACCOUNT_CODE }, transaction: t });
    const cashLedgerAccount =
      cashAccount != null
        ? await Account.findByPk(cashAccount.accountId, { transaction: t })
        : await Account.findOne({ where: { code: "1000" }, transaction: t });
    if (!apAccount || !cashLedgerAccount) throw new PostingError("Core accounts are missing");

    await postJournal(
      {
        transactionDate: input.paymentDate,
        memo: `د خرید پیسو رسید ${paymentNumber} د بیل ${purchaseBillText(purchase)}`,
        isManual: false,
        createdByUserId: input.paidByUserId ?? null,
        source: { module: "purchase_payment", sourceId: payment.id, postingType: "purchase_payment" },
        lines: [
          {
            accountId: apAccount.id,
            currencyCode: input.currencyCode,
            direction: "debit",
            amount: amount.toFixed(),
            partyType: "supplier",
            partyId: purchase.supplierPartyId,
            description: `پیسو رسید ${paymentNumber} د خرید ${purchaseBillText(purchase)} ته تطبیق`,
          },
          {
            accountId: cashLedgerAccount.id,
            currencyCode: input.currencyCode,
            direction: "credit",
            amount: amount.toFixed(),
            description: `پیسو رسید ${paymentNumber} نغدي ورکړه`,
          },
        ],
      },
      t,
    );

    const newBalance = balance.minus(amount);
    purchase.status = newBalance.lessThanOrEqualTo(0) ? "paid" : "open";
    await purchase.save({ transaction: t });

    return payment;
  });
}

export interface CreatePurchaseReturnInput {
  purchaseId: number;
  customerBillNumber?: string | null;
  returnDate: string;
  returnedItemName: string;
  quantity: string | number;
  amount: string | number;
  currencyCode: string;
  reason: string;
  createdByUserId?: number | null;
}

/** A purchase return reduces the amount owed to the supplier (debits AP, credits the expense account back). */
export async function createPurchaseReturn(input: CreatePurchaseReturnInput): Promise<PurchaseReturn> {
  const purchase = await Purchase.findByPk(input.purchaseId);
  if (!purchase) throw new PostingError("Purchase not found");
  if (purchase.currencyCode !== input.currencyCode) {
    throw new PostingError(`Purchase is in ${purchase.currencyCode}; return must use the same currency`);
  }
  const quantity = new Decimal(input.quantity);
  const amount = new Decimal(input.amount);
  const customerBillNumber = normalizeRequiredBillNumber(input.customerBillNumber);
  if (quantity.lessThanOrEqualTo(0)) throw new PostingError("Returned quantity must be greater than zero");
  if (amount.lessThanOrEqualTo(0)) throw new PostingError("Return amount must be greater than zero");
  if (!input.reason?.trim()) throw new PostingError("A reason is required for a purchase return");

  return sequelize.transaction(async (t) => {
    const balance = await computeBalance(purchase, t);
    if (amount.greaterThan(balance)) {
      throw new PostingError(`Return amount of ${amount.toFixed()} exceeds remaining balance of ${balance.toFixed()}`);
    }
    const returnedQuantity = await computeReturnedQuantity(purchase, t);
    const remainingQuantity = new Decimal(purchase.quantity).minus(returnedQuantity);
    if (quantity.greaterThan(remainingQuantity)) {
      throw new PostingError(`واپسي مقدار د پاته جنس ${remainingQuantity.toFixed()} څخه زیات دی`);
    }

    const returnNumber = await nextDocumentNumber("purchase_return", t);
    const ret = await PurchaseReturn.create(
      {
        returnNumber,
        customerBillNumber,
        purchaseId: purchase.id,
        returnDate: input.returnDate,
        returnedItemName: input.returnedItemName,
        quantity: quantity.toFixed(),
        amount: amount.toFixed(),
        currencyCode: input.currencyCode,
        reason: input.reason.trim(),
        createdByUserId: input.createdByUserId ?? null,
      },
      { transaction: t },
    );

    const apAccount = await Account.findOne({ where: { code: AP_ACCOUNT_CODE }, transaction: t });
    const expenseAccount = await Account.findOne({ where: { code: EXPENSE_ACCOUNT_CODE }, transaction: t });
    if (!apAccount || !expenseAccount) throw new PostingError("Core accounts are missing");

    await postJournal(
      {
        transactionDate: input.returnDate,
        memo: `د خرید واپسي ${returnBillText(ret)} د بیل ${purchaseBillText(purchase)}: ${input.reason}`,
        isManual: false,
        createdByUserId: input.createdByUserId ?? null,
        source: { module: "purchase_return", sourceId: ret.id, postingType: "purchase_return" },
        lines: [
          {
            accountId: apAccount.id,
            currencyCode: input.currencyCode,
            direction: "debit",
            amount: amount.toFixed(),
            partyType: "supplier",
            partyId: purchase.supplierPartyId,
            description: `واپسي ${returnBillText(ret)} الباقی حساب کموي`,
          },
          {
            accountId: expenseAccount.id,
            currencyCode: input.currencyCode,
            direction: "credit",
            amount: amount.toFixed(),
            description: `واپسي ${returnBillText(ret)} - ${input.returnedItemName} × ${quantity.toFixed(2)}`,
          },
        ],
      },
      t,
    );

    const newBalance = balance.minus(amount);
    if (newBalance.lessThanOrEqualTo(0)) {
      purchase.status = "paid";
      await purchase.save({ transaction: t });
    }

    return ret;
  });
}

export interface UpdatePurchaseReturnInput {
  returnId: number;
  customerBillNumber?: string | null;
  returnDate: string;
  returnedItemName: string;
  quantity: string | number;
  amount: string | number;
  currencyCode: string;
  reason: string;
}

export async function updatePurchaseReturn(input: UpdatePurchaseReturnInput): Promise<PurchaseReturn> {
  const ret = await PurchaseReturn.findByPk(input.returnId);
  if (!ret) throw new PostingError("واپسي بیل ونه موندل شو");
  const purchase = await Purchase.findByPk(ret.purchaseId);
  if (!purchase) throw new PostingError("خریداري ونه موندل شوه");
  if (purchase.status === "cancelled") throw new PostingError("لغوه شوې خریداري نه اصلاح کېږي");
  if (purchase.currencyCode !== input.currencyCode) {
    throw new PostingError(`خریداري په ${purchase.currencyCode} ده؛ واپسي باید په همدې پیسو وي`);
  }
  const quantity = new Decimal(input.quantity);
  const amount = new Decimal(input.amount);
  const customerBillNumber = normalizeRequiredBillNumber(input.customerBillNumber);
  if (quantity.lessThanOrEqualTo(0)) throw new PostingError("مقدار باید تر صفر زیات وي");
  if (amount.lessThanOrEqualTo(0)) throw new PostingError("پیسې باید تر صفر زیاتې وي");
  if (!input.reason?.trim()) throw new PostingError("دلیل اړین دی");

  return sequelize.transaction(async (t) => {
    const balanceBeforeThisReturn = (await computeBalance(purchase, t)).plus(new Decimal(ret.amount));
    if (amount.greaterThan(balanceBeforeThisReturn)) {
      throw new PostingError(`واپسي مبلغ د پاته حساب ${balanceBeforeThisReturn.toFixed()} څخه زیات دی`);
    }
    const returnedQuantityBeforeThisReturn = await computeReturnedQuantity(purchase, t, ret.id);
    const remainingQuantityBeforeThisReturn = new Decimal(purchase.quantity).minus(returnedQuantityBeforeThisReturn);
    if (quantity.greaterThan(remainingQuantityBeforeThisReturn)) {
      throw new PostingError(`واپسي مقدار د پاته جنس ${remainingQuantityBeforeThisReturn.toFixed()} څخه زیات دی`);
    }

    ret.returnDate = input.returnDate;
    ret.customerBillNumber = customerBillNumber;
    ret.returnedItemName = input.returnedItemName;
    ret.quantity = quantity.toFixed();
    ret.amount = amount.toFixed();
    ret.currencyCode = input.currencyCode;
    ret.reason = input.reason.trim();
    await ret.save({ transaction: t });

    const link = await PostingLink.findOne({
      where: { sourceModule: "purchase_return", sourceId: ret.id, postingType: "purchase_return" },
      transaction: t,
    });
    if (link) {
      const journal = await JournalTransaction.findByPk(link.transactionId, { transaction: t });
      if (journal) {
        journal.transactionDate = input.returnDate;
        journal.memo = `د خرید واپسي ${returnBillText(ret)} د بیل ${purchaseBillText(purchase)}: ${input.reason}`;
        await journal.save({ transaction: t });
      }
      const lines = await JournalLine.findAll({ where: { transactionId: link.transactionId }, transaction: t });
      for (const line of lines) {
        line.amount = amount.toFixed();
        line.currencyCode = input.currencyCode;
        if (line.direction === "debit") {
          line.description = `واپسي ${returnBillText(ret)} الباقی حساب کموي`;
        } else {
          line.description = `واپسي ${returnBillText(ret)} - ${input.returnedItemName} × ${quantity.toFixed(2)}`;
        }
        await line.save({ transaction: t });
      }
    }

    const newBalance = balanceBeforeThisReturn.minus(amount);
    purchase.status = newBalance.lessThanOrEqualTo(0) ? "paid" : "open";
    await purchase.save({ transaction: t });

    return ret;
  });
}

export async function getPurchaseBalance(purchase: Purchase): Promise<string> {
  const balance = await computeBalance(purchase);
  return balance.toFixed();
}

export async function voidPurchase(purchaseId: number, params: { userId: number; reason: string }): Promise<Purchase> {
  const purchase = await Purchase.findByPk(purchaseId);
  if (!purchase) throw new PostingError("Purchase not found");
  if (purchase.status === "cancelled") throw new PostingError("Purchase is already cancelled");

  const payments = await PurchasePayment.count({ where: { purchaseId: purchase.id, voidedAt: null } });
  const returns = await PurchaseReturn.count({ where: { purchaseId: purchase.id } });
  if (payments > 0 || returns > 0) {
    throw new PostingError("This purchase has payments or return bills; delete those records first");
  }
  const link = await PostingLink.findOne({ where: { sourceModule: "purchase", sourceId: purchase.id, postingType: "purchase_creation" } });
  if (!link) throw new PostingError("No posting found for this purchase");

  return sequelize.transaction(async (t) => {
    await reverseJournal(link.transactionId, params, t);
    purchase.status = "cancelled";
    await purchase.save({ transaction: t });
    return purchase;
  });
}

export async function deletePurchaseReturn(returnId: number, params: { userId: number; reason: string }): Promise<PurchaseReturn> {
  const ret = await PurchaseReturn.findByPk(returnId);
  if (!ret) throw new PostingError("Purchase return not found");
  const link = await PostingLink.findOne({
    where: { sourceModule: "purchase_return", sourceId: ret.id, postingType: "purchase_return" },
  });
  if (!link) throw new PostingError("No posting found for this purchase return");

  return sequelize.transaction(async (t) => {
    await reverseJournal(link.transactionId, params, t);
    await ret.destroy({ transaction: t });
    const purchase = await Purchase.findByPk(ret.purchaseId, { transaction: t });
    if (purchase && purchase.status !== "cancelled") {
      const balance = await computeBalance(purchase, t);
      purchase.status = balance.lessThanOrEqualTo(0) ? "paid" : "open";
      await purchase.save({ transaction: t });
    }
    return ret;
  });
}
