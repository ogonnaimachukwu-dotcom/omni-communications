import { and, eq, inArray, isNull, count, gt, desc, isNotNull } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db";
import { trace } from "@/lib/tracing";
import {
  distributors,
  distributorTags,
  campaignRecipients,
  campaigns,
  sendingDomains,
  signatures,
  emailEvents,
} from "@/db/schema";

export type RecipientRow = typeof campaignRecipients.$inferSelect;
export type RecipientStatus = RecipientRow["status"];

export interface AudienceMember {
  distributorId: string;
  email: string;
  name: string;
  fields: Record<string, string>;
  unsubscribeToken: string;
}

/** Resolve the subscribed, non-archived, non-deleted audience for a list. */
export async function resolveAudience(
  projectId: string,
  listId: string,
  opts: { tagId?: string; subscription?: "subscribed" | "unsubscribed" | "bounced" | "complained" } = {},
  conn: DB = defaultDb,
): Promise<AudienceMember[]> {
  const conditions = [
    eq(distributors.projectId, projectId),
    eq(distributors.listId, listId),
    isNull(distributors.deletedAt),
    isNull(distributors.archivedAt),
    eq(distributors.status, opts.subscription ?? "subscribed"),
  ];
  if (opts.tagId) {
    conditions.push(
      inArray(
        distributors.id,
        conn
          .select({ id: distributorTags.distributorId })
          .from(distributorTags)
          .where(eq(distributorTags.tagId, opts.tagId)),
      ),
    );
  }

  const rows = await conn
    .select({
      distributorId: distributors.id,
      email: distributors.email,
      name: distributors.name,
      fields: distributors.fields,
      unsubscribeToken: distributors.unsubscribeToken,
    })
    .from(distributors)
    .where(and(...conditions));

  return rows.map((r) => ({ ...r, fields: r.fields ?? {} }));
}

/** Resolve the next page of audience members using keyset pagination. */
export async function resolveAudiencePage(
  projectId: string,
  listId: string,
  opts: { 
    tagId?: string; 
    subscription?: "subscribed" | "unsubscribed" | "bounced" | "complained";
    afterId?: string | null;
    limit?: number;
  } = {},
  conn: DB = defaultDb,
): Promise<AudienceMember[]> {
  const conditions = [
    eq(distributors.projectId, projectId),
    eq(distributors.listId, listId),
    isNull(distributors.deletedAt),
    isNull(distributors.archivedAt),
    eq(distributors.status, opts.subscription ?? "subscribed"),
  ];

  if (opts.tagId) {
    conditions.push(
      inArray(
        distributors.id,
        conn
          .select({ id: distributorTags.distributorId })
          .from(distributorTags)
          .where(eq(distributorTags.tagId, opts.tagId)),
      ),
    );
  }

  if (opts.afterId) {
    conditions.push(gt(distributors.id, opts.afterId));
  }

  const query = conn
    .select({
      distributorId: distributors.id,
      email: distributors.email,
      name: distributors.name,
      fields: distributors.fields,
      unsubscribeToken: distributors.unsubscribeToken,
    })
    .from(distributors)
    .where(and(...conditions))
    .orderBy(distributors.id);

  if (opts.limit) {
    query.limit(opts.limit);
  }

  const rows = await query;
  return rows.map((r) => ({ ...r, fields: r.fields ?? {} }));
}

/** Get the largest distributor ID already enqueued for a campaign. */
export async function getLastEnqueuedDistributorId(
  campaignId: string,
  conn: DB = defaultDb,
): Promise<string | null> {
  const [row] = await conn
    .select({ distributorId: campaignRecipients.distributorId })
    .from(campaignRecipients)
    .where(
      and(
        eq(campaignRecipients.campaignId, campaignId),
        isNotNull(campaignRecipients.distributorId),
      )
    )
    .orderBy(desc(campaignRecipients.distributorId))
    .limit(1);
  return row?.distributorId ?? null;
}

export interface FreezeResult {
  queued: number;
  suppressed: number;
}

/**
 * Freeze the audience into the ledger. Idempotent via unique(campaign_id,email):
 * re-running never double-creates a recipient. Chunked for the small VPS.
 */
export async function freezeRecipients(
  campaignId: string,
  projectId: string,
  audience: AudienceMember[],
  suppressed: Set<string>,
  conn: DB = defaultDb,
): Promise<FreezeResult> {
  return trace("db.freezeRecipients", async () => {
    let queued = 0;
    let suppressedCount = 0;
    const rows = audience.map((m) => {
      const isSuppressed = suppressed.has(m.email.toLowerCase());
      if (isSuppressed) suppressedCount++;
      else queued++;
      return {
        projectId,
        campaignId,
        distributorId: m.distributorId,
        email: m.email,
        status: (isSuppressed ? "suppressed" : "queued") as RecipientStatus,
      };
    });

    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await conn
        .insert(campaignRecipients)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoNothing({ target: [campaignRecipients.campaignId, campaignRecipients.email] });
    }
    return { queued, suppressed: suppressedCount };
  });
}

