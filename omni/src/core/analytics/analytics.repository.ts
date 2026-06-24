import { and, eq, gte, lte, inArray, sql, count, countDistinct, isNull } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db";
import { campaignRecipients, emailEvents, campaigns, suppressions, distributorLists } from "@/db/schema";

/** Locked: an email was "dispatched" if it reached the provider. */
export const DISPATCHED_STATUSES = ["sent", "delivered", "bounced", "complained"] as const;

export interface StatusCounts {
  queued: number;
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  failed: number;
  suppressed: number;
}

const ZERO_STATUS: StatusCounts = {
  queued: 0,
  sent: 0,
  delivered: 0,
  bounced: 0,
  complained: 0,
  failed: 0,
  suppressed: 0,
};

/** Ledger status counts for a project, or a single campaign. */
export async function statusCounts(
  projectId: string,
  opts: { campaignId?: string } = {},
  conn: DB = defaultDb,
): Promise<StatusCounts> {
  const where = opts.campaignId
    ? eq(campaignRecipients.campaignId, opts.campaignId)
    : eq(campaignRecipients.projectId, projectId);
  const rows = await conn
    .select({ status: campaignRecipients.status, n: count() })
    .from(campaignRecipients)
    .where(where)
    .groupBy(campaignRecipients.status);
  const out: StatusCounts = { ...ZERO_STATUS };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

/** Unique opens/clicks (DISTINCT recipient) for a project or campaign. */
export async function engagementCounts(
  projectId: string,
  opts: { campaignId?: string } = {},
  conn: DB = defaultDb,
): Promise<{ opened: number; clicked: number }> {
  const base = conn
    .select({ type: emailEvents.type, n: countDistinct(emailEvents.recipientId) })
    .from(emailEvents);

  const rows = opts.campaignId
    ? await base
        .innerJoin(campaignRecipients, eq(emailEvents.recipientId, campaignRecipients.id))
        .where(
          and(
            eq(campaignRecipients.campaignId, opts.campaignId),
            inArray(emailEvents.type, ["opened", "clicked"]),
          ),
        )
        .groupBy(emailEvents.type)
    : await base
        .where(and(eq(emailEvents.projectId, projectId), inArray(emailEvents.type, ["opened", "clicked"])))
        .groupBy(emailEvents.type);

  let opened = 0;
  let clicked = 0;
  for (const r of rows) {
    if (r.type === "opened") opened = r.n;
    else if (r.type === "clicked") clicked = r.n;
  }
  return { opened, clicked };
}

export async function unsubscribeCount(projectId: string, conn: DB = defaultDb): Promise<number> {
  const [row] = await conn
    .select({ n: count() })
    .from(suppressions)
    .where(and(eq(suppressions.projectId, projectId), eq(suppressions.reason, "unsubscribe")));
  return row?.n ?? 0;
}

export async function suppressionBreakdown(
  projectId: string,
  conn: DB = defaultDb,
): Promise<{ reason: string; count: number }[]> {
  const rows = await conn
    .select({ reason: suppressions.reason, n: count() })
    .from(suppressions)
    .where(eq(suppressions.projectId, projectId))
    .groupBy(suppressions.reason);
  return rows.map((r) => ({ reason: r.reason, count: r.n }));
}

/* -------------------- daily time-series (UTC) -------------------- */

const DAY = sql<string>`to_char(date_trunc('day', ${emailEvents.occurredAt}), 'YYYY-MM-DD')`;

export interface DayCount {
  day: string;
  n: number;
}

export async function sendsByDay(projectId: string, from: Date, to: Date, conn: DB = defaultDb): Promise<DayCount[]> {
  const day = sql<string>`to_char(date_trunc('day', ${campaignRecipients.sentAt}), 'YYYY-MM-DD')`;
  return conn
    .select({ day, n: count() })
    .from(campaignRecipients)
    .where(
      and(
        eq(campaignRecipients.projectId, projectId),
        inArray(campaignRecipients.status, [...DISPATCHED_STATUSES]),
        gte(campaignRecipients.sentAt, from),
        lte(campaignRecipients.sentAt, to),
      ),
    )
    .groupBy(day)
    .orderBy(day);
}

async function eventsByDay(
  projectId: string,
  type: "opened" | "clicked",
  from: Date,
  to: Date,
  conn: DB,
): Promise<DayCount[]> {
  return conn
    .select({ day: DAY, n: countDistinct(emailEvents.recipientId) })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.projectId, projectId),
        eq(emailEvents.type, type),
        gte(emailEvents.occurredAt, from),
        lte(emailEvents.occurredAt, to),
      ),
    )
    .groupBy(DAY)
    .orderBy(DAY);
}

