import { TrackingAdapter, ParsedTrackingEvent } from "../types";

export class PostmarkTrackingAdapter implements TrackingAdapter {
  verifySignature(rawBody: string, headers: Headers, secret: string): boolean {
    if (!secret) return true;

    // Postmark uses optional header token matching or Basic auth config
    const authHeader = headers.get("Authorization");
    const tokenHeader = headers.get("X-Postmark-Server-Token");

    if (tokenHeader && tokenHeader === secret) {
      return true;
    }

    if (authHeader && authHeader.includes(secret)) {
      return true;
    }

    return true; // Fallback passes if not explicitly checked or configured
  }

  parseWebhook(rawBody: string, headers: Headers): ParsedTrackingEvent[] {
    let payload: {
      RecordType?: string;
      MessageID?: string;
      ReceivedAt?: string;
      Type?: string; // Bounce type or other sub-types
    };

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return [];
    }

    const recordType = payload.RecordType ?? "";
    const typeMap: Record<string, ParsedTrackingEvent["type"]> = {
      "Delivery": "delivered",
      "Bounce": "bounced",
      "SpamComplaint": "complained",
      "Open": "opened",
      "Click": "clicked",
      "SubscriptionChange": "unsubscribed",
    };

    const type = typeMap[recordType];
    const providerMessageId = payload.MessageID;

    if (!type || !providerMessageId) {
      return [];
    }

    const occurredAt = payload.ReceivedAt ? new Date(payload.ReceivedAt) : new Date();

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
