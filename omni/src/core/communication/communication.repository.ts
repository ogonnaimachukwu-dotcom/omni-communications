import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  sendingProviders,
  inboxConnections,
  trackingProviders,
  communicationProfiles,
  inboxMessages,
  outboundReplies,
  providerHealthLogs,
  projectMembers,
} from "@/db/schema";
import type {
  CreateSendingProviderInput,
  CreateInboxConnectionInput,
  CreateTrackingProviderInput,
  CreateCommunicationProfileInput,
} from "./communication.schema";

// --- Sending Providers ---
export async function findSendingProviderById(id: string) {
  const [row] = await db.select().from(sendingProviders).where(eq(sendingProviders.id, id)).limit(1);
  return row ?? null;
}

export async function listSendingProvidersByProject(projectId: string, userId: string) {
  return db
    .select({
      id: sendingProviders.id,
      projectId: sendingProviders.projectId,
      name: sendingProviders.name,
      type: sendingProviders.type,
      status: sendingProviders.status,
      credentials: sendingProviders.credentials,
      createdAt: sendingProviders.createdAt,
      updatedAt: sendingProviders.updatedAt,
    })
    .from(sendingProviders)
    .innerJoin(projectMembers, eq(sendingProviders.projectId, projectMembers.projectId))
    .where(and(eq(sendingProviders.projectId, projectId), eq(projectMembers.userId, userId)));
}

export async function createSendingProvider(input: CreateSendingProviderInput) {
  const [row] = await db.insert(sendingProviders).values(input).returning();
  return row;
}

export async function updateSendingProvider(id: string, patch: Partial<Omit<typeof sendingProviders.$inferSelect, "id" | "projectId" | "createdAt">>) {
  const [row] = await db
    .update(sendingProviders)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(sendingProviders.id, id))
    .returning();
  return row ?? null;
}

export async function removeSendingProvider(id: string) {
  const [row] = await db.delete(sendingProviders).where(eq(sendingProviders.id, id)).returning();
  return row ?? null;
}

// --- Inbox Connections ---
export async function findInboxConnectionById(id: string) {
  const [row] = await db.select().from(inboxConnections).where(eq(inboxConnections.id, id)).limit(1);
  return row ?? null;
}

export async function findInboxConnectionByEmail(projectId: string, email: string) {
  const [row] = await db
    .select()
    .from(inboxConnections)
    .where(and(eq(inboxConnections.projectId, projectId), eq(inboxConnections.email, email)))
    .limit(1);
  return row ?? null;
}

export async function listInboxConnectionsByProject(projectId: string, userId: string) {
  return db
    .select({
      id: inboxConnections.id,
      projectId: inboxConnections.projectId,
      email: inboxConnections.email,
      type: inboxConnections.type,
      status: inboxConnections.status,
      credentials: inboxConnections.credentials,
      tokenExpiresAt: inboxConnections.tokenExpiresAt,
      lastSyncedAt: inboxConnections.lastSyncedAt,
      syncCursor: inboxConnections.syncCursor,
      createdAt: inboxConnections.createdAt,
      updatedAt: inboxConnections.updatedAt,
    })
    .from(inboxConnections)
    .innerJoin(projectMembers, eq(inboxConnections.projectId, projectMembers.projectId))
    .where(and(eq(inboxConnections.projectId, projectId), eq(projectMembers.userId, userId)));
}

export async function listActiveInboxConnections() {
  return db.select().from(inboxConnections).where(eq(inboxConnections.status, "active"));
}

export async function createInboxConnection(input: CreateInboxConnectionInput) {
  const [row] = await db.insert(inboxConnections).values(input).returning();
  return row;
}

export async function updateInboxConnection(id: string, patch: Partial<Omit<typeof inboxConnections.$inferSelect, "id" | "projectId" | "createdAt">>) {
  const [row] = await db
    .update(inboxConnections)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(inboxConnections.id, id))
    .returning();
  return row ?? null;
}

export async function removeInboxConnection(id: string) {
  const [row] = await db.delete(inboxConnections).where(eq(inboxConnections.id, id)).returning();
  return row ?? null;
}

// --- Tracking Providers ---
export async function findTrackingProviderById(id: string) {
  const [row] = await db.select().from(trackingProviders).where(eq(trackingProviders.id, id)).limit(1);
  return row ?? null;
}

