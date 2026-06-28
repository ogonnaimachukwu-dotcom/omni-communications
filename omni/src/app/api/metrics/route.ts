import { NextResponse } from "next/server";
import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, campaignRecipients, mailboxes, auditLogs } from "@/db/schema";
import { getBoss } from "@/lib/queue";
import { QUEUES } from "@/lib/queue/jobs";
import pkg from "../../../../package.json";
import { getSanitizationFailuresCount } from "@/lib/sanitizer";
import { getRateLimitHitsCount } from "@/lib/rate-limit";
import { trace } from "@/lib/tracing";

export const dynamic = "force-dynamic";

export async function GET() {
  return trace("api.metrics", async () => {
    let dbStatus = "healthy";
    let queueStatus = "healthy";

    // System stats
    const version = pkg.version;
    const uptime = process.uptime();
    const timestamp = new Date().toISOString();

    try {
      // 1. Verify DB and retrieve metrics
      await db.execute(sql`SELECT 1`);
    } catch (err) {
      console.error("[Metrics Check] Database query failed:", err);
      dbStatus = "unhealthy";
    }

    let totalCampaigns = 0;
    let activeMailboxes = 0;
    let totalSends = 0;
    let deliveredSends = 0;
    let bouncedSends = 0;
    let failedSends = 0;
    let batchThroughput = 0;
    let failedBatches = 0;
    let activeWorkers = 0;
    let failedJobs = 0;
    let retryCounts = 0;

    if (dbStatus === "healthy") {
      try {
        const [campaignsCountResult] = await db.select({ value: count() }).from(campaigns);
        totalCampaigns = campaignsCountResult?.value || 0;

        const [activeMailboxesResult] = await db
          .select({ value: count() })
          .from(mailboxes)
          .where(eq(mailboxes.status, "active"));
        activeMailboxes = activeMailboxesResult?.value || 0;

        const [totalSendsResult] = await db.select({ value: count() }).from(campaignRecipients);
        totalSends = totalSendsResult?.value || 0;

        const [deliveredResult] = await db
          .select({ value: count() })
          .from(campaignRecipients)
          .where(eq(campaignRecipients.status, "delivered"));
        deliveredSends = deliveredResult?.value || 0;

        const [bouncedResult] = await db
          .select({ value: count() })
          .from(campaignRecipients)
          .where(eq(campaignRecipients.status, "bounced"));
        bouncedSends = bouncedResult?.value || 0;

        const [failedResult] = await db
          .select({ value: count() })
          .from(campaignRecipients)
          .where(eq(campaignRecipients.status, "failed"));
        failedSends = failedResult?.value || 0;

        const [batchCompletedResult] = await db
          .select({ value: count() })
          .from(auditLogs)
          .where(eq(auditLogs.action, "campaign.enqueue_batch_completed"));
        batchThroughput = batchCompletedResult?.value || 0;

        const [batchFailedResult] = await db
          .select({ value: count() })
          .from(auditLogs)
          .where(eq(auditLogs.action, "campaign.failed"));
        failedBatches = batchFailedResult?.value || 0;

        // Fetch pg-boss job stats directly
        const jobStats = await db.execute(sql`
          SELECT state, count(*)::int as count, sum(retry_count)::int as retries
          FROM pgboss.job
          GROUP BY state
        `);
        for (const row of jobStats.rows as Array<{ state: string; count: number; retries: number | null }>) {
          if (row.state === "active") {
            activeWorkers += row.count;
          }
          if (row.state === "failed") {
            failedJobs += row.count;
          }
          if (row.retries) {
            retryCounts += row.retries;
          }
        }
      } catch (err) {
        console.error("[Metrics Check] DB metrics retrieval failed:", err);
        dbStatus = "unhealthy";
      }
    }

    // 2. Retrieve Queue stats
    let sendCampaignQueueSize = 0;
    let sendRecipientQueueSize = 0;
    let syncMailboxQueueSize = 0;

    try {
      const boss = await getBoss();
      if (boss) {
        sendCampaignQueueSize = await boss.getQueueSize(QUEUES.SEND_CAMPAIGN);
        sendRecipientQueueSize = await boss.getQueueSize(QUEUES.SEND_CAMPAIGN_RECIPIENT);
        syncMailboxQueueSize = await boss.getQueueSize(QUEUES.SYNC_MAILBOX_INBOX);
      } else {
        queueStatus = "unhealthy";
      }
    } catch (err) {
      console.error("[Metrics Check] Queue metrics retrieval failed:", err);
      queueStatus = "unhealthy";
    }

    const statusCode = dbStatus === "healthy" && queueStatus === "healthy" ? 200 : 503;

    return NextResponse.json(
      {
        status: statusCode === 200 ? "UP" : "DEGRADED",
        version,
        uptime,
        timestamp,
        services: {
          database: dbStatus,
          queue: queueStatus,
        },
        queue: {
          sendCampaignDepth: sendCampaignQueueSize,
          sendRecipientDepth: sendRecipientQueueSize,
          syncMailboxDepth: syncMailboxQueueSize,
          totalQueueDepth: sendCampaignQueueSize + sendRecipientQueueSize + syncMailboxQueueSize,
          activeWorkers,
          failedJobs,
          retryCounts,
        },
        batches: {
          batchThroughput,
          failedBatches,
        },
        campaigns: {
          total: totalCampaigns,
        },
        mailboxes: {
          active: activeMailboxes,
        },
        delivery: {
          totalSends,
          deliveredSends,
          bouncedSends,
          failedSends,
        },
        security: {
          sanitizationFailures: getSanitizationFailuresCount(),
          rateLimitHits: getRateLimitHitsCount(),
        },
      },
      { status: statusCode }
    );
  });
}
