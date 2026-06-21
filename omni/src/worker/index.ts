import "@/env"; // validate env at boot
import { getBoss, stopBoss } from "@/lib/queue";
import { QUEUES, type SendCampaignRecipientJob } from "@/lib/queue/jobs";

/**
 * Worker process. Boots pg-boss and registers job handlers.
 *
 * NOTE: the SEND_CAMPAIGN_RECIPIENT handler is intentionally a stub in this
 * foundation batch — the real send pipeline (render -> suppression re-check ->
 * ResendTransport -> ledger update) lands in Batch 3. The plumbing here proves
 * the worker boots, connects, and can consume the queue.
 */
async function main() {
  const boss = await getBoss();

  await boss.createQueue(QUEUES.SEND_CAMPAIGN_RECIPIENT);

  await boss.work<SendCampaignRecipientJob>(
    QUEUES.SEND_CAMPAIGN_RECIPIENT,
    async ([job]) => {
      // TODO (Batch 3): real send pipeline.
      console.log("[worker] received send job (stub):", job.data.recipientId);
    },
  );

  console.log("[worker] started; consuming:", QUEUES.SEND_CAMPAIGN_RECIPIENT);
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
