import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { env } from "@/env";
import { campaigns } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { getTransport } from "@/lib/email";
import { getBoss } from "@/lib/queue";
import { QUEUES, type SendCampaignJob, type SendCampaignRecipientJob } from "@/lib/queue/jobs";
import * as campaignRepo from "./campaign.repository";
import * as recipientRepo from "./recipient.repository";
import * as suppressions from "@/core/suppressions/suppression.service";
import { renderCampaignEmail, unsubscribeHeaders, type RecipientContext } from "./render";

const RECIPIENT_RETRY = { retryLimit: 0 } as const;

function unsubscribeUrl(token: string): string {
  return `${env.APP_URL}/unsubscribe/${token}`;
}

/**
 * Fan-out: freeze the audience into the ledger and enqueue one job per queued
 * recipient. Idempotent — the unique(campaign_id,email) index and per-recipient
 * singletonKey make re-runs safe.
 */
export async function runCampaignFanout(job: SendCampaignJob): Promise<void> {
  const { campaignId, projectId } = job;
  const campaign = await campaignRepo.findById(projectId, campaignId, { includeDeleted: true });
  if (!campaign) return;

  // Only proceed from a pre-send state; guards against cancellation/edits.
  if (campaign.status !== "approved" && campaign.status !== "scheduled") return;
  if (campaign.deletedAt) return;

  if (!campaign.listId) {
    await campaignRepo.setStatus(projectId, campaignId, { status: "failed" });
    await writeAudit({
      actorUserId: null,
      projectId,
      action: "campaign.failed",
      entityType: "campaign",
      entityId: campaignId,
      metadata: { reason: "no_list" },
    });
    return;
  }

  await campaignRepo.setStatus(projectId, campaignId, { status: "sending" });

  const [audience, suppressed] = await Promise.all([
    recipientRepo.resolveAudience(projectId, campaign.listId, {
      tagId: job.tagId,
      subscription: job.subscription,
    }),
    suppressions.suppressedEmails(projectId),
  ]);

  const result = await db.transaction((tx) =>
    recipientRepo.freezeRecipients(campaignId, projectId, audience, suppressed, tx),
  );

  await campaignRepo.setStatus(projectId, campaignId, {
    totalRecipients: result.queued + result.suppressed,
  });

  const ids = await recipientRepo.queuedRecipientIds(campaignId);

  if (ids.length === 0) {
    await markCampaignSent(projectId, campaignId);
  } else {
    const boss = await getBoss();
    for (const recipientId of ids) {
      await boss.send(
        QUEUES.SEND_CAMPAIGN_RECIPIENT,
        { recipientId, campaignId, projectId } satisfies SendCampaignRecipientJob,
        { singletonKey: recipientId, ...RECIPIENT_RETRY },
      );
    }
  }

  await writeAudit({
    actorUserId: null,
    projectId,
    action: "campaign.send_started",
    entityType: "campaign",
    entityId: campaignId,
    metadata: { queued: result.queued, suppressed: result.suppressed },
  });
}

/**
 * Per-recipient send: idempotent on recipient status, re-checks suppression,
 * renders, sends, and updates the ledger + counters. Marks the campaign sent
 * once no queued recipients remain.
 */
export async function sendRecipient(job: SendCampaignRecipientJob): Promise<void> {
  const ctx = await recipientRepo.getSendContext(job.recipientId);
  if (!ctx) return;
  if (ctx.recipient.status !== "queued") return; // already processed

  const { recipient, campaign, distributor, from, signatureHtml } = ctx;

  // Compliance: re-check suppression at send time (opt-outs since fan-out).
  if (await suppressions.isSuppressed(recipient.projectId, recipient.email)) {
    await recipientRepo.markRecipient(recipient.id, { status: "suppressed" });
    return;
  }

  if (!distributor || !from) {
    await recipientRepo.markRecipient(recipient.id, {
      status: "failed",
      error: !from ? "no_sending_domain" : "no_distributor",
      failedAt: new Date(),
    });
    await campaignRepo.bumpCounters(campaign.id, { failedCount: 1 });
    await maybeComplete(recipient.projectId, campaign.id);
    return;
  }

  const recipientCtx: RecipientContext = {
    name: distributor.name,
    email: recipient.email,
    fields: distributor.fields,
  };
  const url = unsubscribeUrl(distributor.unsubscribeToken);
  const rendered = renderCampaignEmail({
    subject: campaign.subject,
    bodyHtml: campaign.bodyHtml,
    signatureHtml,
    recipient: recipientCtx,
    unsubscribeUrl: url,
  });

  try {
    const { providerMessageId } = await getTransport().send({
      from: `${from.fromName} <${from.fromEmail}>`,
      to: recipient.email,
      replyTo: from.replyToEmail ?? undefined,
      subject: rendered.subject,
      html: rendered.html,
      headers: unsubscribeHeaders(url),
    });
    await recipientRepo.markRecipient(recipient.id, {
      status: "sent",
      providerMessageId,
      sentAt: new Date(),
    });
    await campaignRepo.bumpCounters(campaign.id, { sentCount: 1 });
  } catch (e) {
    await recipientRepo.markRecipient(recipient.id, {
      status: "failed",
      error: e instanceof Error ? e.message.slice(0, 500) : "send_failed",
      failedAt: new Date(),
    });
    await campaignRepo.bumpCounters(campaign.id, { failedCount: 1 });
  }

  await maybeComplete(recipient.projectId, campaign.id);
}

/** Flip the campaign to sent exactly once, when no queued recipients remain. */
async function maybeComplete(projectId: string, campaignId: string): Promise<void> {
  const remaining = await recipientRepo.countByStatus(campaignId, "queued");
  if (remaining > 0) return;
  await markCampaignSent(projectId, campaignId);
}

async function markCampaignSent(projectId: string, campaignId: string): Promise<void> {
  // Guarded update: only the transition out of "sending" fires the audit once.
  const [row] = await db
    .update(campaigns)
    .set({ status: "sent", sentAt: new Date() })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "sending")))
    .returning({ id: campaigns.id });
  if (row) {
    await writeAudit({
      actorUserId: null,
      projectId,
      action: "campaign.sent",
      entityType: "campaign",
      entityId: campaignId,
    });
  }
}
