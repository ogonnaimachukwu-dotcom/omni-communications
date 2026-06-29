import { and, eq, sql, desc, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import {
  conversations,
  inboxMessages,
  outboundReplies,
  distributors,
  distributorLists,
  campaigns,
  inboxConnections,
  user,
} from "@/db/schema";

export interface ConversationListItem {
  id: string;
  projectId: string;
  campaignId: string | null;
  distributorId: string | null;
  communicationProfileId: string | null;
  inboxConnectionId: string;
  assigneeId: string | null;
  status: "open" | "waiting" | "closed" | "spam" | "interested" | "meeting" | "won" | "lost";
  subject: string;
  lastMessageAt: Date;
  aiSummary: string | null;
  leadScore: number | null;
  createdAt: Date;
  updatedAt: Date;
  contactName: string | null;
  contactEmail: string | null;
  campaignSubject: string | null;
  assigneeName: string | null;
  inboxEmail: string | null;
  lastMessageText: string | null;
  unreadCount: number;
}

export async function findConversationById(id: string) {
  const [row] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return row ?? null;
}

export async function findConversationWithDetails(id: string): Promise<ConversationListItem | null> {
  const [row] = await db
    .select({
      id: conversations.id,
      projectId: conversations.projectId,
      campaignId: conversations.campaignId,
      distributorId: conversations.distributorId,
      communicationProfileId: conversations.communicationProfileId,
      inboxConnectionId: conversations.inboxConnectionId,
      assigneeId: conversations.assigneeId,
      status: conversations.status,
      subject: conversations.subject,
      lastMessageAt: conversations.lastMessageAt,
      aiSummary: conversations.aiSummary,
      leadScore: conversations.leadScore,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
      contactName: distributors.name,
      contactEmail: distributors.email,
      campaignSubject: campaigns.subject,
      assigneeName: user.name,
      inboxEmail: inboxConnections.email,
    })
    .from(conversations)
    .leftJoin(distributors, eq(conversations.distributorId, distributors.id))
    .leftJoin(campaigns, eq(conversations.campaignId, campaigns.id))
    .leftJoin(user, eq(conversations.assigneeId, user.id))
    .leftJoin(inboxConnections, eq(conversations.inboxConnectionId, inboxConnections.id))
    .where(eq(conversations.id, id))
    .limit(1);

  if (!row) return null;

  // Fetch unread count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inboxMessages)
    .where(and(eq(inboxMessages.conversationId, id), eq(inboxMessages.isRead, false)));

  // Get last message text snippet
  const [lastMsg] = await db
    .select({ bodyText: inboxMessages.bodyText })
    .from(inboxMessages)
    .where(eq(inboxMessages.conversationId, id))
    .orderBy(desc(inboxMessages.receivedAt))
    .limit(1);

  return {
    ...row,
    unreadCount: count || 0,
    lastMessageText: lastMsg?.bodyText ?? null,
  };
}

export async function listConversationsByProject(
  projectId: string,
  filters: {
    search?: string;
    status?: "open" | "waiting" | "closed" | "spam" | "interested" | "meeting" | "won" | "lost";
    assigneeId?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<ConversationListItem[]> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const conditions = [eq(conversations.projectId, projectId)];

  if (filters.status) {
    conditions.push(eq(conversations.status, filters.status));
  }
  if (filters.assigneeId) {
    if (filters.assigneeId === "unassigned") {
      conditions.push(sql`${conversations.assigneeId} IS NULL`);
    } else {
      conditions.push(eq(conversations.assigneeId, filters.assigneeId));
    }
  }
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    const searchCond = or(
      ilike(conversations.subject, pattern),
      ilike(distributors.name, pattern),
      ilike(distributors.email, pattern)
    );
    if (searchCond) {
      conditions.push(searchCond);
    }
  }

  const results = await db
    .select({
      id: conversations.id,
      projectId: conversations.projectId,
      campaignId: conversations.campaignId,
      distributorId: conversations.distributorId,
      communicationProfileId: conversations.communicationProfileId,
      inboxConnectionId: conversations.inboxConnectionId,
      assigneeId: conversations.assigneeId,
      status: conversations.status,
      subject: conversations.subject,
      lastMessageAt: conversations.lastMessageAt,
      aiSummary: conversations.aiSummary,
      leadScore: conversations.leadScore,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
      contactName: distributors.name,
      contactEmail: distributors.email,
      campaignSubject: campaigns.subject,
      assigneeName: user.name,
      inboxEmail: inboxConnections.email,
    })
    .from(conversations)
    .leftJoin(distributors, eq(conversations.distributorId, distributors.id))
    .leftJoin(campaigns, eq(conversations.campaignId, campaigns.id))
    .leftJoin(user, eq(conversations.assigneeId, user.id))
    .leftJoin(inboxConnections, eq(conversations.inboxConnectionId, inboxConnections.id))
    .where(and(...conditions))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit)
    .offset(offset);

  const fullResults: ConversationListItem[] = [];
  for (const row of results) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(inboxMessages)
      .where(and(eq(inboxMessages.conversationId, row.id), eq(inboxMessages.isRead, false)));

    const [lastMsg] = await db
      .select({ bodyText: inboxMessages.bodyText })
      .from(inboxMessages)
      .where(eq(inboxMessages.conversationId, row.id))
      .orderBy(desc(inboxMessages.receivedAt))
      .limit(1);

    fullResults.push({
      ...row,
      unreadCount: count || 0,
      lastMessageText: lastMsg?.bodyText ?? null,
    });
  }

  return fullResults;
}

