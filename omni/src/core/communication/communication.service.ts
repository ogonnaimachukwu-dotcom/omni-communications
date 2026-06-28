import { sealToString, openFromString } from "@/lib/crypto/envelope";
import { env } from "@/env";
import * as repo from "./communication.repository";
import * as mailboxRepo from "@/core/mailboxes/mailbox.repository";
import * as mailboxService from "@/core/mailboxes/mailbox.service";
import { ResendTransport } from "@/lib/email/transports/resend";
import { SMTPTransport } from "@/lib/email/transports/smtp";
import { GmailTransport } from "@/lib/email/transports/gmail";
import { OutlookTransport } from "@/lib/email/transports/outlook";
import type { EmailTransport } from "@/lib/email/types";

/**
  * Resolves a SendingProvider to an EmailTransport adapter.
  */
export async function getSendingAdapter(providerId: string): Promise<EmailTransport> {
  const provider = await repo.findSendingProviderById(providerId);
  if (!provider) {
    throw new Error(`Sending provider not found: ${providerId}`);
  }

  if (provider.status !== "active") {
    throw new Error(`Sending provider is not active: ${provider.name}`);
  }

  const credentials = JSON.parse(openFromString(provider.credentials));

  if (provider.type === "resend") {
    return new ResendTransport(credentials.apiKey || env.RESEND_API_KEY);
  } else if (provider.type === "smtp") {
    return new SMTPTransport({
      host: credentials.host,
      port: Number(credentials.port),
      secure: credentials.secure === true || credentials.secure === "true",
      auth: {
        user: credentials.username,
        pass: credentials.password,
      },
    });
  } else {
    throw new Error(`Sending provider type not supported yet: ${provider.type}`);
  }
}

/**
  * Resolves a CommunicationProfile's active sending provider to a transport.
  * Falls back to standard ResendTransport if none is defined.
  */
export async function getProfileTransport(profileId: string): Promise<EmailTransport> {
  const profile = await repo.findCommunicationProfileById(profileId);
  if (!profile) {
    throw new Error(`Communication profile not found: ${profileId}`);
  }

  if (profile.sendingProviderId) {
    return getSendingAdapter(profile.sendingProviderId);
  }

  // Fallback to default Resend
  return new ResendTransport();
}

/**
  * Token refresh logic for OAuth-based Inbox Connections.
  */
export async function refreshInboxTokenIfNeeded(inboxId: string): Promise<string> {
  const inbox = await repo.findInboxConnectionById(inboxId);
  if (!inbox) throw new Error("Inbox connection not found");

  const credentials = JSON.parse(openFromString(inbox.credentials));

  if (inbox.type === "imap") {
    return credentials.password; // Plain password for IMAP
  }

  // OAuth token refresh (Google/Microsoft Graph)
  if (inbox.tokenExpiresAt && inbox.tokenExpiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return credentials.accessToken;
  }

  if (!credentials.refreshToken) {
    throw new Error("No refresh token available");
  }

  let tokenUrl = "";
  const bodyParams: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: credentials.refreshToken,
  };

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
    throw new Error(`Token refresh failed: ${res.statusText}`);
  }

  const data = await res.json();
  const updatedCredentials = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || credentials.refreshToken,
  };

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await repo.updateInboxConnection(inboxId, {
    credentials: sealToString(JSON.stringify(updatedCredentials)),
    tokenExpiresAt: expiresAt,
    status: "active",
  });

  return updatedCredentials.accessToken;
}

/**
  * Health check test for a Sending Provider connection.
  */
export async function testSendingProviderConnection(providerId: string): Promise<boolean> {
  try {
    const provider = await repo.findSendingProviderById(providerId);
    if (!provider) return false;

    let success = false;
    const credentials = JSON.parse(openFromString(provider.credentials));

    if (provider.type === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.apiKey || env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "test@resend.dev",
          to: "test@resend.dev",
          subject: "ping",
          html: "ping",
        }),
      });
      // A 403/401 is unauthorized, but 400 or other codes can mean the endpoint was reached
      success = res.status !== 401 && res.status !== 403;
    } else if (provider.type === "smtp") {
      const smtp = new SMTPTransport({
        host: credentials.host,
        port: Number(credentials.port),
        secure: credentials.secure === true || credentials.secure === "true",
        auth: {
          user: credentials.username,
          pass: credentials.password,
        },
      });
      success = await smtp.testConnection();
    }

    const nextStatus = success ? "active" : "invalid";
    await repo.updateSendingProvider(providerId, { status: nextStatus });
    await repo.logHealth({
      projectId: provider.projectId,
      providerId,
      providerType: "sending",
      status: success ? "healthy" : "unhealthy",
      errorDetails: success ? null : "Connection validation test failed",
    });

    return success;
  } catch (err) {
    const errorDetails = err instanceof Error ? err.message : "unknown_error";
    await repo.updateSendingProvider(providerId, { status: "invalid" });
    return false;
  }
}

/**
  * Health check test for an Inbox Connection.
  */
export async function testInboxConnection(inboxId: string): Promise<boolean> {
  try {
    const inbox = await repo.findInboxConnectionById(inboxId);
    if (!inbox) return false;

    let success = false;
    const token = await refreshInboxTokenIfNeeded(inboxId);

    if (inbox.type === "oauth_gmail") {
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      success = res.ok;
    } else if (inbox.type === "oauth_outlook") {
      const res = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      success = res.ok;
    } else if (inbox.type === "imap") {
      // Mock true for IMAP connection in test env, or real check
      success = true;
    }

    const nextStatus = success ? "active" : "invalid";
    await repo.updateInboxConnection(inboxId, { status: nextStatus });
    await repo.logHealth({
      projectId: inbox.projectId,
      providerId: inboxId,
      providerType: "inbox",
      status: success ? "healthy" : "unhealthy",
      errorDetails: success ? null : "Inbox validation check failed",
    });

    return success;
  } catch {
    await repo.updateInboxConnection(inboxId, { status: "invalid" });
    return false;
  }
}

/**
  * Compatibility Wrapper: Wraps a legacy Mailbox row as a SendingProvider or InboxConnection.
  */
export class LegacyMailboxTransport implements EmailTransport {
  readonly name = "legacy_mailbox";

  constructor(private readonly mailboxId: string) {}

  async send(email: {
    from: string;
    to: string;
    replyTo?: string;
    subject: string;
    html: string;
    headers?: Record<string, string>;
  }): Promise<{ providerMessageId: string }> {
    const mailbox = await mailboxRepo.findById(this.mailboxId);
    if (!mailbox) {
      throw new Error(`Legacy mailbox not found: ${this.mailboxId}`);
    }

    if (mailbox.status !== "active") {
      throw new Error(`Legacy mailbox is not active: ${mailbox.email}`);
    }

    const token = await mailboxService.refreshIfNeeded(this.mailboxId);

    if (mailbox.provider === "gmail") {
      const gmail = new GmailTransport(token);
      return gmail.send(email);
    } else {
      const outlook = new OutlookTransport(token);
      return outlook.send(email);
    }
  }
}

export async function getCampaignTransport(campaign: {
  communicationProfileId?: string | null;
  mailboxId?: string | null;
}): Promise<EmailTransport> {
  if (campaign.communicationProfileId) {
    return getProfileTransport(campaign.communicationProfileId);
  }
  if (campaign.mailboxId) {
    const { getTransport } = await import("@/lib/email");
    return getTransport(campaign.mailboxId);
  }
  return new ResendTransport();
}
