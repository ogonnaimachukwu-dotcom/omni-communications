export interface ParsedTrackingEvent {
  providerMessageId: string;
  type:
    | "sent"
    | "delivered"
    | "delivery_delayed"
    | "bounced"
    | "complained"
    | "opened"
    | "clicked"
    | "failed"
    | "unsubscribed";
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export interface TrackingAdapter {
  verifySignature(rawBody: string, headers: Headers, secret: string): boolean;
  parseWebhook(rawBody: string, headers: Headers): ParsedTrackingEvent[];
}
