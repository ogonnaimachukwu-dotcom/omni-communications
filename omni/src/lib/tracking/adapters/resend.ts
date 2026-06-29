import { createHmac, timingSafeEqual } from "node:crypto";
import { TrackingAdapter, ParsedTrackingEvent } from "../types";

export class ResendTrackingAdapter implements TrackingAdapter {
  verifySignature(rawBody: string, headers: Headers, secret: string): boolean {
    const id = headers.get("svix-id");
    const timestamp = headers.get("svix-timestamp");
    const signatureHeader = headers.get("svix-signature");
    if (!id || !timestamp || !signatureHeader || !secret) {
      return false;
    }

    const cleanSecret = secret.replace(/^whsec_/, "");
    let key: Buffer;
    try {
      key = Buffer.from(cleanSecret, "base64");
    } catch {
      return false;
    }

    const expected = createHmac("sha256", key)
      .update(`${id}.${timestamp}.${rawBody}`)
      .digest("base64");

    return signatureHeader.split(" ").some((part) => {
      const sig = part.split(",")[1];
      if (!sig) return false;
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    });
  }

  parseWebhook(rawBody: string, headers: Headers): ParsedTrackingEvent[] {
    let event: {
      type?: string;
      created_at?: string;
      data?: {
        email_id?: string;
      };
    };

    try {
      event = JSON.parse(rawBody);
    } catch {
      return [];
    }

    const resendType = event.type ?? "";
    const typeMap: Record<string, ParsedTrackingEvent["type"]> = {
      "email.sent": "sent",
      "email.delivered": "delivered",
      "email.delivery_delayed": "delivery_delayed",
      "email.bounced": "bounced",
      "email.complained": "complained",
      "email.opened": "opened",
      "email.clicked": "clicked",
      "email.failed": "failed",
      "email.unsubscribed": "unsubscribed",
    };

    const type = typeMap[resendType];
    const providerMessageId = event.data?.email_id;

    if (!type || !providerMessageId) {
      return [];
    }

    const occurredAt = event.created_at ? new Date(event.created_at) : new Date();

    return [
      {
        providerMessageId,
        type,
        payload: event as Record<string, unknown>,
        occurredAt,
      },
    ];
  }
}
