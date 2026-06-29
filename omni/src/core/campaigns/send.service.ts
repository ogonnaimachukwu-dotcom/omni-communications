import { and, eq, inArray, count } from "drizzle-orm";
import { db } from "@/db";
import { env } from "@/env";
import { campaigns, projectMembers, campaignRecipients } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { getCampaignTransport } from "@/core/communication/communication.service";
import { getBoss } from "@/lib/queue";
import { QUEUES, type SendCampaignJob, type SendCampaignRecipientJob } from "@/lib/queue/jobs";
import * as campaignRepo from "./campaign.repository";
import * as recipientRepo from "./recipient.repository";
import * as suppressions from "@/core/suppressions/suppression.service";
import * as projectRepo from "@/core/projects/project.repository";
import * as mailboxRepo from "@/core/mailboxes/mailbox.repository";
import { renderCampaignEmail, unsubscribeHeaders, type RecipientContext } from "./render";

const RECIPIENT_RETRY = { retryLimit: 0 } as const;

function unsubscribeUrl(token: string): string {
  return `${env.APP_URL}/unsubscribe/${token}`;
}

/**
 * Fan-out: resolve+freeze the audience and enqueue jobs in pages of e.g. 1000.
 * Idempotent, memory-efficient, and crash-resilient via keyset pagination cursor.
 */
