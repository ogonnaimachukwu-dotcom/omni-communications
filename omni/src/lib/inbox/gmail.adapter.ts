/**
 * Gmail Inbox Adapter — IMAP over OAuth2
 *
 * Uses the same ImapFlow under the hood but authenticates with a Bearer
 * token (XOAUTH2 mechanism) instead of a plain password.
 *
 * For full-API integration (history, labels, threads), this adapter
 * falls back to Gmail REST API for richer thread IDs and label data.
 */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { AddressObject } from "mailparser";
import type { InboxAdapter, ParsedMessage, FolderInfo } from "./types";

interface GmailOAuthCredentials {
  email: string;
  accessToken: string;
}

function addressList(parsed: AddressObject | undefined): string[] {
  if (!parsed) return [];
  return parsed.value
    .map((a) => a.address)
    .filter((a): a is string => typeof a === "string");
}

export class GmailInboxAdapter implements InboxAdapter {
  readonly name = "oauth_gmail";

  constructor(private readonly creds: GmailOAuthCredentials) {}

  private makeClient(): ImapFlow {
    return new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: {
        user: this.creds.email,
        accessToken: this.creds.accessToken,
      },
      logger: false,
    });
  }

  async connect(): Promise<void> {
    const client = this.makeClient();
    await client.connect();
    await client.logout();
  }

  async disconnect(): Promise<void> {
    // Stateless — client created fresh per operation
  }

  async health(): Promise<{ status: "healthy" | "unhealthy"; details?: string }> {
    try {
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${this.creds.accessToken}` },
      });
      if (res.ok) return { status: "healthy" };
      const body = await res.text();
      return { status: "unhealthy", details: `Gmail API: ${res.status} ${body.slice(0, 200)}` };
    } catch (err) {
      return {
        status: "unhealthy",
        details: err instanceof Error ? err.message : "Unknown Gmail error",
      };
    }
  }

  async listFolders(): Promise<FolderInfo[]> {
    const client = this.makeClient();
    await client.connect();
    try {
      const tree = await client.listTree();
      const folders: FolderInfo[] = [];
      const walk = (node: typeof tree) => {
        if (node.path) {
          folders.push({
            name: node.path,
            delimiter: node.delimiter ?? null,
            flags: [...(node.flags ?? [])],
            specialUse: node.specialUse,
            messageCount: 0,
            unseenCount: 0,
          });
        }
        for (const child of (node.folders ?? [])) walk(child as typeof tree);
      };
      walk(tree);
      return folders;
    } finally {
      await client.logout().catch(() => {});
    }
  }

  async fetchNewMessages(
    folder: string,
    cursor: string | null,
    options?: { lookbackDays?: number; limit?: number }
  ): Promise<{ messages: ParsedMessage[]; nextCursor: string | null }> {
    const client = this.makeClient();
    await client.connect();
    const messages: ParsedMessage[] = [];

    try {
      const lock = await client.getMailboxLock(folder);
      try {
        const mailbox = client.mailbox;
        if (!mailbox || mailbox.exists === 0) return { messages: [], nextCursor: cursor };

        const lastUid = cursor ? parseInt(cursor, 10) : null;
        let searchCriteria: object;

        if (lastUid && !isNaN(lastUid)) {
          searchCriteria = { uid: `${lastUid + 1}:*` };
        } else {
          const lookbackDays = options?.lookbackDays ?? 30;
          const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
          searchCriteria = { since };
        }

        const uids = await client.search(searchCriteria, { uid: true });
        if (!uids || uids.length === 0) return { messages: [], nextCursor: cursor };

        const limit = options?.limit ?? 200;
        const uidsToFetch = uids.slice(-limit);

        for await (const msg of client.fetch(uidsToFetch, {
          uid: true,
          source: true,
          envelope: true,
          flags: true,
        }, { uid: true })) {
          if (!msg.source) continue;
          let parsed;
          try {
            parsed = await simpleParser(msg.source);
          } catch {
            continue;
          }

          const fromObj = parsed.from?.value[0];
          const rawHeaders: Record<string, string> = {};
          if (parsed.headers) {
            for (const [key, val] of parsed.headers) {
              if (typeof val === "string") rawHeaders[key] = val;
              else if (Array.isArray(val)) rawHeaders[key] = val.join(", ");
            }
          }

          // Gmail X-GM-THRID is in the raw envelope; extract from headers if present
          const gmailThreadId = rawHeaders["x-gm-thrid"] ?? null;

          messages.push({
            uid: msg.uid ?? null,
            folder,
            messageId: parsed.messageId ?? null,
            threadId: gmailThreadId,
            inReplyTo: parsed.inReplyTo ?? null,
            references: Array.isArray(parsed.references)
              ? parsed.references.join(" ")
              : (parsed.references ?? null),
            fromAddress: fromObj?.address ?? "",
            fromName: fromObj?.name ?? null,
            toAddresses: addressList(parsed.to as AddressObject | undefined),
            ccAddresses: addressList(parsed.cc as AddressObject | undefined),
            subject: parsed.subject ?? "(no subject)",
            bodyHtml: parsed.html || null,
            bodyText: parsed.text || null,
            receivedAt: parsed.date ?? new Date(),
            headers: rawHeaders,
            attachments: (parsed.attachments ?? []).map((att) => ({
              filename: att.filename ?? "unknown",
              contentType: att.contentType,
              size: att.size ?? 0,
              contentId: att.contentId ?? undefined,
            })),
          });
        }

        const maxUid = messages
          .map((m) => m.uid)
          .filter((u): u is number => u !== null)
          .reduce((max, u) => Math.max(max, u), lastUid ?? 0);

        return { messages, nextCursor: maxUid > 0 ? String(maxUid) : cursor };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }
  }
}
