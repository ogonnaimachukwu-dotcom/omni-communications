import "@/env"; // validate env at boot
import { getBoss, stopBoss } from "@/lib/queue";
import { QUEUES, type SendCampaignJob, type SendCampaignRecipientJob, type SyncMailboxJob } from "@/lib/queue/jobs";
import { handleSendCampaign } from "./handlers/send-campaign";
import { handleSendRecipient } from "./handlers/send-recipient";
import { handleSyncMailbox } from "./handlers/sync-mailbox";
import * as mailboxRepo from "@/core/mailboxes/mailbox.repository";
import { logStorage, logger } from "@/lib/logger";
import { randomUUID } from "crypto";
import { closeDatabase } from "@/db";
import { trace } from "@/lib/tracing";

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
  const workerId = randomUUID();

  await boss.createQueue(QUEUES.SEND_CAMPAIGN);
  await boss.createQueue(QUEUES.SEND_CAMPAIGN_RECIPIENT);
  await boss.createQueue(QUEUES.SYNC_MAILBOX_INBOX);
  await boss.createQueue("mailbox-sync-cron");

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

  // Sync worker running with low concurrency (2) to prevent VPS RAM/CPU exhaustion
  await boss.work<SyncMailboxJob>(
    QUEUES.SYNC_MAILBOX_INBOX,
    { batchSize: 2 },
    async (jobs) => {
      for (const job of jobs) {
        const correlationId = job.data.correlationId || job.id;
        await logStorage.run(
          {
            workerId,
            jobId: job.id,
            correlationId,
            mailboxId: job.data.mailboxId,
          },
          async () => {
            await trace("worker.job.sync_mailbox", async () => {
              await handleSyncMailbox(job);
            });
          }
        );
      }
    },
  );

  // Cron coordinator: queries all active mailboxes and enqueues sync jobs
  await boss.work<{ correlationId?: string }>("mailbox-sync-cron", async (jobs) => {
    const job = jobs[0];
    const correlationId = job ? (job.data.correlationId || job.id) : randomUUID();
    await logStorage.run(
      {
        workerId,
        jobId: job?.id,
        correlationId,
      },
      async () => {
        await trace("worker.cron.mailbox_sync", async () => {
          const activeList = await mailboxRepo.listActive();
          for (const mb of activeList) {
            await boss.send(QUEUES.SYNC_MAILBOX_INBOX, { mailboxId: mb.id } satisfies SyncMailboxJob);
          }
        });
      }
    );
  });

  // Schedule cron execution every 10 minutes
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
