import Decimal from "decimal.js";
import { sequelize } from "./connection";
import { Expense, CashAccount, Account, PostingLink, type ExpenseCategory } from "./models";
import { postJournal, reverseJournal, PostingError } from "./posting";
import { nextDocumentNumber } from "./numbering";

const EXPENSE_ACCOUNT_CODE = "5000";

export interface CreateExpenseInput {
  category: ExpenseCategory;
  categoryName?: string | null;
  expenseDate: string;
  description: string;
  amount: string | number;
  currencyCode: string;
  payeePartyId?: number | null;
  payeeName?: string | null;
  projectId?: number | null;
  cashAccountId?: number | null;
  createdByUserId?: number | null;
}

export async function createExpense(input: CreateExpenseInput): Promise<Expense> {
  const amount = new Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) throw new PostingError("Expense amount must be greater than zero");
  if (!input.description?.trim()) throw new PostingError("Description is required");

  return sequelize.transaction(async (t) => {
    const expenseNumber = await nextDocumentNumber("expense_voucher", t);

    let cashAccount: CashAccount | null = null;
    if (input.cashAccountId) {
      cashAccount = await CashAccount.findByPk(input.cashAccountId, { transaction: t });
      if (!cashAccount) throw new PostingError("Cash account not found");
      if (cashAccount.currencyCode !== input.currencyCode) {
        throw new PostingError("Cash account currency does not match expense currency");
      }
    }

    const expense = await Expense.create(
      {
        expenseNumber,
        category: input.category,
        categoryName: input.categoryName?.trim() || null,
        expenseDate: input.expenseDate,
        description: input.description.trim(),
        amount: amount.toFixed(),
        currencyCode: input.currencyCode,
        payeePartyId: input.payeePartyId ?? null,
        payeeName: input.payeeName ?? null,
        projectId: input.projectId ?? null,
        cashAccountId: input.cashAccountId ?? null,
        createdByUserId: input.createdByUserId ?? null,
      },
      { transaction: t },
    );

    const expenseAccount = await Account.findOne({ where: { code: EXPENSE_ACCOUNT_CODE }, transaction: t });
    const cashLedgerAccount =
      cashAccount != null
        ? await Account.findByPk(cashAccount.accountId, { transaction: t })
        : await Account.findOne({ where: { code: "1000" }, transaction: t });
    if (!expenseAccount || !cashLedgerAccount) throw new PostingError("Core accounts are missing");

    await postJournal(
      {
        transactionDate: input.expenseDate,
        memo: `مصرف ${expenseNumber}: ${input.description}`,
        isManual: false,
        createdByUserId: input.createdByUserId ?? null,
        source: { module: "expense", sourceId: expense.id, postingType: "expense" },
        lines: [
          {
            accountId: expenseAccount.id,
            currencyCode: input.currencyCode,
            direction: "debit",
            amount: amount.toFixed(),
            description: `مصرف ${expenseNumber} - ${input.description}`,
          },
          {
            accountId: cashLedgerAccount.id,
            currencyCode: input.currencyCode,
            direction: "credit",
            amount: amount.toFixed(),
            partyType: input.payeePartyId ? "supplier" : undefined,
            partyId: input.payeePartyId ?? null,
            description: `مصرف ${expenseNumber} تادیه`,
          },
        ],
      },
      t,
    );

    return expense;
  });
}

export async function voidExpense(expenseId: number, params: { userId: number; reason: string }): Promise<Expense> {
  const expense = await Expense.findByPk(expenseId);
  if (!expense) throw new PostingError("Expense not found");
  if (expense.voidedAt) throw new PostingError("Expense is already voided");

  const link = await PostingLink.findOne({ where: { sourceModule: "expense", sourceId: expense.id, postingType: "expense" } });
  if (!link) throw new PostingError("No posting found for this expense");

  return sequelize.transaction(async (t) => {
    await reverseJournal(link.transactionId, params, t);
    expense.voidedAt = new Date();
    expense.voidReason = params.reason;
    await expense.save({ transaction: t });
    return expense;
  });
}
