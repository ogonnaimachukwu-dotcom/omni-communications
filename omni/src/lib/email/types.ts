/**
 * Transport abstraction (strategy pattern, architecture §6). Resend is the only
 * implementation in Phase 1; Gmail / Graph / SMTP / SES become additional
 * adapters behind this same interface — no rewrites.
 */

export interface OutboundEmail {
  from: string; // "Name <news@acme.com>"
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  headers?: Record<string, string>; // e.g. List-Unsubscribe (RFC 8058)
}

export interface SendResult {
  providerMessageId: string;
}

export interface EmailTransport {
  readonly name: string;
  send(email: OutboundEmail): Promise<SendResult>;
}
