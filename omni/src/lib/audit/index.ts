import { db as defaultDb, type DB } from "@/db";
import { auditLogs } from "@/db/schema";

interface AuditInput {
  actorUserId?: string | null;
  projectId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/**
 * Append-only audit write (architecture §8). Used for every consequential
 * action: project created, distributors imported, campaign approved/sent, etc.
 */
export async function writeAudit(input: AuditInput, db: DB = defaultDb): Promise<void> {
  await db.insert(auditLogs).values({
    actorUserId: input.actorUserId ?? null,
    projectId: input.projectId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata,
    ipAddress: input.ipAddress ?? null,
  });
}
