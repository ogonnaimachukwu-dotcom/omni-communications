import { Resend } from "resend";
import { env } from "@/env";
import type { EmailTransport, OutboundEmail, SendResult } from "../types";

/**
 * Resend transport. Phase 1 uses a single platform API key; the per-project
 * "from" identity is supplied by the caller from a verified sending_domains row.
 */
export class ResendTransport implements EmailTransport {
  readonly name = "resend";
  private client: Resend;
  private apiKey: string;

  constructor(apiKey: string = env.RESEND_API_KEY) {
    this.apiKey = apiKey;
    this.client = new Resend(apiKey);
  }

  async connect(): Promise<void> {
    // Resend is a stateless HTTP client, no connection initialization needed.
    return Promise.resolve();
  }

  async validate(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      // Validate by doing a light fetch to resend api
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "test@resend.dev",
          to: "test@resend.dev",
          subject: "ping",
          html: "ping",
        }),
      });
      return res.status !== 401 && res.status !== 403;
    } catch {
      return false;
    }
  }

  async send(email: OutboundEmail): Promise<SendResult> {
    const { data, error } = await this.client.emails.send({
      from: email.from,
      to: email.to,
      replyTo: email.replyTo,
      subject: email.subject,
      html: email.html,
      headers: email.headers,
    });

    if (error || !data) {
      throw new Error(`Resend send failed: ${error?.message ?? "unknown error"}`);
    }
    return { providerMessageId: data.id };
  }

  async health(): Promise<{ status: "healthy" | "unhealthy"; details?: string }> {
    const isValid = await this.validate();
    if (isValid) {
      return { status: "healthy" };
    }
    return { status: "unhealthy", details: "Resend API connection test failed (unauthorized API key)." };
  }

  async disconnect(): Promise<void> {
    return Promise.resolve();
  }
}

