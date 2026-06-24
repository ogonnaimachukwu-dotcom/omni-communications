import { sealToString, openFromString } from "@/lib/crypto/envelope";
import { env } from "@/env";
import * as repo from "./mailbox.repository";
import * as recipientRepo from "@/core/campaigns/recipient.repository";
import * as campaignRepo from "@/core/campaigns/campaign.repository";
import * as suppressions from "@/core/suppressions/suppression.service";

export type MailboxRow = repo.MailboxRow;

export async function refreshIfNeeded(mailboxId: string): Promise<string> {
  const mailbox = await repo.findById(mailboxId);
  if (!mailbox) throw new Error("Mailbox not found");

  const credentials = JSON.parse(openFromString(mailbox.credentials));
  
  // If token is still valid for more than 5 minutes, return it directly
  if (mailbox.tokenExpiresAt && mailbox.tokenExpiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
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

  if (mailbox.provider === "gmail") {
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
    await repo.update(mailboxId, { status: "invalid" });
    throw new Error(`Token refresh failed: ${res.statusText}`);
  }

  const data = await res.json();
  const updatedCredentials = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || credentials.refreshToken,
  };

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await repo.update(mailboxId, {
    credentials: sealToString(JSON.stringify(updatedCredentials)),
    tokenExpiresAt: expiresAt,
    status: "active",
  });

  return updatedCredentials.accessToken;
}

export async function testConnection(mailboxId: string): Promise<boolean> {
  try {
    const accessToken = await refreshIfNeeded(mailboxId);
    const mailbox = await repo.findById(mailboxId);
    if (!mailbox) return false;

    const testUrl = mailbox.provider === "gmail"
      ? "https://gmail.googleapis.com/gmail/v1/users/me/profile"
      : "https://graph.microsoft.com/v1.0/me";

    const res = await fetch(testUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      await repo.update(mailboxId, { status: "active" });
      return true;
    } else {
      await repo.update(mailboxId, { status: "invalid" });
      return false;
    }
  } catch {
    await repo.update(mailboxId, { status: "invalid" });
    return false;
  }
}

export function extractBouncedEmail(body: string, headers: Record<string, string> = {}): string | null {
  if (headers["X-Failed-Recipients"]) {
    const match = headers["X-Failed-Recipients"].match(/[\w.-]+@[\w.-]+\.[\w]+/);
    if (match) return match[0].toLowerCase();
  }

  const finalRecipientMatch = body.match(/Final-Recipient:\s*rfc822;\s*([\w.-]+@[\w.-]+\.[\w]+)/i);
  if (finalRecipientMatch) {
    return finalRecipientMatch[1].toLowerCase();
  }

  const standardFailureMatch = body.match(/to:\s*([\w.-]+@[\w.-]+\.[\w]+)/i);
  if (standardFailureMatch) {
    return standardFailureMatch[1].toLowerCase();
  }

  const emailRegex = /[\w.-]+@[\w.-]+\.[\w]+/g;
  let match;
  while ((match = emailRegex.exec(body)) !== null) {
    const foundEmail = match[0].toLowerCase();
    if (!foundEmail.includes("mailer-daemon") && !foundEmail.includes("postmaster")) {
      return foundEmail;
    }
  }

  return null;
}

export async function syncMailboxBounces(mailboxId: string): Promise<void> {
  const mailbox = await repo.findById(mailboxId);
  if (!mailbox || mailbox.status !== "active") return;

  const accessToken = await refreshIfNeeded(mailboxId);
  const now = new Date();

  // If no syncCursor, default check window to last 20 minutes
  const lastSyncTime = mailbox.syncCursor 
    ? new Date(mailbox.syncCursor) 
    : new Date(Date.now() - 20 * 60 * 1000);

  if (mailbox.provider === "gmail") {
    // Query search query
    const afterSec = Math.floor(lastSyncTime.getTime() / 1000);
    const q = `from:(mailer-daemon OR postmaster) after:${afterSec}`;
    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}`;

    const listRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!listRes.ok) return;
    const listData = await listRes.json();
    const messages = listData.messages || [];

    for (const msgRef of messages) {
      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!msgRes.ok) continue;
      const msg = await msgRes.json();
      
      let bodyText = "";
      if (msg.payload) {
        if (msg.payload.parts) {
          bodyText = msg.payload.parts.map((p: { body?: { data?: string } }) => p.body?.data ? Buffer.from(p.body.data, "base64").toString("utf-8") : "").join("\n");
        } else if (msg.payload.body?.data) {
          bodyText = Buffer.from(msg.payload.body.data, "base64").toString("utf-8");
        }
      }

      const headers: Record<string, string> = {};
      if (msg.payload?.headers) {
        for (const h of msg.payload.headers) {
          headers[h.name] = h.value;
        }
      }

      const bouncedEmail = extractBouncedEmail(bodyText, headers);
      if (bouncedEmail) {
        await processBounce(mailbox.projectId, bouncedEmail, msgRef.id);
      }
    }
  } else {
    // Outlook Graph API NDR fetch
    const filter = `receivedDateTime ge ${lastSyncTime.toISOString()} and (contains(subject, 'Undeliverable') or contains(subject, 'Delivery Status Notification') or contains(from/emailAddress/address, 'mailer-daemon') or contains(from/emailAddress/address, 'postmaster'))`;
    const searchUrl = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=${encodeURIComponent(filter)}&$select=id,subject,body,from`;

    const listRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!listRes.ok) return;
    const listData = await listRes.json();
    const messages = listData.value || [];

    for (const msg of messages) {
      const bodyContent = msg.body?.content || "";
      const bouncedEmail = extractBouncedEmail(bodyContent);
      if (bouncedEmail) {
        await processBounce(mailbox.projectId, bouncedEmail, msg.id);
      }
    }
  }

  // Update syncCursor to current timestamp
  await repo.update(mailboxId, {
    syncCursor: now.toISOString(),
    lastSyncedAt: now,
  });
}

async function processBounce(projectId: string, bouncedEmail: string, providerMessageId: string) {
  // Add to suppression registry
  await suppressions.suppress(projectId, {
    email: bouncedEmail,
    reason: "bounce",
    source: "mailbox_bounce_sync",
  });

  // Find recipient record and mark it bounced
  const recipient = await recipientRepo.findByProviderMessageId(providerMessageId);
  if (recipient) {
    await recipientRepo.markByProviderMessageId(providerMessageId, {
      status: "bounced",
      failedAt: new Date(),
      error: "bounce_ndr_detected",
    });
    await campaignRepo.bumpCounters(recipient.campaignId, { failedCount: 1 });
  }

  // Record email event
  await recipientRepo.recordEvent({
    projectId,
    recipientId: recipient?.id ?? null,
    providerMessageId,
    type: "bounced",
    payload: { details: "bounce_parsed_by_mailbox_sync" },
  });
}
