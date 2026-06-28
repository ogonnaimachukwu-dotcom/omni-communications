import { and, eq, ilike, isNull, isNotNull, desc, sql, count } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db";
import { campaigns } from "@/db/schema";
import type { CreateCampaignInput, UpdateCampaignInput, ListCampaignsQuery } from "./campaign.schema";

export type CampaignRow = typeof campaigns.$inferSelect;
export type CampaignStatus = CampaignRow["status"];

export interface PagedCampaigns {
  items: CampaignRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

function viewCondition(view: ListCampaignsQuery["view"]) {
  return view === "trash" ? isNotNull(campaigns.deletedAt) : isNull(campaigns.deletedAt);
}

export async function list(
  projectId: string,
  query: ListCampaignsQuery,
  conn: DB = defaultDb,
): Promise<PagedCampaigns> {
  const conditions = [eq(campaigns.projectId, projectId), viewCondition(query.view)];
  if (query.status) conditions.push(eq(campaigns.status, query.status));
  if (query.q) conditions.push(ilike(campaigns.subject, `%${query.q}%`));
  const where = and(...conditions);

  const [{ total }] = await conn
    .select({ total: count() })
    .from(campaigns)
    .where(where);

  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const offset = (page - 1) * query.pageSize;

  const items = await conn
    .select()
    .from(campaigns)
    .where(where)
    .orderBy(desc(campaigns.updatedAt))
    .limit(query.pageSize)
    .offset(offset);

  return { items, total, page, pageSize: query.pageSize, pageCount };
}

export async function findById(
  projectId: string,
  id: string,
  opts: { includeDeleted?: boolean } = {},
  conn: DB = defaultDb,
): Promise<CampaignRow | null> {
  const conditions = [eq(campaigns.projectId, projectId), eq(campaigns.id, id)];
  if (!opts.includeDeleted) conditions.push(isNull(campaigns.deletedAt));
  const [row] = await conn.select().from(campaigns).where(and(...conditions)).limit(1);
  return row ?? null;
}

export async function create(
  projectId: string,
  input: CreateCampaignInput,
  conn: DB = defaultDb,
): Promise<CampaignRow> {
  const [row] = await conn
    .insert(campaigns)
    .values({
      projectId,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      previewText: input.previewText ?? null,
      listId: input.listId ?? null,
      sendingDomainId: input.sendingDomainId ?? null,
      mailboxId: input.mailboxId ?? null,
      communicationProfileId: input.communicationProfileId ?? null,
      signatureId: input.signatureId ?? null,
    })
    .returning();
  return row;
}

export async function update(
  projectId: string,
  id: string,
  input: UpdateCampaignInput,
  conn: DB = defaultDb,
): Promise<CampaignRow | null> {
  const [row] = await conn
    .update(campaigns)
    .set({
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      previewText: input.previewText ?? null,
      listId: input.listId ?? null,
      sendingDomainId: input.sendingDomainId ?? null,
      mailboxId: input.mailboxId ?? null,
      communicationProfileId: input.communicationProfileId ?? null,
      signatureId: input.signatureId ?? null,
    })
    .where(and(eq(campaigns.projectId, projectId), eq(campaigns.id, id), isNull(campaigns.deletedAt)))
    .returning();
  return row ?? null;
}

export async function setStatus(
  projectId: string,
  id: string,
  patch: Partial<Pick<CampaignRow, "status" | "approvedAt" | "approvedBy" | "scheduledAt" | "sentAt" | "totalRecipients">>,
  conn: DB = defaultDb,
): Promise<CampaignRow | null> {
  const [row] = await conn
    .update(campaigns)
    .set(patch)
    .where(and(eq(campaigns.projectId, projectId), eq(campaigns.id, id)))
    .returning();
  return row ?? null;
}

export async function softDelete(projectId: string, id: string, conn: DB = defaultDb): Promise<void> {
  await conn
    .update(campaigns)
    .set({ deletedAt: new Date() })
    .where(and(eq(campaigns.projectId, projectId), eq(campaigns.id, id)));
}

export async function restore(projectId: string, id: string, conn: DB = defaultDb): Promise<void> {
  await conn
    .update(campaigns)
    .set({ deletedAt: null })
    .where(and(eq(campaigns.projectId, projectId), eq(campaigns.id, id)));
}

/** Atomically bump denormalized counters as recipient sends resolve. */
export async function bumpCounters(
  campaignId: string,
  delta: Partial<Record<"sentCount" | "deliveredCount" | "failedCount", number>>,
  conn: DB = defaultDb,
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (delta.sentCount) set.sentCount = sql`${campaigns.sentCount} + ${delta.sentCount}`;
  if (delta.deliveredCount) set.deliveredCount = sql`${campaigns.deliveredCount} + ${delta.deliveredCount}`;
  if (delta.failedCount) set.failedCount = sql`${campaigns.failedCount} + ${delta.failedCount}`;
  if (Object.keys(set).length === 0) return;
  await conn.update(campaigns).set(set).where(eq(campaigns.id, campaignId));
}
