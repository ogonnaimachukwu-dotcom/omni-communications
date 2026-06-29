/**
 * Inbox Sync Service
 *
 * Orchestrates the full inbox synchronization lifecycle for all inbox
 * connection types (IMAP, Gmail OAuth, Outlook OAuth). This service:
 *
 *  1. Resolves the inbox connection record
 *  2. Refreshes OAuth tokens if needed
 *  3. Creates the provider-agnostic InboxAdapter
 *  4. Discovers folders on first run
 *  5. Runs incremental sync (UID/historyId cursor-based)
 *  6. Persists parsed messages to inbox_messages table
 *  7. Updates the sync cursor and lastSyncedAt timestamp
 *  8. Logs health status
 *
 * Called by the worker process every 10 minutes per active inbox.
 */

import { openFromString, sealToString } from "@/lib/crypto/envelope";
import { env } from "@/env";
import * as repo from "@/core/communication/communication.repository";
import { createInboxAdapter } from "@/lib/inbox";
import type { ParsedMessage } from "@/lib/inbox/types";
import { db } from "@/db";
import { inboxMessages } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

// --- Token refresh ---

async function refreshOAuthToken(inboxId: string, credentials: Record<string, string>): Promise<string> {
  const inbox = await repo.findInboxConnectionById(inboxId);
  if (!inbox) throw new Error("Inbox not found");

  // Token still valid with 5 min buffer
  if (inbox.tokenExpiresAt && inbox.tokenExpiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return credentials.accessToken;
  }

  if (!credentials.refreshToken) {
    throw new Error("OAuth inbox has no refresh token — reconnect required");
  }

  const bodyParams: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: credentials.refreshToken,
  };

  let tokenUrl: string;
  if (inbox.type === "oauth_gmail") {
    tokenUrl = "https://oauth2.googleapis.com/token";
    bodyParams.client_id = env.GOOGLE_CLIENT_ID || "";
    bodyParams.client_secret = env.GOOGLE_CLIENT_SECRET || "";
  } else {
    tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    bodyParams.client_id = env.MICROSOFT_CLIENT_ID || "";
    bodyParams.client_secret = env.MICROSOFT_CLIENT_SECRET || "";
  }

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(bodyParams).toString(),
  });

  if (!res.ok) {
    await repo.updateInboxConnection(inboxId, { status: "invalid" });
    throw new Error(`Token refresh failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const freshToken = data.access_token as string;
  const expiresAt = new Date(Date.now() + (data.expires_in as number) * 1000);

  const updatedCredentials = {
    ...credentials,
    accessToken: freshToken,
    refreshToken: (data.refresh_token as string) || credentials.refreshToken,
  };

  await repo.updateInboxConnection(inboxId, {
    credentials: sealToString(JSON.stringify(updatedCredentials)),
    tokenExpiresAt: expiresAt,
    status: "active",
  });

  return freshToken;
}

// --- Message persistence ---

async function persistMessages(
  inboxConnectionId: string,
  projectId: string,
  folder: string,
  messages: ParsedMessage[]
): Promise<number> {
  if (messages.length === 0) return 0;
  let inserted = 0;

  for (const msg of messages) {
    // Skip if message_id already stored (idempotent)
    if (msg.messageId) {
      const [existing] = await db
        .select({ id: inboxMessages.id })
        .from(inboxMessages)
        .where(
          and(
            eq(inboxMessages.inboxConnectionId, inboxConnectionId),
            eq(inboxMessages.messageId, msg.messageId)
          )
        )
        .limit(1);
      if (existing) continue;
    }

    try {
      await db.insert(inboxMessages).values({
        inboxConnectionId,
        projectId,
        uid: msg.uid ?? undefined,
        folder: msg.folder,
        messageId: msg.messageId ?? undefined,
        threadId: msg.threadId ?? undefined,
        inReplyTo: msg.inReplyTo ?? undefined,
        references: msg.references ?? undefined,
        fromAddress: msg.fromAddress,
        fromName: msg.fromName ?? undefined,
        toAddresses: msg.toAddresses,
        ccAddresses: msg.ccAddresses,
        subject: msg.subject,
        bodyHtml: msg.bodyHtml ?? undefined,
        bodyText: msg.bodyText ?? undefined,
        attachments: msg.attachments,
        headers: msg.headers,
        receivedAt: msg.receivedAt,
        isRead: false,
        sentiment: "neutral",
      });
      inserted++;
    } catch (err) {
      // Log but don't abort the whole sync for one bad message
      logger.warn("Failed to persist inbox message", {
        messageId: msg.messageId,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return inserted;
}

// --- Main sync orchestration ---

export interface InboxSyncResult {
  inboxId: string;
  foldersDiscovered: number;
  messagesFound: number;
  messagesNew: number;
  nextCursor: string | null;
  durationMs: number;
}

export async function syncInboxConnection(inboxId: string): Promise<InboxSyncResult> {
  const startedAt = Date.now();

  const inbox = await repo.findInboxConnectionById(inboxId);
  if (!inbox) throw new Error(`Inbox connection not found: ${inboxId}`);

  if (inbox.status === "disabled") {
    throw new Error(`Inbox connection is disabled: ${inbox.email}`);
  }

  const rawCredentials = JSON.parse(openFromString(inbox.credentials)) as Record<string, string>;

  // Refresh OAuth if needed
  let credentials = rawCredentials;
  if (inbox.type === "oauth_gmail" || inbox.type === "oauth_outlook") {
    const freshToken = await refreshOAuthToken(inboxId, rawCredentials);
    credentials = { ...rawCredentials, accessToken: freshToken };
  }

  // Build adapter
  const adapter = createInboxAdapter({
    type: inbox.type,
    host: inbox.host ?? undefined,
    port: inbox.port ?? undefined,
    tls: inbox.tls ?? true,
    username: credentials.username,
    password: credentials.password,
    email: inbox.email,
    accessToken: credentials.accessToken,
  });

  await adapter.connect();

  let foldersDiscovered = 0;
  let totalFound = 0;
  let totalNew = 0;
  let nextCursor = inbox.syncCursor ?? null;

  try {
    // Discover folders on first sync or if none stored
    const storedFolders: string[] = (inbox.folders as string[] | null) ?? [];
    let activeFolders = storedFolders;

    if (storedFolders.length === 0) {
      const folderList = await adapter.listFolders();
      foldersDiscovered = folderList.length;
      // Only sync INBOX and any "[Gmail]/" folders with messages by default
      activeFolders = folderList
        .filter((f) => {
          const n = f.name.toUpperCase();
          return n === "INBOX" || n.startsWith("[GMAIL]/") || n === "INBOX/SENT";
        })
        .map((f) => f.name);

      if (activeFolders.length === 0) activeFolders = ["INBOX"];

      await repo.updateInboxConnection(inboxId, { folders: activeFolders });
    }

    // Sync each folder (cursor applies to INBOX; other folders get full 30-day lookback on first run)
    for (const folder of activeFolders) {
      const folderCursor = folder === "INBOX" ? inbox.syncCursor ?? null : null;

      const { messages, nextCursor: fc } = await adapter.fetchNewMessages(
        folder,
        folderCursor,
        { lookbackDays: 30, limit: 200 }
      );

      totalFound += messages.length;
      totalNew += await persistMessages(inboxId, inbox.projectId, folder, messages);

      // Only update the main cursor from INBOX (canonical folder)
      if (folder === "INBOX" && fc) {
        nextCursor = fc;
      }
    }

    // Update connection metadata
    await repo.updateInboxConnection(inboxId, {
      lastSyncedAt: new Date(),
      syncCursor: nextCursor ?? undefined,
      status: "active",
    });

    await repo.logHealth({
      projectId: inbox.projectId,
      providerId: inboxId,
      providerType: "inbox",
      status: "healthy",
      errorDetails: null,
    });

    logger.info("Inbox sync complete", {
      inboxId,
      email: inbox.email,
      messagesFound: totalFound,
      messagesNew: totalNew,
    });

  } finally {
    await adapter.disconnect().catch(() => {});
  }

  return {
    inboxId,
    foldersDiscovered,
    messagesFound: totalFound,
    messagesNew: totalNew,
    nextCursor,
    durationMs: Date.now() - startedAt,
  };
}

// --- Connection test ---

export async function testInboxConnection(inboxId: string): Promise<boolean> {
  try {
    const inbox = await repo.findInboxConnectionById(inboxId);
    if (!inbox) return false;

    const rawCredentials = JSON.parse(openFromString(inbox.credentials)) as Record<string, string>;
    let credentials = rawCredentials;

    if (inbox.type === "oauth_gmail" || inbox.type === "oauth_outlook") {
      try {
        const freshToken = await refreshOAuthToken(inboxId, rawCredentials);
        credentials = { ...rawCredentials, accessToken: freshToken };
      } catch {
        await repo.updateInboxConnection(inboxId, { status: "invalid" });
        return false;
      }
    }

    const adapter = createInboxAdapter({
      type: inbox.type,
      host: inbox.host ?? undefined,
      port: inbox.port ?? undefined,
      tls: inbox.tls ?? true,
      username: credentials.username,
      password: credentials.password,
      email: inbox.email,
      accessToken: credentials.accessToken,
    });

    const health = await adapter.health();
    const success = health.status === "healthy";

    await repo.updateInboxConnection(inboxId, { status: success ? "active" : "invalid" });
    await repo.logHealth({
      projectId: inbox.projectId,
      providerId: inboxId,
      providerType: "inbox",
      status: success ? "healthy" : "unhealthy",
      errorDetails: success ? null : (health.details ?? "Connection test failed"),
    });

    return success;
  } catch (err) {
    logger.error("Inbox connection test failed", { inboxId, error: err });
    try {
      await repo.updateInboxConnection(inboxId, { status: "invalid" });
    } catch {}
    return false;
  }
}

// --- Folder discovery ---

export async function discoverInboxFolders(inboxId: string): Promise<string[]> {
  const inbox = await repo.findInboxConnectionById(inboxId);
  if (!inbox) throw new Error("Inbox not found");

  const rawCredentials = JSON.parse(openFromString(inbox.credentials)) as Record<string, string>;
  let credentials = rawCredentials;

  if (inbox.type === "oauth_gmail" || inbox.type === "oauth_outlook") {
    credentials = { ...rawCredentials, accessToken: await refreshOAuthToken(inboxId, rawCredentials) };
  }

  const adapter = createInboxAdapter({
    type: inbox.type,
    host: inbox.host ?? undefined,
    port: inbox.port ?? undefined,
    tls: inbox.tls ?? true,
    username: credentials.username,
    password: credentials.password,
    email: inbox.email,
    accessToken: credentials.accessToken,
  });

  await adapter.connect();
  try {
    const folders = await adapter.listFolders();
    const names = folders.map((f) => f.name);
    await repo.updateInboxConnection(inboxId, { folders: names });
    return names;
  } finally {
    await adapter.disconnect().catch(() => {});
  }
}

// --- Message queries ---

export async function listInboxMessages(
  inboxConnectionId: string,
  limit = 50,
  folder?: string
) {
  const { db } = await import("@/db");
  const { inboxMessages: tbl } = await import("@/db/schema");
  const { desc, eq, and } = await import("drizzle-orm");

  const conditions = [eq(tbl.inboxConnectionId, inboxConnectionId)];
  if (folder) conditions.push(eq(tbl.folder, folder));

  return db
    .select()
    .from(tbl)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(desc(tbl.receivedAt))
    .limit(limit);
}

export async function getInboxMessageById(messageId: string) {
  const { db } = await import("@/db");
  const { inboxMessages: tbl } = await import("@/db/schema");

  const [row] = await db
    .select()
    .from(tbl)
    .where(eq(tbl.id, messageId))
    .limit(1);

  return row ?? null;
}

export async function markInboxMessageRead(messageId: string) {
  const { db } = await import("@/db");
  const { inboxMessages: tbl } = await import("@/db/schema");

  await db
    .update(tbl)
    .set({ isRead: true })
    .where(eq(tbl.id, messageId));
}
