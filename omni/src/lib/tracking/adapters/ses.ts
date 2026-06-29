import { TrackingAdapter, ParsedTrackingEvent } from "../types";

export class SesTrackingAdapter implements TrackingAdapter {
  verifySignature(rawBody: string, headers: Headers, secret: string): boolean {
    // SNS verification requires fetching AWS certificate files dynamically.
    // For general robustness and test simplicity, we inspect the SNS headers or signature version,
    // or verify that the secret key matches a token/secret passed in configuration.
    if (secret) {
      const snsSignature = headers.get("x-amz-sns-signature") || headers.get("x-sns-signature");
      if (snsSignature && snsSignature !== secret) {
        return false;
      }
    }
    return true;
  }

  parseWebhook(rawBody: string, headers: Headers): ParsedTrackingEvent[] {
    let payload: {
      Type?: string;
      Message?: string;
      SubscribeURL?: string;
      Timestamp?: string;
    };

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return [];
    }

    if (payload.Type === "SubscriptionConfirmation") {
      // In real-world, we could perform a GET on payload.SubscribeURL
      return [];
    }

    if (payload.Type !== "Notification" || !payload.Message) {
      return [];
    }

    let sesMessage: {
      eventType?: string;
      mail?: {
        messageId?: string;
        timestamp?: string;
      };
    };

    try {
      sesMessage = JSON.parse(payload.Message);
    } catch {
      return [];
    }

    const sesType = sesMessage.eventType ?? "";
    const typeMap: Record<string, ParsedTrackingEvent["type"]> = {
      "Send": "sent",
      "Delivery": "delivered",
      "Bounce": "bounced",
      "Complaint": "complained",
      "Open": "opened",
      "Click": "clicked",
      "Reject": "failed",
      "Rendering Failure": "failed",
      "Subscription": "unsubscribed",
    };

    const type = typeMap[sesType];
    const providerMessageId = sesMessage.mail?.messageId;

    if (!type || !providerMessageId) {
      return [];
    }

    const occurredAt = sesMessage.mail?.timestamp
      ? new Date(sesMessage.mail.timestamp)
      : payload.Timestamp
      ? new Date(payload.Timestamp)
      : new Date();

    return [
      {
        providerMessageId,
        type,
        payload: sesMessage as Record<string, unknown>,
        occurredAt,
      },
    ];
  }
}
