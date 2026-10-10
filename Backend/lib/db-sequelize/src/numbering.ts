import type { Transaction } from "sequelize";
import { DocumentSequence } from "./models";

/** Atomically reserves and returns the next formatted document number for a given type (e.g. "SC-0001"). */
export async function nextDocumentNumber(documentType: string, transaction: Transaction): Promise<string> {
  const [seq] = await DocumentSequence.findOrCreate({
    where: { documentType },
    defaults: { documentType, prefix: "", nextNumber: 1 },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const number = seq.nextNumber;
  seq.nextNumber = number + 1;
  await seq.save({ transaction });
  return `${seq.prefix}${String(number).padStart(4, "0")}`;
}
