import "@/env"; // validate env at boot
import { getBoss, stopBoss } from "@/lib/queue";
import { QUEUES, type SendCampaignJob, type SendCampaignRecipientJob } from "@/lib/queue/jobs";
import { handleSendCampaign } from "./handlers/send-campaign";
import { handleSendRecipient } from "./handlers/send-recipient";

/**
 * Worker process. Boots pg-boss and registers the campaign send pipeline:
 *   SEND_CAMPAIGN           -> fan-out: freeze audience, enqueue recipients
 *   SEND_CAMPAIGN_RECIPIENT -> render -> suppression re-check -> send -> ledger
 *
 * Recipient concurrency is bounded (batchSize) to stay within Resend rate
 * limits and the 2 CPU / 2 GB VPS.
 */
async function main() {
  const boss = await getBoss();

  await boss.createQueue(QUEUES.SEND_CAMPAIGN);
  await boss.createQueue(QUEUES.SEND_CAMPAIGN_RECIPIENT);

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
