import { db } from "@/db";
import { writeAudit } from "@/lib/audit";
import * as repo from "./suppression.repository";
import type { SuppressionReason } from "./suppression.repository";

import { getAccessibleProject } from "@/core/projects/project.service";

export interface Actor {
  userId: string;
  ipAddress?: string | null;
}

/**
 * Record a suppression and reflect it onto matching distributors, atomically.
 * Idempotent: re-suppressing the same address is a no-op. A suppressed address
 * is NEVER resubscribed by a later campaign — this is the compliance gate.
 */
export async function suppress(
  projectId: string,
  input: { email: string; reason: SuppressionReason; source?: string | null },
  actor?: Actor,
): Promise<void> {
  if (actor?.userId) {
    const accessible = await getAccessibleProject(projectId, actor.userId);
    if (!accessible) throw new Error("Project access denied");
  }

  await db.transaction(async (tx) => {
    await repo.add({ projectId, ...input }, tx);
    await repo.reflectOnDistributors(projectId, input.email, input.reason, tx);
  });


  await writeAudit({
    actorUserId: actor?.userId ?? null,
    projectId,
    action: "suppression.created",
    entityType: "suppression",
    metadata: { email: input.email.toLowerCase(), reason: input.reason, source: input.source ?? null },
    ipAddress: actor?.ipAddress ?? null,
  });
}

export function isSuppressed(projectId: string, email: string): Promise<boolean> {
  return repo.has(projectId, email);
}

export function suppressedEmails(projectId: string): Promise<Set<string>> {
  return repo.emails(projectId);
}

export function suppressedEmailsInBatch(projectId: string, emails: string[]): Promise<Set<string>> {
  return repo.emailsInBatch(projectId, emails);
}

export function resolveUnsubscribeToken(token: string) {
  return repo.findByUnsubscribeToken(token);
}

/** Map a Resend webhook event type to a suppression reason, if any. */
export function reasonForEvent(eventType: string): SuppressionReason | null {
  switch (eventType) {
    case "email.bounced":
    case "bounced":
      return "bounce";
    case "email.complained":
    case "complained":
      return "complaint";
    default:
      return null;
  }
}
