import { and, eq, desc } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db";
import { sendingDomains } from "@/db/schema";

export type SendingDomainRow = typeof sendingDomains.$inferSelect;

export function listByProject(projectId: string, conn: DB = defaultDb): Promise<SendingDomainRow[]> {
  return conn
    .select()
    .from(sendingDomains)
    .where(eq(sendingDomains.projectId, projectId))
    .orderBy(desc(sendingDomains.isDefault), desc(sendingDomains.createdAt));
}

/** Verified domains only — the set a campaign may actually send from. */
export function listVerified(projectId: string, conn: DB = defaultDb): Promise<SendingDomainRow[]> {
  return conn
    .select()
    .from(sendingDomains)
    .where(and(eq(sendingDomains.projectId, projectId), eq(sendingDomains.status, "verified")))
    .orderBy(desc(sendingDomains.isDefault), desc(sendingDomains.createdAt));
}
