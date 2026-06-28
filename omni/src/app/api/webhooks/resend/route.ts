import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/env";
import * as recipientRepo from "@/core/campaigns/recipient.repository";
import * as campaignRepo from "@/core/campaigns/campaign.repository";
import * as suppressions from "@/core/suppressions/suppression.service";
import type { EmailEventType } from "@/core/campaigns/recipient.repository";
import { withLogging, logStorage, logger } from "@/lib/logger";
import { trace } from "@/lib/tracing";

export const runtime = "nodejs";

/** Map a Resend event type to our email_event enum (null = ignore). */
function toEventType(resendType: string): EmailEventType | null {
  const map: Record<string, EmailEventType> = {
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delivery_delayed",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.opened": "opened",
    "email.clicked": "clicked",
  };
  return map[resendType] ?? null;
}

/**
 * Verify a Resend (Svix) webhook signature.
 * signedContent = `${id}.${timestamp}.${rawBody}`, HMAC-SHA256 with the base64
 * secret (after the "whsec_" prefix), compared against the v1 signatures.
 */
function verifySignature(raw: string, headers: Headers): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  const secret = env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, "");
  let key: Buffer;
  try {
    key = Buffer.from(secret, "base64");
  } catch {
    return false;
  }

  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${raw}`)
    .digest("base64");

  // Header is space-separated "v1,<sig> v1,<sig2>"; any match passes.
  return signatureHeader.split(" ").some((part) => {
    const sig = part.split(",")[1];
    if (!sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return withLogging(request, async () => {
    return trace("api.webhook.resend", async () => {
      const raw = await request.text();

      if (!verifySignature(raw, request.headers)) {
        logger.warn("Invalid signature on webhook");
        return NextResponse.json({ error: "invalid signature" }, { status: 401 });
      }

      let event: { type?: string; data?: { email_id?: string } };
      try {
        event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const eventType = toEventType(event.type ?? "");
  const providerMessageId = event.data?.email_id;
  if (!eventType || !providerMessageId) {
    return NextResponse.json({ ok: true }); // ack unknown/irrelevant events
  }

  const recipient = await recipientRepo.findByProviderMessageId(providerMessageId);

  const store = logStorage.getStore();
  if (store && recipient) {
    store.projectId = recipient.projectId;
    store.campaignId = recipient.campaignId;
  }

  await recipientRepo.recordEvent({
    projectId: recipient?.projectId ?? null,
    recipientId: recipient?.id ?? null,
    providerMessageId,
    type: eventType,
    payload: event as Record<string, unknown>,
  });

  if (recipient) {
    if (eventType === "delivered") {
      await recipientRepo.markByProviderMessageId(providerMessageId, {
        status: "delivered",
        deliveredAt: new Date(),
      });
      await campaignRepo.bumpCounters(recipient.campaignId, { deliveredCount: 1 });
    } else if (eventType === "bounced" || eventType === "complained") {
      const reason = eventType === "bounced" ? "bounce" : "complaint";
      await recipientRepo.markByProviderMessageId(providerMessageId, {
        status: eventType,
        failedAt: new Date(),
        error: reason,
      });
      await suppressions.suppress(recipient.projectId, {
        email: recipient.email,
        reason,
        source: "resend_webhook",
      });
    }
  }

  return NextResponse.json({ ok: true });
    });
  });
}
