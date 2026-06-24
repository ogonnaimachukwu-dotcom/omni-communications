import { and, eq } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db";
import { suppressions, distributors } from "@/db/schema";

export type SuppressionRow = typeof suppressions.$inferSelect;
export type SuppressionReason = SuppressionRow["reason"];

/** Suppression reason -> distributor lifecycle status. */
const REASON_TO_STATUS: Record<SuppressionReason, (typeof distributors.$inferSelect)["status"]> = {
  unsubscribe: "unsubscribed",
  bounce: "bounced",
  complaint: "complained",
  manual: "unsubscribed",
};

export async function add(
  input: { projectId: string; email: string; reason: SuppressionReason; source?: string | null },
  conn: DB = defaultDb,
): Promise<void> {
  await conn
    .insert(suppressions)
    .values({
      projectId: input.projectId,
      email: input.email.toLowerCase(),
      reason: input.reason,
      source: input.source ?? null,
    })
    // One suppression per (project, email); re-signals are no-ops.
    .onConflictDoNothing({ target: [suppressions.projectId, suppressions.email] });
}

export async function has(projectId: string, email: string, conn: DB = defaultDb): Promise<boolean> {
  const [row] = await conn
    .select({ id: suppressions.id })
    .from(suppressions)
    .where(and(eq(suppressions.projectId, projectId), eq(suppressions.email, email.toLowerCase())))
    .limit(1);
  return Boolean(row);
}

export async function emails(projectId: string, conn: DB = defaultDb): Promise<Set<string>> {
  const rows = await conn
    .select({ email: suppressions.email })
    .from(suppressions)
    .where(eq(suppressions.projectId, projectId));
  return new Set(rows.map((r) => r.email.toLowerCase()));
}

/** Reflect a suppression onto any matching distributors in the project. */
export async function reflectOnDistributors(
  projectId: string,
  email: string,
  reason: SuppressionReason,
  conn: DB = defaultDb,
): Promise<void> {
  await conn
    .update(distributors)
    .set({ status: REASON_TO_STATUS[reason] })
    .where(and(eq(distributors.projectId, projectId), eq(distributors.email, email.toLowerCase())));
}

/** Resolve project + token -> the distributor (for one-click unsubscribe). */
export async function findByUnsubscribeToken(token: string, conn: DB = defaultDb) {
  const [row] = await conn
    .select({
      id: distributors.id,
      projectId: distributors.projectId,
      email: distributors.email,
    })
    .from(distributors)
    .where(eq(distributors.unsubscribeToken, token))
    .limit(1);
  return row ?? null;
}
