import type PgBoss from "pg-boss";
import type { SendCampaignJob } from "@/lib/queue/jobs";
import { runCampaignFanout } from "@/core/campaigns/send.service";

export async function handleSendCampaign(job: PgBoss.Job<SendCampaignJob>): Promise<void> {
  await runCampaignFanout(job.data);
}
