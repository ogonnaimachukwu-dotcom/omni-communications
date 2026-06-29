import "@/env"; // validate env at boot
import { getBoss, stopBoss } from "@/lib/queue";
import { QUEUES, type SendCampaignJob, type SendCampaignRecipientJob, type SyncMailboxJob, type SyncInboxConnectionJob } from "@/lib/queue/jobs";
import { handleSendCampaign } from "./handlers/send-campaign";
import { handleSendRecipient } from "./handlers/send-recipient";
import { handleSyncInbox, handleSyncMailbox } from "./handlers/sync-mailbox";
import * as commRepo from "@/core/communication/communication.repository";
import { logStorage, logger } from "@/lib/logger";
import { randomUUID } from "crypto";
import { closeDatabase } from "@/db";
import { trace } from "@/lib/tracing";

/**
 * Worker process. Boots pg-boss and registers the full job pipeline:
 *   SEND_CAMPAIGN              -> fan-out: freeze audience, enqueue recipients
 *   SEND_CAMPAIGN_RECIPIENT    -> render -> suppression re-check -> send -> ledger
 *   SYNC_INBOX_CONNECTION      -> fetch new IMAP/OAuth messages, persist to inbox_messages
 *   SYNC_MAILBOX_INBOX (legacy)-> retained for backward compat, now no-op
 */
async function main() {
  const boss = await getBoss();
  const workerId = randomUUID();

  await boss.createQueue(QUEUES.SEND_CAMPAIGN);
  await boss.createQueue(QUEUES.SEND_CAMPAIGN_RECIPIENT);
  await boss.createQueue(QUEUES.SYNC_INBOX_CONNECTION);
  await boss.createQueue(QUEUES.SYNC_MAILBOX_INBOX); // legacy
  await boss.createQueue("inbox-sync-cron");
  await boss.createQueue("mailbox-sync-cron"); // legacy cron slot

  await boss.work<SendCampaignJob>(QUEUES.SEND_CAMPAIGN, async (jobs) => {
    const job = jobs[0];
    if (!job) return;
    const correlationId = job.data.correlationId || job.id;
    await logStorage.run(
      {
        workerId,
        jobId: job.id,
        correlationId,
        campaignId: job.data.campaignId,
        projectId: job.data.projectId,
      },
      async () => {
        await trace("worker.job.send_campaign", async () => {
          await handleSendCampaign(job);
        });
      }
    );
  });

  await boss.work<SendCampaignRecipientJob>(
    QUEUES.SEND_CAMPAIGN_RECIPIENT,
    { batchSize: 5 },
    async (jobs) => {
      for (const job of jobs) {
        const correlationId = job.data.correlationId || job.id;
        await logStorage.run(
          {
            workerId,
            jobId: job.id,
            correlationId,
            campaignId: job.data.campaignId,
            projectId: job.data.projectId,
          },
          async () => {
            await trace("worker.job.send_recipient", async () => {
              await handleSendRecipient(job);
            });
          }
        );
      }
    },
  );

  // Inbox sync worker — low concurrency to avoid hammering IMAP servers
  await boss.work<SyncInboxConnectionJob>(
    QUEUES.SYNC_INBOX_CONNECTION,
    { batchSize: 2 },
    async (jobs) => {
      for (const job of jobs) {
        const correlationId = job.data.correlationId || job.id;
        await logStorage.run(
          {
            workerId,
            jobId: job.id,
            correlationId,
            inboxConnectionId: job.data.inboxConnectionId,
          },
          async () => {
            await trace("worker.job.sync_inbox", async () => {
              await handleSyncInbox(job);
            });
          }
        );
      }
    },
  );

  // Legacy mailbox bounce sync — kept for backward compat, now no-op
  await boss.work<SyncMailboxJob>(
    QUEUES.SYNC_MAILBOX_INBOX,
    { batchSize: 2 },
    async (jobs) => {
      for (const job of jobs) {
        await handleSyncMailbox(job);
      }
    },
  );

  // Inbox sync cron: query all active inbox connections every 10 minutes
  await boss.work<{ correlationId?: string }>("inbox-sync-cron", async (jobs) => {
    const job = jobs[0];
    const correlationId = job ? (job.data.correlationId || job.id) : randomUUID();
    await logStorage.run(
      { workerId, jobId: job?.id, correlationId },
      async () => {
        await trace("worker.cron.inbox_sync", async () => {
          const activeInboxes = await commRepo.listActiveInboxConnections();
          for (const inbox of activeInboxes) {
            await boss.send(QUEUES.SYNC_INBOX_CONNECTION, {
              inboxConnectionId: inbox.id,
            } satisfies SyncInboxConnectionJob);
          }
          logger.info("Inbox sync cron dispatched", { count: activeInboxes.length });
        });
      }
    );
  });

  // Legacy mailbox-sync-cron slot (no-op body, retained to avoid pg-boss missing-queue errors)
  await boss.work<{ correlationId?: string }>("mailbox-sync-cron", async () => {});

  // Schedule both crons every 10 minutes
  await boss.schedule("inbox-sync-cron", "*/10 * * * *");
  await boss.schedule("mailbox-sync-cron", "*/10 * * * *");

  logger.info("Worker started", { queues: Object.values(QUEUES) });
}

main().catch((err) => {
  logger.error("Worker fatal error", err);
  process.exit(1);
});

const shutdown = async (signal: string) => {
  logger.info(`Worker received ${signal}, shutting down gracefully...`);
  try {
    await stopBoss();
    await closeDatabase();
    logger.info("Worker shutdown complete.");
    process.exit(0);
  } catch (err) {
    logger.error("Error during worker shutdown", err);
    process.exit(1);
  }
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
