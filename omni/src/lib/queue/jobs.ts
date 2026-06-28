/**
 * Job queue contract. Every async, side-effectful operation is enqueued here
 * and executed by the worker — never inline in a request.
 */

export const QUEUES = {
  // Fan-out: resolve+freeze the audience, then enqueue one recipient job each.
  SEND_CAMPAIGN: "send-campaign",
  // Per-recipient: re-check suppression, render, send, update the ledger.
  SEND_CAMPAIGN_RECIPIENT: "send-campaign-recipient",
  // Mailbox synchronization: fetch bounces (NDRs) for active mailboxes.
  SYNC_MAILBOX_INBOX: "sync-mailbox-inbox",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface SendCampaignJob {
  campaignId: string;
  projectId: string;
  correlationId?: string;
  /**
   * Optional audience refinement, captured at send/schedule time and frozen
   * into the recipient ledger when this job runs. Carried in the payload so no
   * campaign schema column is needed.
   */
  tagId?: string;
  subscription?: "subscribed" | "unsubscribed" | "bounced" | "complained";
}

export interface SendCampaignRecipientJob {
  recipientId: string;
  campaignId: string;
  projectId: string;
  correlationId?: string;
}

export interface SyncMailboxJob {
  mailboxId: string;
  correlationId?: string;
}
