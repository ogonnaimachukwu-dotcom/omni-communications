"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { requireProject } from "@/core/projects/project.service";
import * as repo from "@/core/communication/communication.repository";
import * as service from "@/core/communication/communication.service";
import { sealToString } from "@/lib/crypto/envelope";

async function assertSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  return session;
}

// --- Sending Providers ---
export async function createSendingProviderAction(
  projectId: string,
  name: string,
  type: "resend" | "smtp" | "ses" | "mailgun" | "postmark",
  config: Record<string, unknown>
) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const sealed = sealToString(JSON.stringify(config));
  const provider = await repo.createSendingProvider({
    projectId,
    name,
    type,
    credentials: sealed,
  });

  await writeAudit({
    actorUserId: session.user.id,
    projectId,
    action: "sending_provider.created",
    entityType: "sending_provider",
    entityId: provider.id,
    metadata: { name, type },
  });

  revalidatePath(`/projects/${projectId}/communication`);
  return provider;
}

export async function removeSendingProviderAction(projectId: string, id: string) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const existing = await repo.findSendingProviderById(id);
  if (!existing || existing.projectId !== projectId) {
    throw new Error("Sending provider not found");
  }

  await repo.removeSendingProvider(id);

  await writeAudit({
    actorUserId: session.user.id,
    projectId,
    action: "sending_provider.deleted",
    entityType: "sending_provider",
    entityId: id,
    metadata: { name: existing.name },
  });

  revalidatePath(`/projects/${projectId}/communication`);
}

export async function testSendingProviderAction(projectId: string, id: string) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const success = await service.testSendingProviderConnection(id);

  revalidatePath(`/projects/${projectId}/communication`);
  return success;
}

export async function updateSendingProviderAction(
  projectId: string,
  id: string,
  name: string,
  config: Record<string, unknown>
) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const existing = await repo.findSendingProviderById(id);
  if (!existing || existing.projectId !== projectId) {
    throw new Error("Sending provider not found");
  }

  const sealed = sealToString(JSON.stringify(config));
  const provider = await repo.updateSendingProvider(id, {
    name,
    credentials: sealed,
  });

  await writeAudit({
    actorUserId: session.user.id,
    projectId,
    action: "sending_provider.updated",
    entityType: "sending_provider",
    entityId: id,
    metadata: { name },
  });

  revalidatePath(`/projects/${projectId}/communication`);
  return provider;
}

export async function setDefaultSendingProviderAction(projectId: string, id: string) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const existing = await repo.findSendingProviderById(id);
  if (!existing || existing.projectId !== projectId) {
    throw new Error("Sending provider not found");
  }

  await repo.setDefaultSendingProvider(projectId, id);

  await writeAudit({
    actorUserId: session.user.id,
    projectId,
    action: "sending_provider.default_set",
    entityType: "sending_provider",
    entityId: id,
    metadata: { name: existing.name },
  });

  revalidatePath(`/projects/${projectId}/communication`);
}

export async function getProviderStatisticsAction(projectId: string) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  return repo.getProviderStatistics(projectId);
}

// --- Inbox Connections ---
export async function createInboxConnectionAction(
  projectId: string,
  email: string,
  type: "imap" | "oauth_gmail" | "oauth_outlook",
  config: Record<string, unknown>
) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const sealed = sealToString(JSON.stringify(config));
  const conn = await repo.createInboxConnection({
    projectId,
    email,
    type,
    credentials: sealed,
  });

  await writeAudit({
    actorUserId: session.user.id,
    projectId,
    action: "inbox_connection.created",
    entityType: "inbox_connection",
    entityId: conn.id,
    metadata: { email, type },
  });

  revalidatePath(`/projects/${projectId}/communication`);
  return conn;
}