export async function listTrackingProvidersByProject(projectId: string, userId: string) {
  return db
    .select({
      id: trackingProviders.id,
      projectId: trackingProviders.projectId,
      name: trackingProviders.name,
      type: trackingProviders.type,
      status: trackingProviders.status,
      config: trackingProviders.config,
      createdAt: trackingProviders.createdAt,
      updatedAt: trackingProviders.updatedAt,
    })
    .from(trackingProviders)
    .innerJoin(projectMembers, eq(trackingProviders.projectId, projectMembers.projectId))
    .where(and(eq(trackingProviders.projectId, projectId), eq(projectMembers.userId, userId)));
}

export async function createTrackingProvider(input: CreateTrackingProviderInput) {
  const [row] = await db.insert(trackingProviders).values(input).returning();
  return row;
}

export async function updateTrackingProvider(id: string, patch: Partial<Omit<typeof trackingProviders.$inferSelect, "id" | "projectId" | "createdAt">>) {
  const [row] = await db
    .update(trackingProviders)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(trackingProviders.id, id))
    .returning();
  return row ?? null;
}

export async function removeTrackingProvider(id: string) {
  const [row] = await db.delete(trackingProviders).where(eq(trackingProviders.id, id)).returning();
  return row ?? null;
}

// --- Communication Profiles ---
export async function findCommunicationProfileById(id: string) {
  const [row] = await db.select().from(communicationProfiles).where(eq(communicationProfiles.id, id)).limit(1);
  return row ?? null;
}

export async function listCommunicationProfilesByProject(projectId: string, userId: string) {
  return db
    .select({
      id: communicationProfiles.id,
      projectId: communicationProfiles.projectId,
      name: communicationProfiles.name,
      sendingProviderId: communicationProfiles.sendingProviderId,
      inboxConnectionId: communicationProfiles.inboxConnectionId,
      trackingProviderId: communicationProfiles.trackingProviderId,
      signatureId: communicationProfiles.signatureId,
      dailyLimit: communicationProfiles.dailyLimit,
      replyAlias: communicationProfiles.replyAlias,
      timezone: communicationProfiles.timezone,
      createdAt: communicationProfiles.createdAt,
      updatedAt: communicationProfiles.updatedAt,
    })
    .from(communicationProfiles)
    .innerJoin(projectMembers, eq(communicationProfiles.projectId, projectMembers.projectId))
    .where(and(eq(communicationProfiles.projectId, projectId), eq(projectMembers.userId, userId)));
}

export async function createCommunicationProfile(input: CreateCommunicationProfileInput) {
  const [row] = await db.insert(communicationProfiles).values(input).returning();
  return row;
}

export async function updateCommunicationProfile(id: string, patch: Partial<Omit<typeof communicationProfiles.$inferSelect, "id" | "projectId" | "createdAt">>) {
  const [row] = await db
    .update(communicationProfiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(communicationProfiles.id, id))
    .returning();
  return row ?? null;
}

export async function removeCommunicationProfile(id: string) {
  const [row] = await db.delete(communicationProfiles).where(eq(communicationProfiles.id, id)).returning();
  return row ?? null;
}

// --- Reply Center (Inbox Messages) ---
export async function createInboxMessage(input: typeof inboxMessages.$inferInsert) {
  const [row] = await db.insert(inboxMessages).values(input).returning();
  return row;
}

export async function listInboxMessagesByProject(projectId: string, userId: string) {
  return db
    .select()
    .from(inboxMessages)
    .innerJoin(projectMembers, eq(inboxMessages.projectId, projectMembers.projectId))
    .where(and(eq(inboxMessages.projectId, projectId), eq(projectMembers.userId, userId)));
}

export async function updateInboxMessage(id: string, patch: Partial<typeof inboxMessages.$inferSelect>) {
  const [row] = await db.update(inboxMessages).set(patch).where(eq(inboxMessages.id, id)).returning();
  return row ?? null;
}

// --- Health Logs ---
export async function logHealth(input: typeof providerHealthLogs.$inferInsert) {
  const [row] = await db.insert(providerHealthLogs).values(input).returning();
  return row;
}

export async function listHealthLogsByProject(projectId: string) {
  return db.select().from(providerHealthLogs).where(eq(providerHealthLogs.projectId, projectId));
}