export async function queuedRecipientIds(campaignId: string, conn: DB = defaultDb): Promise<string[]> {
  const rows = await conn
    .select({ id: campaignRecipients.id })
    .from(campaignRecipients)
    .where(and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.status, "queued")));
  return rows.map((r) => r.id);
}

export async function countByStatus(
  campaignId: string,
  status: RecipientStatus,
  conn: DB = defaultDb,
): Promise<number> {
  const [{ n }] = await conn
    .select({ n: count() })
    .from(campaignRecipients)
    .where(and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.status, status)));
  return n;
}

export interface SendContext {
  recipient: { id: string; campaignId: string; projectId: string; email: string; status: RecipientStatus };
  campaign: { id: string; subject: string; bodyHtml: string; mailboxId: string | null };
  distributor: { name: string; fields: Record<string, string>; unsubscribeToken: string } | null;
  from: { fromName: string; fromEmail: string; replyToEmail: string | null } | null;
  signatureHtml: string | null;
}

/** Assemble everything the per-recipient send needs, in a few small reads. */
export async function getSendContext(
  recipientId: string,
  conn: DB = defaultDb,
): Promise<SendContext | null> {
  const [recipient] = await conn
    .select()
    .from(campaignRecipients)
    .where(eq(campaignRecipients.id, recipientId))
    .limit(1);
  if (!recipient) return null;

  const [campaign] = await conn
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, recipient.campaignId))
    .limit(1);
  if (!campaign) return null;

  let distributor: SendContext["distributor"] = null;
  if (recipient.distributorId) {
    const [d] = await conn
      .select({
        name: distributors.name,
        fields: distributors.fields,
        unsubscribeToken: distributors.unsubscribeToken,
      })
      .from(distributors)
      .where(eq(distributors.id, recipient.distributorId))
      .limit(1);
    if (d) distributor = { name: d.name, fields: d.fields ?? {}, unsubscribeToken: d.unsubscribeToken };
  }

  let from: SendContext["from"] = null;
  if (campaign.sendingDomainId) {
    const [s] = await conn
      .select({
        fromName: sendingDomains.fromName,
        fromEmail: sendingDomains.fromEmail,
        replyToEmail: sendingDomains.replyToEmail,
      })
      .from(sendingDomains)
      .where(eq(sendingDomains.id, campaign.sendingDomainId))
      .limit(1);
    if (s) from = s;
  }

  let signatureHtml: string | null = null;
  if (campaign.signatureId) {
    const [sig] = await conn
      .select({ html: signatures.html })
      .from(signatures)
      .where(eq(signatures.id, campaign.signatureId))
      .limit(1);
    signatureHtml = sig?.html ?? null;
  }

  return {
    recipient: {
      id: recipient.id,
      campaignId: recipient.campaignId,
      projectId: recipient.projectId,
      email: recipient.email,
      status: recipient.status,
    },
    campaign: { id: campaign.id, subject: campaign.subject, bodyHtml: campaign.bodyHtml, mailboxId: campaign.mailboxId },
    distributor,
    from,
    signatureHtml,
  };
}

export async function markRecipient(
  id: string,
  patch: Partial<Pick<RecipientRow, "status" | "providerMessageId" | "sendingProviderId" | "error" | "sentAt" | "deliveredAt" | "failedAt">>,
  conn: DB = defaultDb,
): Promise<void> {
  await conn.update(campaignRecipients).set(patch).where(eq(campaignRecipients.id, id));
}

/* ---- Webhook-side lookups ---- */

export async function findByProviderMessageId(providerMessageId: string, conn: DB = defaultDb) {
  const [row] = await conn
    .select()
    .from(campaignRecipients)
    .where(eq(campaignRecipients.providerMessageId, providerMessageId))
    .limit(1);
  return row ?? null;
}

export async function markByProviderMessageId(
  providerMessageId: string,
  patch: Partial<Pick<RecipientRow, "status" | "deliveredAt" | "failedAt" | "error">>,
  conn: DB = defaultDb,
): Promise<void> {
  await conn
    .update(campaignRecipients)
    .set(patch)
    .where(eq(campaignRecipients.providerMessageId, providerMessageId));
}

export type EmailEventType = (typeof emailEvents.$inferSelect)["type"];

export async function recordEvent(
  input: {
    projectId?: string | null;
    recipientId?: string | null;
    campaignId?: string | null;
    communicationProfileId?: string | null;
    trackingProviderId?: string | null;
    providerMessageId?: string | null;
    type: EmailEventType;
    payload?: Record<string, unknown>;
    occurredAt?: Date;
  },
  conn: DB = defaultDb,
): Promise<void> {
  await conn.insert(emailEvents).values({
    projectId: input.projectId ?? null,
    recipientId: input.recipientId ?? null,
    campaignId: input.campaignId ?? null,
    communicationProfileId: input.communicationProfileId ?? null,
    trackingProviderId: input.trackingProviderId ?? null,
    providerMessageId: input.providerMessageId ?? null,
    type: input.type,
    payload: input.payload,
    occurredAt: input.occurredAt ?? new Date(),
  });
}
