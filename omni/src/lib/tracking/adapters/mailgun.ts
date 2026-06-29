import { createHmac, timingSafeEqual } from "node:crypto";
import { TrackingAdapter, ParsedTrackingEvent } from "../types";

export class MailgunTrackingAdapter implements TrackingAdapter {
  verifySignature(rawBody: string, headers: Headers, secret: string): boolean {
    if (!secret) return true; // Bypass if no signature secret is configured

    let payload: {
      signature?: {
        timestamp?: string;
        token?: string;
        signature?: string;
      };
    };

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return false;
    }

    const signatureInfo = payload.signature;
    if (!signatureInfo?.timestamp || !signatureInfo?.token || !signatureInfo?.signature) {
      return false;
    }

    const expected = createHmac("sha256", secret)
      .update(`${signatureInfo.timestamp}${signatureInfo.token}`)
      .digest("hex");

    try {
      const a = Buffer.from(signatureInfo.signature);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  parseWebhook(rawBody: string, headers: Headers): ParsedTrackingEvent[] {
    let payload: {
      "event-data"?: {
        event?: string;
        timestamp?: number;
        message?: {
          headers?: {
            "message-id"?: string;
          };
        };
      };
    };

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return [];
    }

    const eventData = payload["event-data"];
    if (!eventData) {
      return [];
    }

    const mailgunEvent = eventData.event ?? "";
    const typeMap: Record<string, ParsedTrackingEvent["type"]> = {
      "accepted": "sent",
      "delivered": "delivered",
      "failed": "failed",
      "opened": "opened",
      "clicked": "clicked",
      "unsubscribed": "unsubscribed",
      "complained": "complained",
    };

    const type = typeMap[mailgunEvent];
    let providerMessageId = eventData.message?.headers?.["message-id"] || "";
    if (providerMessageId) {
      // Strip outer angles e.g., <msg-id@domain> -> msg-id@domain
      providerMessageId = providerMessageId.replace(/^<|>$/g, "");
    }

    if (!type || !providerMessageId) {
      return [];
    }

    const occurredAt = eventData.timestamp
      ? new Date(eventData.timestamp * 1000)
      : new Date();

    return [
      {
        providerMessageId,
        type,
        payload: payload as Record<string, unknown>,
        occurredAt,
      },
    ];
  }
}
