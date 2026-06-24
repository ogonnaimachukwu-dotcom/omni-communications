import "@/env"; // validate env at boot
import { getBoss, stopBoss } from "@/lib/queue";
import { QUEUES, type SendCampaignJob, type SendCampaignRecipientJob, type SyncMailboxJob } from "@/lib/queue/jobs";
import { handleSendCampaign } from "./handlers/send-campaign";
import { handleSendRecipient } from "./handlers/send-recipient";
import { handleSyncMailbox } from "./handlers/sync-mailbox";
import * as mailboxRepo from "@/core/mailboxes/mailbox.repository";

/**
 * Worker process. Boots pg-boss and registers the campaign send pipeline:
 *   SEND_CAMPAIGN           -> fan-out: freeze audience, enqueue recipients
 *   SEND_CAMPAIGN_RECIPIENT -> render -> suppression re-check -> send -> ledger
 *   SYNC_MAILBOX_INBOX      -> sync recent bounce NDRs from Gmail/Outlook
 *
 * Recipient concurrency is bounded (batchSize) to stay within Resend rate
 * limits and the 2 CPU / 2 GB VPS.
 */
async function main() {
  const boss = await getBoss();

  await boss.createQueue(QUEUES.SEND_CAMPAIGN);
  await boss.createQueue(QUEUES.SEND_CAMPAIGN_RECIPIENT);
  await boss.createQueue(QUEUES.SYNC_MAILBOX_INBOX);
  await boss.createQueue("mailbox-sync-cron");

  await boss.work<SendCampaignJob>(QUEUES.SEND_CAMPAIGN, async ([job]) => {
    await handleSendCampaign(job);
  });

  await boss.work<SendCampaignRecipientJob>(
    QUEUES.SEND_CAMPAIGN_RECIPIENT,
    { batchSize: 5 },
    async (jobs) => {
      for (const job of jobs) await handleSendRecipient(job);
    },
  );

  // Sync worker running with low concurrency (2) to prevent VPS RAM/CPU exhaustion
  await boss.work<SyncMailboxJob>(
    QUEUES.SYNC_MAILBOX_INBOX,
    { batchSize: 2 },
    async (jobs) => {
      for (const job of jobs) await handleSyncMailbox(job);
    },
  );

  // Cron coordinator: queries all active mailboxes and enqueues sync jobs
  await boss.work("mailbox-sync-cron", async () => {
    const activeList = await mailboxRepo.listActive();
    for (const mb of activeList) {
      await boss.send(QUEUES.SYNC_MAILBOX_INBOX, { mailboxId: mb.id } satisfies SyncMailboxJob);
    }
  });

  // Schedule cron execution every 10 minutes
  await boss.schedule("mailbox-sync-cron", "*/10 * * * *");

  console.log("[worker] started; consuming:", Object.values(QUEUES).join(", "));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});

const shutdown = async () => {
  console.log("[worker] shutting down...");
  await stopBoss();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
