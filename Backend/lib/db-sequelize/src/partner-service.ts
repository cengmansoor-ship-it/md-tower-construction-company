import Decimal from "decimal.js";
import type { Transaction } from "sequelize";
import { sequelize } from "./connection";
import { Partner, PartnerTransaction, Party, Account, CashAccount } from "./models";
import { postJournal, PostingError } from "./posting";
import { nextDocumentNumber } from "./numbering";

const EQUITY_ACCOUNT_CODE = "3000";

export interface CreatePartnerInput {
  partyId: number;
  initialInvestment: string | number;
  currencyCode: string;
  ownershipPercent?: string | number | null;
  joinDate: string;
  notes?: string | null;
  createdByUserId?: number | null;
}

export async function createPartner(input: CreatePartnerInput): Promise<Partner> {
  const party = await Party.findByPk(input.partyId);
  if (!party) throw new PostingError("Party not found");
  const existing = await Partner.findOne({ where: { partyId: input.partyId } });
  if (existing) {
    if (existing.status === "inactive") {
      existing.status = "active";
      await existing.save();
    }
    return existing;
  }

  const initialInvestment = new Decimal(input.initialInvestment);
  if (initialInvestment.lessThan(0)) throw new PostingError("Initial investment cannot be negative");

  return sequelize.transaction(async (t) => {
    const partnerNumber = await nextDocumentNumber("partner", t);
    const partner = await Partner.create(
      {
        partnerNumber,
        partyId: input.partyId,
        initialInvestment: initialInvestment.toFixed(),
        currencyCode: input.currencyCode,
        ownershipPercent: input.ownershipPercent != null ? new Decimal(input.ownershipPercent).toFixed(3) : null,
        joinDate: input.joinDate,
        notes: input.notes ?? null,
        createdByUserId: input.createdByUserId ?? null,
      },
      { transaction: t },
    );

    if (initialInvestment.greaterThan(0)) {
      const equityAccount = await Account.findOne({ where: { code: EQUITY_ACCOUNT_CODE }, transaction: t });
      const cashAccount = await Account.findOne({ where: { code: "1000" }, transaction: t });
      if (!equityAccount || !cashAccount) throw new PostingError("Core accounts are missing");

      await postJournal(
        {
          transactionDate: input.joinDate,
          memo: `Initial investment by ${party.name}`,
          isManual: false,
          createdByUserId: input.createdByUserId ?? null,
          source: { module: "partner", sourceId: partner.id, postingType: "partner_initial_investment" },
          lines: [
            {
              accountId: cashAccount.id,
              currencyCode: input.currencyCode,
              direction: "debit",
              amount: initialInvestment.toFixed(),
              description: `Initial investment by ${party.name} received`,
            },
            {
              accountId: equityAccount.id,
              currencyCode: input.currencyCode,
              direction: "credit",
              amount: initialInvestment.toFixed(),
              partyType: "partner",
              partyId: partner.id,
              description: `Initial investment by ${party.name}`,
            },
          ],
        },
        t,
      );
    }

    return partner;
  });
}

/** Partner capital balance for one currency = initial investment (only its currency) + investments - withdrawals. */
async function computeBalance(partner: Partner, t?: Transaction, currencyCode = partner.currencyCode): Promise<Decimal> {
  const transactions = await PartnerTransaction.findAll({ where: { partnerId: partner.id, currencyCode }, transaction: t });
  let balance = partner.currencyCode === currencyCode ? new Decimal(partner.initialInvestment) : new Decimal(0);
  for (const tx of transactions) {
    const amount = new Decimal(tx.amount);
    balance = tx.type === "investment" ? balance.plus(amount) : balance.minus(amount);
  }
  return balance;
}

export async function getPartnerBalance(partner: Partner): Promise<string> {
  const balance = await computeBalance(partner);
  return balance.toFixed();
}

export async function getPartnerBalances(partner: Partner): Promise<Record<string, string>> {
  const totals = new Map<string, Decimal>();
  totals.set(partner.currencyCode, new Decimal(partner.initialInvestment));
  const transactions = await PartnerTransaction.findAll({ where: { partnerId: partner.id } });
  for (const tx of transactions) {
    const current = totals.get(tx.currencyCode) ?? new Decimal(0);
    const amount = new Decimal(tx.amount);
    totals.set(tx.currencyCode, tx.type === "investment" ? current.plus(amount) : current.minus(amount));
  }
  return Object.fromEntries(Array.from(totals.entries()).map(([currencyCode, balance]) => [currencyCode, balance.toFixed()]));
}