export type ThreadMessage =
  | {
      id: string;
      type: "incoming";
      fromAddress: string;
      fromName: string | null;
      toAddresses: string[];
      ccAddresses: string[];
      subject: string;
      bodyHtml: string | null;
      bodyText: string | null;
      attachments: {
        filename: string;
        contentType: string;
        size: number;
        contentId?: string;
      }[];
      timestamp: Date;
      isRead: boolean;
      sentiment: "positive" | "neutral" | "negative" | "bounce";
      aiSuggestedResponse: string | null;
    }
  | {
      id: string;
      type: "outgoing";
      bodyHtml: string;
      bodyText?: string | null;
      timestamp: Date;
      sendingProviderId: string;
    };

export async function listThreadMessages(conversationId: string): Promise<ThreadMessage[]> {
  const incoming = await db
    .select({
      id: inboxMessages.id,
      fromAddress: inboxMessages.fromAddress,
      fromName: inboxMessages.fromName,
      toAddresses: inboxMessages.toAddresses,
      ccAddresses: inboxMessages.ccAddresses,
      subject: inboxMessages.subject,
      bodyHtml: inboxMessages.bodyHtml,
      bodyText: inboxMessages.bodyText,
      attachments: inboxMessages.attachments,
      timestamp: inboxMessages.receivedAt,
      isRead: inboxMessages.isRead,
      sentiment: inboxMessages.sentiment,
      aiSuggestedResponse: inboxMessages.aiSuggestedResponse,
    })
    .from(inboxMessages)
    .where(eq(inboxMessages.conversationId, conversationId));

  const outgoing = await db
    .select({
      id: outboundReplies.id,
      bodyHtml: outboundReplies.bodyHtml,
      timestamp: outboundReplies.sentAt,
      sendingProviderId: outboundReplies.sendingProviderId,
    })
    .from(outboundReplies)
    .where(eq(outboundReplies.conversationId, conversationId));

  const thread: ThreadMessage[] = [
    ...incoming.map((m) => ({
      id: m.id,
      type: "incoming" as const,
      fromAddress: m.fromAddress,
      fromName: m.fromName,
      toAddresses: (m.toAddresses as string[]) || [],
      ccAddresses: (m.ccAddresses as string[]) || [],
      subject: m.subject,
      bodyHtml: m.bodyHtml,
      bodyText: m.bodyText,
      attachments: (m.attachments as { filename: string; contentType: string; size: number; contentId?: string }[]) || [],
      timestamp: m.timestamp,
      isRead: m.isRead,
      sentiment: m.sentiment as "positive" | "neutral" | "negative" | "bounce",
      aiSuggestedResponse: m.aiSuggestedResponse,
    })),
    ...outgoing.map((m) => ({
      id: m.id,
      type: "outgoing" as const,
      bodyHtml: m.bodyHtml,
      bodyText: null,
      timestamp: m.timestamp,
      sendingProviderId: m.sendingProviderId,
    })),
  ];

  return thread.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

export async function createConversation(input: {
  projectId: string;
  inboxConnectionId: string;
  campaignId?: string | null;
  distributorId?: string | null;
  communicationProfileId?: string | null;
  subject: string;
  status?: "open" | "waiting" | "closed" | "spam" | "interested" | "meeting" | "won" | "lost";
  aiSummary?: string;
  leadScore?: number;
}) {
  const [row] = await db.insert(conversations).values(input).returning();
  return row;
}

export async function updateConversation(
  id: string,
  patch: Partial<Omit<typeof conversations.$inferSelect, "id" | "projectId" | "createdAt">>
) {
  const [row] = await db
    .update(conversations)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .returning();
  return row ?? null;
}

export async function markAllMessagesRead(conversationId: string) {
  await db
    .update(inboxMessages)
    .set({ isRead: true })
    .where(eq(inboxMessages.conversationId, conversationId));
}

// --- Contact / Lead Auto-Provisioning Helper Queries ---

export async function findContactByEmailAndProject(projectId: string, email: string) {
  const [row] = await db
    .select()
    .from(distributors)
    .where(and(eq(distributors.projectId, projectId), eq(distributors.email, email)))
    .limit(1);
  return row ?? null;
}

export async function getOrCreateSyncedRepliesList(projectId: string): Promise<string> {
  const [existing] = await db
    .select()
    .from(distributorLists)
    .where(and(eq(distributorLists.projectId, projectId), eq(distributorLists.name, "Synced Replies")))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(distributorLists)
    .values({
      projectId,
      name: "Synced Replies",
      description: "Auto-provisioned contact list for incoming inbox sync replies",
    })
    .returning();

  return created.id;
}

export async function createContact(input: {
  projectId: string;
  listId: string;
  email: string;
  name: string;
}) {
  const [row] = await db.insert(distributors).values(input).returning();
  return row;
}
