/**
 * Generic IMAP adapter — works with any IMAP-compatible server:
 *   Roundcube, cPanel, Hostinger, Zoho, Fastmail, Rackspace, Exchange, etc.
 *
 * Uses imapflow for robust IMAP handling with automatic reconnect,
 * idle support, and incremental UID-based syncing.
 */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { AddressObject } from "mailparser";
import type { InboxAdapter, ParsedMessage, FolderInfo } from "./types";

interface ImapCredentials {
  host: string;
  port: number;
  tls: boolean;
  username: string;
  password: string;
}

function addressList(parsed: AddressObject | undefined): string[] {
  if (!parsed) return [];
  return parsed.value
    .map((a) => a.address)
    .filter((a): a is string => typeof a === "string");
}

export class ImapAdapter implements InboxAdapter {
  readonly name = "imap";
  private client: ImapFlow;

  constructor(private readonly creds: ImapCredentials) {
    this.client = new ImapFlow({
      host: creds.host,
      port: creds.port,
      secure: creds.tls,
      auth: {
        user: creds.username,
        pass: creds.password,
      },
      logger: false, // Suppress verbose imapflow logging
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.logout();
    } catch {
      // Best-effort disconnect
    }
  }

  async health(): Promise<{ status: "healthy" | "unhealthy"; details?: string }> {
    const fresh = new ImapFlow({
      host: this.creds.host,
      port: this.creds.port,
      secure: this.creds.tls,
      auth: {
        user: this.creds.username,
        pass: this.creds.password,
      },
      logger: false,
    });

    try {
      await fresh.connect();
      await fresh.logout();
      return { status: "healthy" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown IMAP error";
      return { status: "unhealthy", details: msg };
    }
  }

  async listFolders(): Promise<FolderInfo[]> {
    const tree = await this.client.listTree();
    const folders: FolderInfo[] = [];

    const walk = (node: typeof tree) => {
      if (node.path) {
        folders.push({
          name: node.path,
          delimiter: node.delimiter ?? null,
          flags: [...(node.flags ?? [])],
          specialUse: node.specialUse,
          messageCount: 0,   // mailbox STATUS fetched separately if needed
          unseenCount: 0,
        });
      }
      for (const child of (node.folders ?? [])) {
        walk(child as typeof tree);
      }
    };

    walk(tree);
    return folders;
  }

  async fetchNewMessages(
    folder: string,
    cursor: string | null,
    options?: { lookbackDays?: number; limit?: number }
  ): Promise<{ messages: ParsedMessage[]; nextCursor: string | null }> {
    const lock = await this.client.getMailboxLock(folder);
    const messages: ParsedMessage[] = [];

    try {
      const mailbox = this.client.mailbox;
      if (!mailbox || mailbox.exists === 0) {
        return { messages: [], nextCursor: cursor };
      }

      // Determine search range
      let searchCriteria: object;
      const lastUid = cursor ? parseInt(cursor, 10) : null;

      if (lastUid && !isNaN(lastUid)) {
        // Incremental: fetch UIDs greater than last seen
        searchCriteria = { uid: `${lastUid + 1}:*` };
      } else {
        // Initial: fetch last N days
        const lookbackDays = options?.lookbackDays ?? 30;
        const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
        searchCriteria = { since };
      }

      const uids = await this.client.search(searchCriteria, { uid: true });

      if (!uids || uids.length === 0) {
        return { messages: [], nextCursor: cursor };
      }

      const limit = options?.limit ?? 200;
      const uidsToFetch = uids.slice(-limit); // newest first, cap at limit

      for await (const msg of this.client.fetch(uidsToFetch, {
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
          continue; // Skip malformed messages
        }

        const fromObj = parsed.from?.value[0];
        const fromAddress = fromObj?.address ?? "";
        const fromName = fromObj?.name ?? null;

        // Collect significant headers
        const rawHeaders: Record<string, string> = {};
        if (parsed.headers) {
          for (const [key, val] of parsed.headers) {
            if (typeof val === "string") rawHeaders[key] = val;
            else if (Array.isArray(val)) rawHeaders[key] = val.join(", ");
          }
        }

        messages.push({
          uid: msg.uid ?? null,
          folder,
          messageId: parsed.messageId ?? null,
          threadId: null, // IMAP doesn't provide native threadId; derive from references chain
          inReplyTo: parsed.inReplyTo ?? null,
          references: Array.isArray(parsed.references)
            ? parsed.references.join(" ")
            : (parsed.references ?? null),
          fromAddress,
          fromName,
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

      // New cursor = highest UID seen
      const maxUid = messages
        .map((m) => m.uid)
        .filter((u): u is number => u !== null)
        .reduce((max, u) => Math.max(max, u), lastUid ?? 0);

      return {
        messages,
        nextCursor: maxUid > 0 ? String(maxUid) : cursor,
      };
    } finally {
      lock.release();
    }
  }
}