export interface AddPartnerTransactionInput {
  partnerId: number;
  type: "investment" | "withdrawal";
  amount: string | number;
  currencyCode: string;
  transactionDate: string;
  cashAccountId?: number | null;
  description?: string | null;
  note?: string | null;
  createdByUserId?: number | null;
}

export async function addPartnerTransaction(input: AddPartnerTransactionInput): Promise<PartnerTransaction> {
  const partner = await Partner.findByPk(input.partnerId, { include: [{ model: Party, as: "party" }] });
  if (!partner) throw new PostingError("Partner not found");
  const amount = new Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) throw new PostingError("Amount must be greater than zero");

  return sequelize.transaction(async (t) => {
    const balance = await computeBalance(partner, t, input.currencyCode);

    let cashAccount: CashAccount | null = null;
    if (input.cashAccountId) {
      cashAccount = await CashAccount.findByPk(input.cashAccountId, { transaction: t });
      if (!cashAccount) throw new PostingError("Cash account not found");
      if (cashAccount.currencyCode !== input.currencyCode) {
        throw new PostingError("Cash account currency does not match transaction currency");
      }
    }

    const transactionNumber = await nextDocumentNumber("partner_transaction", t);
    const newBalance = input.type === "investment" ? balance.plus(amount) : balance.minus(amount);
    const tx = await PartnerTransaction.create(
      {
        transactionNumber,
        partnerId: partner.id,
        transactionDate: input.transactionDate,
        type: input.type,
        amount: amount.toFixed(),
        previousBalance: balance.toFixed(),
        newBalance: newBalance.toFixed(),
        currencyCode: input.currencyCode,
        description: input.description?.trim() || null,
        note: input.note ?? null,
        createdByUserId: input.createdByUserId ?? null,
      },
      { transaction: t },
    );

    const equityAccount = await Account.findOne({ where: { code: EQUITY_ACCOUNT_CODE }, transaction: t });
    const cashLedgerAccount =
      cashAccount != null
        ? await Account.findByPk(cashAccount.accountId, { transaction: t })
        : await Account.findOne({ where: { code: "1000" }, transaction: t });
    if (!equityAccount || !cashLedgerAccount) throw new PostingError("Core accounts are missing");

    const partnerName = (partner as unknown as { party?: { name?: string } }).party?.name ?? `Partner #${partner.id}`;
    const descriptionSuffix = input.description?.trim() ? ` — ${input.description.trim()}` : "";
    const lines =
      input.type === "investment"
        ? [
            {
              accountId: cashLedgerAccount.id,
              currencyCode: input.currencyCode,
              direction: "debit" as const,
              amount: amount.toFixed(),
              description: `Investment ${transactionNumber} by ${partnerName}${descriptionSuffix}`,
            },
            {
              accountId: equityAccount.id,
              currencyCode: input.currencyCode,
              direction: "credit" as const,
              amount: amount.toFixed(),
              partyType: "partner" as const,
              partyId: partner.id,
              description: `Investment ${transactionNumber} by ${partnerName}${descriptionSuffix}`,
            },
          ]
        : [
            {
              accountId: equityAccount.id,
              currencyCode: input.currencyCode,
              direction: "debit" as const,
              amount: amount.toFixed(),
              partyType: "partner" as const,
              partyId: partner.id,
              description: `Withdrawal ${transactionNumber} by ${partnerName}${descriptionSuffix}`,
            },
            {
              accountId: cashLedgerAccount.id,
              currencyCode: input.currencyCode,
              direction: "credit" as const,
              amount: amount.toFixed(),
              description: `Withdrawal ${transactionNumber} by ${partnerName}${descriptionSuffix}`,
            },
          ];

    await postJournal(
      {
        transactionDate: input.transactionDate,
        memo: `${input.type === "investment" ? "Investment" : "Withdrawal"} ${transactionNumber} — ${partnerName}${descriptionSuffix}`,
        isManual: false,
        createdByUserId: input.createdByUserId ?? null,
        source: { module: "partner_transaction", sourceId: tx.id, postingType: "partner_transaction" },
        lines,
      },
      t,
    );

    return tx;
  });
}