export async function runCampaignFanout(job: SendCampaignJob): Promise<void> {
  const { campaignId, projectId } = job;
  const campaign = await campaignRepo.findById(projectId, campaignId, { includeDeleted: true });
  if (!campaign) return;

  // Only proceed from a pre-send / sending state; guards against invalid status
  if (
    campaign.status !== "approved" &&
    campaign.status !== "scheduled" &&
    campaign.status !== "sending"
  ) {
    return;
  }
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

  // Configurable batch size
  const LIMIT = Number(process.env.CAMPAIGN_BATCH_SIZE) || 1000;

  // Keyset cursor resolution
  const lastId = await recipientRepo.getLastEnqueuedDistributorId(campaignId);

  // Fetch the next page of audience members
  const batch = await recipientRepo.resolveAudiencePage(projectId, campaign.listId, {
    tagId: job.tagId,
    subscription: job.subscription,
    afterId: lastId,
    limit: LIMIT,
  });

  if (batch.length === 0) {
    // Transition status to sending if it was not already
    if (campaign.status === "approved" || campaign.status === "scheduled") {
      await campaignRepo.setStatus(projectId, campaignId, { status: "sending" });
    }
    // Check if campaign is completely sent
    await maybeComplete(projectId, campaignId);
    return;
  }

  // Double check campaign wasn't paused or deleted during processing
  const currentCampaign = await campaignRepo.findById(projectId, campaignId, { includeDeleted: true });
  if (
    !currentCampaign ||
    currentCampaign.status === "paused" ||
    currentCampaign.status === "failed" ||
    currentCampaign.deletedAt
  ) {
    return;
  }

  // Set status to sending if it's the first run
  if (campaign.status === "approved" || campaign.status === "scheduled") {
    await campaignRepo.setStatus(projectId, campaignId, { status: "sending" });
  }

  // Fetch suppressions only for the email addresses in the current batch
  const batchEmails = batch.map((d) => d.email);
  const suppressed = await suppressions.suppressedEmailsInBatch(projectId, batchEmails);

  // Freeze this batch of recipients
  const result = await db.transaction((tx) =>
    recipientRepo.freezeRecipients(campaignId, projectId, batch, suppressed, tx),
  );

  // Update totalRecipients to match rows currently stored
  const [countRow] = await db
    .select({ value: count() })
    .from(campaignRecipients)
    .where(eq(campaignRecipients.campaignId, campaignId));
  const totalRecipients = countRow?.value || 0;
  await campaignRepo.setStatus(projectId, campaignId, { totalRecipients });

  // Get recipient row IDs that were queued in this specific batch
  const distributorIds = batch.map((d) => d.distributorId);
  const queuedRecipients = await db
    .select({ id: campaignRecipients.id })
    .from(campaignRecipients)
    .where(
      and(
        eq(campaignRecipients.campaignId, campaignId),
        eq(campaignRecipients.status, "queued"),
        inArray(campaignRecipients.distributorId, distributorIds),
      ),
    );
  const ids = queuedRecipients.map((r) => r.id);

  const boss = await getBoss();

  // Enqueue sending jobs in pg-boss
  for (const recipientId of ids) {
    await boss.send(
      QUEUES.SEND_CAMPAIGN_RECIPIENT,
      { recipientId, campaignId, projectId } satisfies SendCampaignRecipientJob,
      { singletonKey: recipientId, ...RECIPIENT_RETRY },
    );
  }

  // Re-enqueue the next page enqueuing run if we hit the batch limit
  if (batch.length === LIMIT) {
    await boss.send(QUEUES.SEND_CAMPAIGN, job, { singletonKey: campaignId });

    await writeAudit({
      actorUserId: null,
      projectId,
      action: "campaign.enqueue_batch_completed",
      entityType: "campaign",
      entityId: campaignId,
      metadata: { enqueued: result.queued, suppressed: result.suppressed, cursor: lastId },
    });
  } else {
    // Completed send pipeline requests
    await writeAudit({
      actorUserId: null,
      projectId,
      action: "campaign.send_started",
      entityType: "campaign",
      entityId: campaignId,
      metadata: { totalEnqueued: totalRecipients },
    });
  }
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
    await maybeComplete(recipient.projectId, campaign.id);
    return;
  }

  const isMailboxSend = !!campaign.mailboxId;

  if (!distributor || (!isMailboxSend && !from)) {
    await recipientRepo.markRecipient(recipient.id, {
      status: "failed",
      error: !distributor ? "no_distributor" : "no_sending_domain",
      failedAt: new Date(),
    });
    await campaignRepo.bumpCounters(campaign.id, { failedCount: 1 });
    await maybeComplete(recipient.projectId, campaign.id);
    return;
  }

  let fromString = "";
  let replyToEmail: string | undefined = undefined;

  if (isMailboxSend) {
    const mailbox = await mailboxRepo.findById(campaign.mailboxId!);
    if (!mailbox) {
      await recipientRepo.markRecipient(recipient.id, {
        status: "failed",
        error: "mailbox_not_found",
        failedAt: new Date(),
      });
      await campaignRepo.bumpCounters(campaign.id, { failedCount: 1 });
      await maybeComplete(recipient.projectId, campaign.id);
      return;
    }
    const member = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(eq(projectMembers.projectId, recipient.projectId))
      .limit(1)
      .then((rows) => rows[0]);
    const project = member
      ? await projectRepo.findAccessibleProject(recipient.projectId, member.userId)
      : null;
    const fromName = project?.ceoName || project?.name || "";
    fromString = fromName ? `${fromName} <${mailbox.email}>` : mailbox.email;
  } else {
    fromString = `${from!.fromName} <${from!.fromEmail}>`;
    replyToEmail = from!.replyToEmail ?? undefined;
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

  let transport: import("@/lib/email/types").EmailTransport | undefined;
  try {
    transport = await getCampaignTransport(campaign);
    const { providerMessageId } = await transport.send({
      from: fromString,
      to: recipient.email,
      replyTo: replyToEmail,
      subject: rendered.subject,
      html: rendered.html,
      headers: unsubscribeHeaders(url),
    });
    await recipientRepo.markRecipient(recipient.id, {
      status: "sent",
      providerMessageId,
      sendingProviderId: transport.providerId ?? null,
      sentAt: new Date(),
    });
    await campaignRepo.bumpCounters(campaign.id, { sentCount: 1 });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "send_failed";

    if (errorMsg === "RATE_LIMIT_EXCEEDED") {
      const boss = await getBoss();
      await boss.send(
        QUEUES.SEND_CAMPAIGN_RECIPIENT,
        { recipientId: recipient.id, campaignId: campaign.id, projectId: recipient.projectId } satisfies SendCampaignRecipientJob,
        { startAfter: 120, singletonKey: recipient.id }
      );
      return;
    }

    await recipientRepo.markRecipient(recipient.id, {
      status: "failed",
      sendingProviderId: transport?.providerId ?? null,
      error: errorMsg.slice(0, 500),
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
