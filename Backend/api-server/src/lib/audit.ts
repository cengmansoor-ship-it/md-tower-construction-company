import type { Transaction } from "sequelize";
import { AuditLog } from "@workspace/db-sequelize";

export async function recordAudit(
  params: {
    userId: number | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: Record<string, unknown> | null;
  },
  transaction?: Transaction,
): Promise<void> {
  await AuditLog.create(
    {
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      details: params.details ? JSON.stringify(params.details) : null,
    },
    transaction ? { transaction } : undefined,
  );
}