export async function removeInboxConnectionAction(projectId: string, id: string) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const existing = await repo.findInboxConnectionById(id);
  if (!existing || existing.projectId !== projectId) {
    throw new Error("Inbox connection not found");
  }

  await repo.removeInboxConnection(id);

  await writeAudit({
    actorUserId: session.user.id,
    projectId,
    action: "inbox_connection.deleted",
    entityType: "inbox_connection",
    entityId: id,
    metadata: { email: existing.email },
  });

  revalidatePath(`/projects/${projectId}/communication`);
}

export async function testInboxConnectionAction(projectId: string, id: string) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const success = await service.testInboxConnection(id);

  revalidatePath(`/projects/${projectId}/communication`);
  return success;
}

// --- Tracking Providers ---
export async function createTrackingProviderAction(
  projectId: string,
  name: string,
  type: "resend_webhook" | "postmark_webhook" | "ses_sns",
  config: Record<string, unknown>
) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const sealed = sealToString(JSON.stringify(config));
  const provider = await repo.createTrackingProvider({
    projectId,
    name,
    type,
    config: sealed,
  });

  await writeAudit({
    actorUserId: session.user.id,
    projectId,
    action: "tracking_provider.created",
    entityType: "tracking_provider",
    entityId: provider.id,
    metadata: { name, type },
  });

  revalidatePath(`/projects/${projectId}/communication`);
  return provider;
}

export async function removeTrackingProviderAction(projectId: string, id: string) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const existing = await repo.findTrackingProviderById(id);
  if (!existing || existing.projectId !== projectId) {
    throw new Error("Tracking provider not found");
  }

  await repo.removeTrackingProvider(id);

  await writeAudit({
    actorUserId: session.user.id,
    projectId,
    action: "tracking_provider.deleted",
    entityType: "tracking_provider",
    entityId: id,
    metadata: { name: existing.name },
  });

  revalidatePath(`/projects/${projectId}/communication`);
}

// --- Communication Profiles ---
export async function createCommunicationProfileAction(
  projectId: string,
  name: string,
  sendingProviderId: string | null,
  inboxConnectionId: string | null,
  trackingProviderId: string | null,
  signatureId: string | null,
  dailyLimit: number,
  replyAlias: string,
  timezone: string
) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const profile = await repo.createCommunicationProfile({
    projectId,
    name,
    sendingProviderId,
    inboxConnectionId,
    trackingProviderId,
    signatureId,
    dailyLimit,
    replyAlias,
    timezone,
  });

  await writeAudit({
    actorUserId: session.user.id,
    projectId,
    action: "communication_profile.created",
    entityType: "communication_profile",
    entityId: profile.id,
    metadata: { name },
  });

  revalidatePath(`/projects/${projectId}/communication`);
  return profile;
}

export async function updateCommunicationProfileAction(
  projectId: string,
  id: string,
  patch: {
    name?: string;
    sendingProviderId?: string | null;
    inboxConnectionId?: string | null;
    trackingProviderId?: string | null;
    signatureId?: string | null;
    dailyLimit?: number;
    replyAlias?: string;
    timezone?: string;
  }
) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const existing = await repo.findCommunicationProfileById(id);
  if (!existing || existing.projectId !== projectId) {
    throw new Error("Communication profile not found");
  }

  const profile = await repo.updateCommunicationProfile(id, patch);

  await writeAudit({
    actorUserId: session.user.id,
    projectId,
    action: "communication_profile.updated",
    entityType: "communication_profile",
    entityId: id,
    metadata: { name: patch.name || existing.name },
  });

  revalidatePath(`/projects/${projectId}/communication`);
  return profile;
}

export async function removeCommunicationProfileAction(projectId: string, id: string) {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const existing = await repo.findCommunicationProfileById(id);
  if (!existing || existing.projectId !== projectId) {
    throw new Error("Communication profile not found");
  }

  await repo.removeCommunicationProfile(id);

  await writeAudit({
    actorUserId: session.user.id,
    projectId,
    action: "communication_profile.deleted",
    entityType: "communication_profile",
    entityId: id,
    metadata: { name: existing.name },
  });

  revalidatePath(`/projects/${projectId}/communication`);
}