export const opensByDay = (p: string, f: Date, t: Date, c: DB = defaultDb) => eventsByDay(p, "opened", f, t, c);
export const clicksByDay = (p: string, f: Date, t: Date, c: DB = defaultDb) => eventsByDay(p, "clicked", f, t, c);

export async function unsubscribesByDay(projectId: string, from: Date, to: Date, conn: DB = defaultDb): Promise<DayCount[]> {
  const day = sql<string>`to_char(date_trunc('day', ${suppressions.createdAt}), 'YYYY-MM-DD')`;
  return conn
    .select({ day, n: count() })
    .from(suppressions)
    .where(
      and(
        eq(suppressions.projectId, projectId),
        eq(suppressions.reason, "unsubscribe"),
        gte(suppressions.createdAt, from),
        lte(suppressions.createdAt, to),
      ),
    )
    .groupBy(day)
    .orderBy(day);
}

/* -------------------- per-campaign / per-list (for rankings) -------------------- */

export interface CampaignLedgerRow {
  campaignId: string;
  status: string;
  n: number;
}
export interface CampaignEngagementRow {
  campaignId: string;
  type: string;
  n: number;
}

export async function ledgerByCampaign(projectId: string, conn: DB = defaultDb): Promise<CampaignLedgerRow[]> {
  return conn
    .select({ campaignId: campaignRecipients.campaignId, status: campaignRecipients.status, n: count() })
    .from(campaignRecipients)
    .where(eq(campaignRecipients.projectId, projectId))
    .groupBy(campaignRecipients.campaignId, campaignRecipients.status);
}

export async function engagementByCampaign(projectId: string, conn: DB = defaultDb): Promise<CampaignEngagementRow[]> {
  return conn
    .select({
      campaignId: campaignRecipients.campaignId,
      type: emailEvents.type,
      n: countDistinct(emailEvents.recipientId),
    })
    .from(emailEvents)
    .innerJoin(campaignRecipients, eq(emailEvents.recipientId, campaignRecipients.id))
    .where(and(eq(emailEvents.projectId, projectId), inArray(emailEvents.type, ["opened", "clicked"])))
    .groupBy(campaignRecipients.campaignId, emailEvents.type);
}

export interface SentCampaignMeta {
  id: string;
  subject: string;
  status: string;
  listId: string | null;
}

export async function sentCampaigns(projectId: string, conn: DB = defaultDb): Promise<SentCampaignMeta[]> {
  return conn
    .select({ id: campaigns.id, subject: campaigns.subject, status: campaigns.status, listId: campaigns.listId })
    .from(campaigns)
    .where(and(eq(campaigns.projectId, projectId), eq(campaigns.status, "sent"), isNull(campaigns.deletedAt)));
}

export async function listNames(projectId: string, conn: DB = defaultDb): Promise<Map<string, string>> {
  const rows = await conn
    .select({ id: distributorLists.id, name: distributorLists.name })
    .from(distributorLists)
    .where(eq(distributorLists.projectId, projectId));
  return new Map(rows.map((r) => [r.id, r.name]));
}
