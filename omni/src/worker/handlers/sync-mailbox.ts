import type PgBoss from "pg-boss";
import { syncMailboxBounces } from "@/core/mailboxes/mailbox.service";

export interface SyncMailboxJob {
  mailboxId: string;
}

export async function handleSyncMailbox(job: PgBoss.Job<SyncMailboxJob>): Promise<void> {
  const { mailboxId } = job.data;
  await syncMailboxBounces(mailboxId);
}
