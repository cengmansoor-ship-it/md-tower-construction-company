import { Op, type Transaction } from "sequelize";
import { JournalTransaction, PostingLink } from "./models";

export async function findVoidedPostedSourceIds(params: {
  sourceModule: string;
  sourceIds: number[];
  postingType?: string;
  transaction?: Transaction;
}): Promise<Set<number>> {
  if (params.sourceIds.length === 0) return new Set();
  const where: Record<string, unknown> = {
    sourceModule: params.sourceModule,
    sourceId: { [Op.in]: params.sourceIds },
  };
  if (params.postingType) where["postingType"] = params.postingType;

  const links = await PostingLink.findAll({
    where,
    include: [{ model: JournalTransaction, as: "transaction", required: false }],
    transaction: params.transaction,
  });
  const voided = new Set<number>();
  for (const link of links) {
    const joined = link.toJSON() as { transaction?: { voidedAt?: string | Date | null; reversalOfId?: number | null } | null };
    if (!joined.transaction || joined.transaction.voidedAt || joined.transaction.reversalOfId) voided.add(link.sourceId);
  }
  return voided;
}
