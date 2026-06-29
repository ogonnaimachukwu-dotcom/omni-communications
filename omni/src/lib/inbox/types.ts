/**
 * InboxAdapter — provider-agnostic interface for any inbox connection.
 *
 * Concrete implementations:
 *   ImapAdapter       — generic IMAP (Roundcube, cPanel, Hostinger, Zoho, etc.)
 *   GmailInboxAdapter — Gmail API / IMAP OAuth2
 *   OutlookInboxAdapter — Microsoft Graph / IMAP OAuth2
 *
 * The sync engine only calls methods on this interface, never touching
 * provider-specific code directly.
 */

export interface ParsedMessage {
  uid: number | null;
  folder: string;
  messageId: string | null;       // RFC 2822 Message-ID header
  threadId: string | null;        // Provider thread ID or derived chain
  inReplyTo: string | null;       // In-Reply-To header
  references: string | null;      // References header (space-separated)
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  bodyHtml: string | null;
  bodyText: string | null;
  receivedAt: Date;
  headers: Record<string, string>;
  attachments: {
    filename: string;
    contentType: string;
    size: number;
    contentId?: string;
  }[];
}

export interface FolderInfo {
  name: string;
  delimiter: string | null;
  flags: string[];
  specialUse?: string;
  messageCount: number;
  unseenCount: number;
}

export interface SyncResult {
  messagesFound: number;
  messagesNew: number;
  nextCursor: string | null;      // Opaque cursor for next incremental sync
  folders: string[];
}

export interface InboxAdapter {
  readonly name: string;

  /** Establish connection / validate credentials */
  connect(): Promise<void>;

  /** Graceful disconnect */
  disconnect(): Promise<void>;

  /** Quick health check — must not alter state */
  health(): Promise<{ status: "healthy" | "unhealthy"; details?: string }>;

  /** Discover available folders */
  listFolders(): Promise<FolderInfo[]>;

  /**
   * Incremental sync. Fetches messages newer than `cursor`.
   * If cursor is null, performs initial full sync (limited to last N days).
   * Returns new messages and an opaque cursor for the next run.
   */
  fetchNewMessages(
    folder: string,
    cursor: string | null,
    options?: { lookbackDays?: number; limit?: number }
  ): Promise<{ messages: ParsedMessage[]; nextCursor: string | null }>;
}
