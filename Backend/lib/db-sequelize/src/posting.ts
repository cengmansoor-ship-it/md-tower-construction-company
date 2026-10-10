import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import type { Transaction } from "sequelize";
import { sequelize } from "./connection";
import { JournalTransaction, JournalLine, PostingLink, Account } from "./models";

function exactDecimal(value: string | number | Decimal): string {
  return new Decimal(value).toFixed();
}

export interface PostingLineInput {
  accountId: number;
  currencyCode: string;
  direction: "debit" | "credit";
  amount: string | number;
  partyType?: "customer" | "supplier" | "tenant" | "employee" | "partner" | "exchange_dealer" | null;
  partyId?: number | null;
  description?: string | null;
}

export interface PostJournalInput {
  transactionDate: string;
  memo?: string | null;
  isManual?: boolean;
  createdByUserId?: number | null;
  idempotencyKey?: string;
  lines: PostingLineInput[];
  /** When provided, guarantees this source record posts under this postingType exactly once. */
  source?: { module: string; sourceId: number; postingType: string };
}

export class PostingError extends Error {}

/**
 * The single entry point for every financial posting in the system (ACCT-01..05).
 * Enforces: debit === credit per currency, idempotency, and one-posting-per-source-per-type.
 */
/**
 * Posts a balanced journal transaction.
 *
 * If `existingTransaction` is provided, all writes join that transaction instead of opening a
 * new one — required whenever a caller (e.g. createSale/addSaleReceipt) already holds its own
 * `sequelize.transaction()`. Sequelize does not auto-nest transactions without CLS, so opening a
 * second independent transaction here while the caller's is still open causes SQLite to see two
 * concurrent writers and fail (this was the cause of the sale-creation HTTP 500).
 */
export async function postJournal(input: PostJournalInput, existingTransaction?: Transaction): Promise<JournalTransaction> {
  if (input.lines.length < 2) {
    throw new PostingError("A journal transaction requires at least two lines");
  }

  const totalsByCurrency = new Map<string, { debit: Decimal; credit: Decimal }>();
  for (const line of input.lines) {
    const amount = new Decimal(line.amount);
    if (amount.lessThanOrEqualTo(0)) {
      throw new PostingError("Journal line amounts must be greater than zero");
    }
    const bucket = totalsByCurrency.get(line.currencyCode) ?? { debit: new Decimal(0), credit: new Decimal(0) };
    if (line.direction === "debit") bucket.debit = bucket.debit.plus(amount);
    else bucket.credit = bucket.credit.plus(amount);
    totalsByCurrency.set(line.currencyCode, bucket);
  }
  for (const [currencyCode, totals] of totalsByCurrency) {
    if (!totals.debit.equals(totals.credit)) {
      throw new PostingError(
        `Unbalanced posting in ${currencyCode}: debit ${exactDecimal(totals.debit)} != credit ${exactDecimal(totals.credit)}`,
      );
    }
  }

  const run = async (t: Transaction): Promise<JournalTransaction> => {
    if (input.source) {
      const existing = await PostingLink.findOne({
        where: { sourceModule: input.source.module, sourceId: input.source.sourceId, postingType: input.source.postingType },
        transaction: t,
      });
      if (existing) {
        throw new PostingError(
          `Source ${input.source.module}#${input.source.sourceId} was already posted for "${input.source.postingType}"`,
        );
      }
    }

    const transaction = await JournalTransaction.create(
      {
        idempotencyKey: input.idempotencyKey ?? randomUUID(),
        transactionDate: input.transactionDate,
        memo: input.memo ?? null,
        isManual: input.isManual ?? false,
        createdByUserId: input.createdByUserId ?? null,
      },
      { transaction: t },
    );

    for (const line of input.lines) {
      const account = await Account.findByPk(line.accountId, { transaction: t });
      if (!account) throw new PostingError(`Account ${line.accountId} not found`);
      await JournalLine.create(
        {
          transactionId: transaction.id,
          accountId: line.accountId,
          currencyCode: line.currencyCode,
          direction: line.direction,
          amount: exactDecimal(line.amount),
          partyType: line.partyType ?? null,
          partyId: line.partyId ?? null,
          description: line.description ?? null,
        },
        { transaction: t },
      );
    }

    if (input.source) {
      await PostingLink.create(
        {
          sourceModule: input.source.module,
          sourceId: input.source.sourceId,
          postingType: input.source.postingType,
          transactionId: transaction.id,
        },
        { transaction: t },
      );
    }

    return transaction;
  };

  return existingTransaction ? run(existingTransaction) : sequelize.transaction(run);
}

export async function reverseJournal(
  transactionId: number,
  params: { userId: number; reason: string },
  existingTransaction?: Transaction,
): Promise<JournalTransaction> {
  const original = await JournalTransaction.findByPk(transactionId, { include: [{ model: JournalLine, as: "lines" }] });
  if (!original) throw new PostingError("Transaction not found");
  if (original.voidedAt) throw new PostingError("Transaction is already voided");

  const lines = await JournalLine.findAll({ where: { transactionId } });
  const reversedLines: PostingLineInput[] = lines.map((l) => ({
    accountId: l.accountId,
    currencyCode: l.currencyCode,
    direction: l.direction === "debit" ? "credit" : "debit",
    amount: l.amount,
    partyType: l.partyType,
    partyId: l.partyId,
    description: l.description ? `بېرته کول: ${l.description}` : "بېرته کول",
  }));

  const run = async (t: Transaction): Promise<JournalTransaction> => {
    original.voidedAt = new Date();
    original.voidedByUserId = params.userId;
    original.voidReason = params.reason;
    await original.save({ transaction: t });

    const reversal = await JournalTransaction.create(
      {
        idempotencyKey: randomUUID(),
        transactionDate: new Date().toISOString().slice(0, 10),
        memo: `د ثبت ${original.id} بېرته کول: ${params.reason}`,
        isManual: true,
        createdByUserId: params.userId,
        reversalOfId: original.id,
      },
      { transaction: t },
    );

    for (const line of reversedLines) {
      await JournalLine.create(
        {
          transactionId: reversal.id,
          accountId: line.accountId,
          currencyCode: line.currencyCode,
          direction: line.direction,
          amount: exactDecimal(line.amount),
          partyType: line.partyType ?? null,
          partyId: line.partyId ?? null,
          description: line.description ?? null,
        },
        { transaction: t },
      );
    }

    return reversal;
  };

  return existingTransaction ? run(existingTransaction) : sequelize.transaction(run);
}
