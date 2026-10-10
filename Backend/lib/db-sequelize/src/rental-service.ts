import Decimal from "decimal.js";
import type { Transaction } from "sequelize";
import { sequelize } from "./connection";
import { Rental, RentalReceipt, Unit, Floor, CashAccount, Account, PostingLink, type RentalFrequency } from "./models";
import { postJournal, reverseJournal, PostingError } from "./posting";
import { nextDocumentNumber } from "./numbering";

const AR_ACCOUNT_CODE = "1100";
const RENTAL_REVENUE_ACCOUNT_CODE = "4100";
const TENANT_DEPOSIT_ACCOUNT_CODE = "2100";

export interface CreateRentalInput {
  unitId: number;
  tenantPartyId: number;
  startDate: string;
  endDate?: string | null;
  rentAmount: string | number;
  frequency: RentalFrequency;
  depositAmount?: string | number;
  currencyCode: string;
  notes?: string | null;
  createdByUserId?: number | null;
  /** Optional first receipt posted atomically with the rental (e.g. deposit + first period paid up front). */
  firstReceivedAmount?: string | number | null;
  firstReceiptMethod?: string;
  firstReceiptCashAccountId?: number | null;
  firstReceiptReference?: string | null;
  firstReceiptNote?: string | null;
}

/** A unit can only have one currently-active rental at a time. */
async function assertNoActiveRental(unitId: number, t: Transaction): Promise<void> {
  const active = await Rental.findOne({ where: { unitId, status: "active" }, transaction: t });
  if (active) {
    throw new PostingError(`Unit already has an active rental (${active.rentalNumber}) — end it before creating a new one`);
  }
}

export async function createRental(input: CreateRentalInput): Promise<Rental> {
  const unit = await Unit.findByPk(input.unitId);
  if (!unit) throw new PostingError("Unit not found");
  if (unit.status === "sold" || unit.status === "rented") {
    throw new PostingError(`Unit is already ${unit.status} and cannot be rented`);
  }
  if (unit.purpose !== "for_rent" && unit.purpose !== "both") {
    throw new PostingError("Unit is not marked for rent");
  }
  const floor = await Floor.findByPk(unit.floorId);
  if (floor?.purpose === "for_sale") {
    throw new PostingError("دا منزل د فروش لپاره ټاکل شوی؛ په کرایه کې نه شي ثبتېدای");
  }

  const rentAmount = new Decimal(input.rentAmount);
  if (rentAmount.lessThanOrEqualTo(0)) throw new PostingError("Rent amount must be greater than zero");
  const depositAmount = new Decimal(input.depositAmount ?? 0);
  if (depositAmount.lessThan(0)) throw new PostingError("Deposit cannot be negative");

  return sequelize.transaction(async (t) => {
    await assertNoActiveRental(input.unitId, t);

    const rentalNumber = await nextDocumentNumber("rental_contract", t);
    const rental = await Rental.create(
      {
        rentalNumber,
        unitId: input.unitId,
        tenantPartyId: input.tenantPartyId,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        rentAmount: rentAmount.toFixed(),
        frequency: input.frequency,
        depositAmount: depositAmount.toFixed(),
        currencyCode: input.currencyCode,
        notes: input.notes ?? null,
        createdByUserId: input.createdByUserId ?? null,
      },
      { transaction: t },
    );

    const arAccount = await Account.findOne({ where: { code: AR_ACCOUNT_CODE }, transaction: t });
    const revenueAccount = await Account.findOne({ where: { code: RENTAL_REVENUE_ACCOUNT_CODE }, transaction: t });
    const depositAccount = await Account.findOne({ where: { code: TENANT_DEPOSIT_ACCOUNT_CODE }, transaction: t });
    if (!arAccount || !revenueAccount || !depositAccount) throw new PostingError("Core accounts are missing");

    const lines: {
      accountId: number;
      currencyCode: string;
      direction: "debit" | "credit";
      amount: string;
      partyType?: "tenant";
      partyId?: number;
      description: string;
    }[] = [
      {
        accountId: arAccount.id,
        currencyCode: input.currencyCode,
        direction: "debit",
        amount: rentAmount.plus(depositAmount).toFixed(),
        partyType: "tenant",
        partyId: input.tenantPartyId,
        description: `کرایه ${rentalNumber} - د لومړۍ مودې او امانت حساب`,
      },
      {
        accountId: revenueAccount.id,
        currencyCode: input.currencyCode,
        direction: "credit",
        amount: rentAmount.toFixed(),
        description: `کرایه ${rentalNumber} - د لومړۍ مودې کرایه`,
      },
    ];
    if (depositAmount.greaterThan(0)) {
      lines.push({
        accountId: depositAccount.id,
        currencyCode: input.currencyCode,
        direction: "credit" as const,
        amount: depositAmount.toFixed(),
        partyType: "tenant" as const,
        partyId: input.tenantPartyId,
        description: `کرایه ${rentalNumber} - د بېرته ورکولو امانت`,
      });
    }

    await postJournal(
      {
        transactionDate: input.startDate,
        memo: `کرایه ${rentalNumber} - واحد ${unit.id}`,
        isManual: false,
        createdByUserId: input.createdByUserId ?? null,
        source: { module: "rental", sourceId: rental.id, postingType: "rental_creation" },
        lines,
      },
      t,
    );

    unit.status = "rented";
    await unit.save({ transaction: t });

    if (input.firstReceivedAmount !== undefined && input.firstReceivedAmount !== null) {
      const firstAmount = new Decimal(input.firstReceivedAmount);
      if (firstAmount.greaterThan(0)) {
        await applyReceipt(
          rental,
          {
            rentalId: rental.id,
            amount: input.firstReceivedAmount,
            currencyCode: input.currencyCode,
            receiptDate: input.startDate,
            method: input.firstReceiptMethod,
            cashAccountId: input.firstReceiptCashAccountId ?? null,
            reference: input.firstReceiptReference ?? null,
            note: input.firstReceiptNote ?? "لومړنی رسید د کرایې د ثبت پر وخت درج شو",
            receivedByUserId: input.createdByUserId ?? null,
          },
          t,
        );
      }
    }

    return rental;
  });
}

