import type PgBoss from "pg-boss";
import type { SendCampaignRecipientJob } from "@/lib/queue/jobs";
import { sendRecipient } from "@/core/campaigns/send.service";

export async function handleSendRecipient(job: PgBoss.Job<SendCampaignRecipientJob>): Promise<void> {
  await sendRecipient(job.data);
}
