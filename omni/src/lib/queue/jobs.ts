/**
 * Job queue contract. Every async, side-effectful operation is enqueued here
 * and executed by the worker — never inline in a request.
 */

export const QUEUES = {
  SEND_CAMPAIGN_RECIPIENT: "send-campaign-recipient",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface SendCampaignRecipientJob {
  recipientId: string;
  campaignId: string;
  projectId: string;
}