async function computeBalance(rental: Rental, t?: Transaction): Promise<Decimal> {
  const receipts = await RentalReceipt.findAll({ where: { rentalId: rental.id, voidedAt: null }, transaction: t });
  const received = receipts.reduce((sum, r) => sum.plus(new Decimal(r.amount)), new Decimal(0));
  return new Decimal(rental.rentAmount).plus(rental.depositAmount).minus(received);
}

export interface AddRentalReceiptInput {
  rentalId: number;
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

/** Mirrors sales-service.applyReceipt — must always run inside a transaction the caller owns. */
async function applyReceipt(rental: Rental, input: AddRentalReceiptInput, t: Transaction): Promise<RentalReceipt> {
  if (rental.status === "cancelled") {
    throw new PostingError(`Cannot add a receipt to a ${rental.status} rental`);
  }
  if (rental.currencyCode !== input.currencyCode) {
    throw new PostingError(`Rental is in ${rental.currencyCode}; receipt must use the same currency`);
  }

  const amount = new Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) throw new PostingError("Receipt amount must be greater than zero");

  const balance = await computeBalance(rental, t);
  const appliedAmount = Decimal.min(amount, Decimal.max(balance, 0));
  const overpayAmount = amount.minus(appliedAmount);
  if (overpayAmount.greaterThan(0) && !input.allowOverpayment) {
    throw new PostingError(
      `Amount exceeds remaining balance of ${balance.toFixed()} — confirm overpayment to record the excess`,
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

  const receiptNumber = await nextDocumentNumber("rental_receipt", t);
  const receipt = await RentalReceipt.create(
    {
      receiptNumber,
      rentalId: rental.id,
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
    cashAccount != null
      ? await Account.findByPk(cashAccount.accountId, { transaction: t })
      : await Account.findOne({ where: { code: "1000" }, transaction: t });
  const arAccount = await Account.findOne({ where: { code: AR_ACCOUNT_CODE }, transaction: t });
  if (!cashLedgerAccount || !arAccount) throw new PostingError("Core accounts are missing");

  await postJournal(
    {
      transactionDate: input.receiptDate,
      memo: `د کرایې رسید ${receiptNumber} د کرایې ${rental.rentalNumber}`,
      isManual: false,
      createdByUserId: input.receivedByUserId ?? null,
      source: { module: "rental_receipt", sourceId: receipt.id, postingType: "rental_receipt" },
      lines: [
        {
          accountId: cashLedgerAccount.id,
          currencyCode: input.currencyCode,
          direction: "debit",
          amount: amount.toFixed(),
          description: `د کرایې رسید ${receiptNumber}`,
        },
        {
          accountId: arAccount.id,
          currencyCode: input.currencyCode,
          direction: "credit",
          amount: amount.toFixed(),
          partyType: "tenant",
          partyId: rental.tenantPartyId,
          description: `د کرایې رسید ${receiptNumber} د کرایې ${rental.rentalNumber} ته تطبیق`,
        },
      ],
    },
    t,
  );

  return receipt;
}

export async function addRentalReceipt(input: AddRentalReceiptInput): Promise<RentalReceipt> {
  const rental = await Rental.findByPk(input.rentalId);
  if (!rental) throw new PostingError("Rental not found");
  return sequelize.transaction((t) => applyReceipt(rental, input, t));
}

export async function reverseRentalReceipt(receiptId: number, params: { userId: number; reason: string }): Promise<RentalReceipt> {
  const receipt = await RentalReceipt.findByPk(receiptId);
  if (!receipt) throw new PostingError("Receipt not found");
  if (receipt.voidedAt) throw new PostingError("Receipt is already voided");

  const link = await PostingLink.findOne({ where: { sourceModule: "rental_receipt", sourceId: receipt.id, postingType: "rental_receipt" } });
  if (!link) throw new PostingError("No posting found for this receipt");

  return sequelize.transaction(async (t) => {
    await reverseJournal(link.transactionId, params, t);
    receipt.voidedAt = new Date();
    receipt.voidReason = params.reason;
    await receipt.save({ transaction: t });
    return receipt;
  });
}

export async function endRental(rentalId: number, params: { userId: number; endDate: string }): Promise<Rental> {
  const rental = await Rental.findByPk(rentalId);
  if (!rental) throw new PostingError("Rental not found");
  if (rental.status !== "active") throw new PostingError(`Rental is already ${rental.status}`);

  return sequelize.transaction(async (t) => {
    rental.status = "ended";
    rental.endDate = params.endDate;
    await rental.save({ transaction: t });

    const unit = await Unit.findByPk(rental.unitId, { transaction: t });
    if (unit && unit.status === "rented") {
      unit.status = "available";
      await unit.save({ transaction: t });
    }
    return rental;
  });
}

export async function getRentalBalance(rental: Rental): Promise<string> {
  const balance = await computeBalance(rental);
  return balance.toFixed();
}
