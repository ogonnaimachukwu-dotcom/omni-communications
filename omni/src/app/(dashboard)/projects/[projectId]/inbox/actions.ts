"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { requireProject } from "@/core/projects/project.service";
import * as repo from "@/core/reply-center/reply-center.repository";
import * as commRepo from "@/core/communication/communication.repository";
import { db } from "@/db";
import { outboundReplies } from "@/db/schema";
import { getCampaignTransport } from "@/core/communication/communication.service";

async function assertSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  return session;
}

export async function listConversationsAction(
  projectId: string,
  filters: {
    search?: string;
    status?: "open" | "waiting" | "closed" | "spam" | "interested" | "meeting" | "won" | "lost";
    assigneeId?: string;
    limit?: number;
    offset?: number;
  }
) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  return repo.listConversationsByProject(projectId, filters);
}

export async function getConversationDetailAction(projectId: string, conversationId: string) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const detail = await repo.findConversationWithDetails(conversationId);
  if (!detail || detail.projectId !== projectId) {
    throw new Error("Conversation not found");
  }

  // Mark all messages as read since user opened the conversation
  await repo.markAllMessagesRead(conversationId);

  const messages = await repo.listThreadMessages(conversationId);

  return { detail, messages };
}

export async function updateConversationStatusAction(
  projectId: string,
  conversationId: string,
  status: "open" | "waiting" | "closed" | "spam" | "interested" | "meeting" | "won" | "lost"
) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const existing = await repo.findConversationById(conversationId);
  if (!existing || existing.projectId !== projectId) {
    throw new Error("Conversation not found");
  }

  const updated = await repo.updateConversation(conversationId, { status });

  await writeAudit({
    actorUserId: session.user.id,
    projectId,
    action: "conversation.status_updated",
    entityType: "conversation",
    entityId: conversationId,
    metadata: { previousStatus: existing.status, newStatus: status },
  });

  revalidatePath(`/projects/${projectId}/inbox`);
  return updated;
}

export async function assignConversationAction(
  projectId: string,
  conversationId: string,
  assigneeId: string | null
) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const existing = await repo.findConversationById(conversationId);
  if (!existing || existing.projectId !== projectId) {
    throw new Error("Conversation not found");
  }

  const updated = await repo.updateConversation(conversationId, { assigneeId });

  await writeAudit({
    actorUserId: session.user.id,
    projectId,
    action: "conversation.assigned",
    entityType: "conversation",
    entityId: conversationId,
    metadata: { assigneeId },
  });

  revalidatePath(`/projects/${projectId}/inbox`);
  return updated;
}

export async function sendReplyAction(
  projectId: string,
  conversationId: string,
  bodyHtml: string
) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const detail = await repo.findConversationWithDetails(conversationId);
  if (!detail || detail.projectId !== projectId) {
    throw new Error("Conversation not found");
  }

  if (!detail.contactEmail) {
    throw new Error("Contact email not found for conversation");
  }

  // 1. Resolve Outbound transport
  // Route via profile transport or project default provider
  const transport = await getCampaignTransport({
    communicationProfileId: detail.communicationProfileId,
    projectId: projectId,
  });

  // Get inbox connection to determine the default fromAddress/replyTo headers
  const inbox = await commRepo.findInboxConnectionById(detail.inboxConnectionId);
  if (!inbox) {
    throw new Error("Inbox connection not configured for thread");
  }

  // Send the email
  const fromName = detail.assigneeName || session.user.name || "Agent";
  const fromString = `${fromName} <${inbox.email}>`;

  const { providerMessageId } = await transport.send({
    from: fromString,
    to: detail.contactEmail,
    replyTo: inbox.email,
    subject: `Re: ${detail.subject}`,
    html: bodyHtml,
  });

  // Get the selected sending provider ID to link outbound reply
  let sendingProviderId: string | null = (transport as { providerId?: string }).providerId || null;
  if (!sendingProviderId) {
    const defaultProv = await commRepo.findDefaultSendingProvider(projectId);
    if (defaultProv) sendingProviderId = defaultProv.id;
  }

  if (!sendingProviderId) {
    // If no provider set, locate any active sending provider
    const list = await commRepo.listSendingProvidersByProject(projectId, session.user.id);
    if (list.length > 0) sendingProviderId = list[0].id;
  }

  if (!sendingProviderId) {
    throw new Error("No sending providers configured for this project to route the reply");
  }

  // 2. Persist the reply into outboundReplies
  const [reply] = await db
    .insert(outboundReplies)
    .values({
      conversationId,
      sendingProviderId,
      bodyHtml,
    })
    .returning();

  // 3. Update status to waiting (waiting for contact's response)
  await repo.updateConversation(conversationId, {
    status: "waiting",
    lastMessageAt: new Date(),
  });

  await writeAudit({
    actorUserId: session.user.id,
    projectId,
    action: "conversation.replied",
    entityType: "conversation",
    entityId: conversationId,
    metadata: { providerMessageId },
  });

  revalidatePath(`/projects/${projectId}/inbox`);
  return reply;
}
