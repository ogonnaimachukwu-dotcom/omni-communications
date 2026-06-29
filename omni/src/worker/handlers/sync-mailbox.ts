import type PgBoss from "pg-boss";
import { syncInboxConnection } from "@/core/communication/inbox.sync.service";
import { logger } from "@/lib/logger";

export interface SyncInboxJob {
  inboxConnectionId: string;
  correlationId?: string;
}

/** @deprecated Use SyncInboxJob — kept for backward compatibility during transition */
export interface SyncMailboxJob {
  mailboxId: string;
  correlationId?: string;
}

export async function handleSyncInbox(job: PgBoss.Job<SyncInboxJob>): Promise<void> {
  const { inboxConnectionId } = job.data;
  try {
    const result = await syncInboxConnection(inboxConnectionId);
    logger.info("Inbox sync job complete", {
      inboxConnectionId,
      messagesNew: result.messagesNew,
      durationMs: result.durationMs,
    });
  } catch (err) {
    logger.error("Inbox sync job failed", { inboxConnectionId, error: err });
    throw err; // Let pg-boss retry
  }
}

/** @deprecated Legacy mailbox bounce sync — retained for in-flight jobs */
export async function handleSyncMailbox(job: PgBoss.Job<SyncMailboxJob>): Promise<void> {
  const { mailboxId } = job.data;
  logger.warn("Legacy handleSyncMailbox called", { mailboxId });
  // No-op: mailbox bounce sync is superseded by Resend webhook tracking
}
