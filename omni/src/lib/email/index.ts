import type { EmailTransport } from "./types";
import { ResendTransport } from "./transports/resend";
import { GmailTransport } from "./transports/gmail";
import { OutlookTransport } from "./transports/outlook";
import * as mailboxRepo from "@/core/mailboxes/mailbox.repository";
import * as mailboxService from "@/core/mailboxes/mailbox.service";

/**
 * Transport factory. Dynamic in Phase 2: resolves the mailbox transport if a
 * mailboxId is supplied, otherwise falls back to Resend.
 */
export async function getTransport(mailboxId?: string | null): Promise<EmailTransport> {
  if (!mailboxId) {
    return new ResendTransport();
  }

  const mailbox = await mailboxRepo.findById(mailboxId);
  if (!mailbox) {
    throw new Error(`Mailbox connection not found: ${mailboxId}`);
  }

  if (mailbox.status !== "active") {
    throw new Error(`Mailbox connection is not active: ${mailbox.email}`);
  }

  const accessToken = await mailboxService.refreshIfNeeded(mailboxId);

  if (mailbox.provider === "gmail") {
    return new GmailTransport(accessToken);
  } else {
    return new OutlookTransport(accessToken);
  }
}

export * from "./types";
