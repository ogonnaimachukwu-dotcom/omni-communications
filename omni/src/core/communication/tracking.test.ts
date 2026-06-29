import { describe, it, expect, vi } from "vitest";
import { createTrackingAdapter } from "@/lib/tracking";
import { ResendTrackingAdapter } from "@/lib/tracking/adapters/resend";
import { SesTrackingAdapter } from "@/lib/tracking/adapters/ses";
import { MailgunTrackingAdapter } from "@/lib/tracking/adapters/mailgun";
import { PostmarkTrackingAdapter } from "@/lib/tracking/adapters/postmark";

describe("Tracking Provider Webhook Verification & Normalization", () => {
  it("resolves specific tracking adapters via factory", () => {
    expect(createTrackingAdapter("resend_webhook")).toBeInstanceOf(ResendTrackingAdapter);
    expect(createTrackingAdapter("ses_sns")).toBeInstanceOf(SesTrackingAdapter);
    expect(createTrackingAdapter("mailgun_webhook")).toBeInstanceOf(MailgunTrackingAdapter);
    expect(createTrackingAdapter("postmark_webhook")).toBeInstanceOf(PostmarkTrackingAdapter);
  });

  describe("Resend Adapter", () => {
    const adapter = new ResendTrackingAdapter();

    it("parses Resend payload correctly", () => {
      const payload = JSON.stringify({
        created_at: "2026-06-29T22:00:00.000Z",
        type: "email.delivered",
        data: {
          email_id: "resend-msg-12345",
        },
      });

      const [event] = adapter.parseWebhook(payload, new Headers());
      expect(event).toBeDefined();
      expect(event.providerMessageId).toBe("resend-msg-12345");
      expect(event.type).toBe("delivered");
      expect(event.occurredAt.toISOString()).toBe("2026-06-29T22:00:00.000Z");
    });

    it("skips unsupported Resend event types", () => {
      const payload = JSON.stringify({
        type: "email.unknown_type",
        data: {
          email_id: "resend-msg-12345",
        },
      });

      const events = adapter.parseWebhook(payload, new Headers());
      expect(events).toHaveLength(0);
    });
  });

  describe("Mailgun Adapter", () => {
    const adapter = new MailgunTrackingAdapter();

    it("parses Mailgun payload correctly", () => {
      const payload = JSON.stringify({
        "event-data": {
          event: "delivered",
          timestamp: 1782670391,
          message: {
            headers: {
              "message-id": "<mailgun-msg-abcde>",
            },
          },
        },
      });

      const [event] = adapter.parseWebhook(payload, new Headers());
      expect(event).toBeDefined();
      expect(event.providerMessageId).toBe("mailgun-msg-abcde"); // stripped < >
      expect(event.type).toBe("delivered");
      expect(event.occurredAt.getTime()).toBe(1782670391 * 1000);
    });
  });

  describe("SES Adapter", () => {
    const adapter = new SesTrackingAdapter();

    it("parses SES SNS payload correctly", () => {
      const payload = JSON.stringify({
        Type: "Notification",
        Timestamp: "2026-06-29T22:00:00.000Z",
        Message: JSON.stringify({
          eventType: "Bounce",
          mail: {
            messageId: "ses-msg-999",
            timestamp: "2026-06-29T21:55:00.000Z",
          },
        }),
      });

      const [event] = adapter.parseWebhook(payload, new Headers());
      expect(event).toBeDefined();
      expect(event.providerMessageId).toBe("ses-msg-999");
      expect(event.type).toBe("bounced");
      expect(event.occurredAt.toISOString()).toBe("2026-06-29T21:55:00.000Z");
    });
  });

  describe("Postmark Adapter", () => {
    const adapter = new PostmarkTrackingAdapter();

    it("parses Postmark payload correctly", () => {
      const payload = JSON.stringify({
        RecordType: "SpamComplaint",
        MessageID: "postmark-msg-777",
        ReceivedAt: "2026-06-29T22:05:00.000Z",
      });

      const [event] = adapter.parseWebhook(payload, new Headers());
      expect(event).toBeDefined();
      expect(event.providerMessageId).toBe("postmark-msg-777");
      expect(event.type).toBe("complained");
      expect(event.occurredAt.toISOString()).toBe("2026-06-29T22:05:00.000Z");
    });
  });
});
