/**
 * Inbox Adapter Factory
 *
 * Given a decrypted InboxConnection row (or credentials object), resolves
 * the correct concrete InboxAdapter. This is the single place the sync engine
 * touches to get an adapter — all callers are provider-agnostic.
 */

import { ImapAdapter } from "./imap.adapter";
import { GmailInboxAdapter } from "./gmail.adapter";
import { OutlookInboxAdapter } from "./outlook.adapter";
import type { InboxAdapter } from "./types";

export interface InboxConnectionCredentials {
  type: "imap" | "oauth_gmail" | "oauth_outlook";
  // IMAP fields
  host?: string;
  port?: number;
  tls?: boolean;
  username?: string;
  password?: string;
  // OAuth fields
  email?: string;
  accessToken?: string;
}

export function createInboxAdapter(creds: InboxConnectionCredentials): InboxAdapter {
  switch (creds.type) {
    case "imap": {
      if (!creds.host || !creds.username || !creds.password) {
        throw new Error("IMAP adapter requires host, username, and password");
      }
      return new ImapAdapter({
        host: creds.host,
        port: creds.port ?? 993,
        tls: creds.tls ?? true,
        username: creds.username,
        password: creds.password,
      });
    }

    case "oauth_gmail": {
      if (!creds.email || !creds.accessToken) {
        throw new Error("Gmail adapter requires email and accessToken");
      }
      return new GmailInboxAdapter({
        email: creds.email,
        accessToken: creds.accessToken,
      });
    }

    case "oauth_outlook": {
      if (!creds.email || !creds.accessToken) {
        throw new Error("Outlook adapter requires email and accessToken");
      }
      return new OutlookInboxAdapter({
        email: creds.email,
        accessToken: creds.accessToken,
      });
    }

    default: {
      const _exhaustive: never = creds.type;
      throw new Error(`Unknown inbox connection type: ${_exhaustive}`);
    }
  }
}

export { ImapAdapter, GmailInboxAdapter, OutlookInboxAdapter };
export type { InboxAdapter } from "./types";
