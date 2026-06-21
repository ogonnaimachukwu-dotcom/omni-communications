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

  constructor(apiKey: string = env.RESEND_API_KEY) {
    this.client = new Resend(apiKey);
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
}
