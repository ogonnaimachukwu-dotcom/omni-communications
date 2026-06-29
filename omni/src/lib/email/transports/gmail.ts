import type { EmailTransport, OutboundEmail, SendResult } from "../types";

export class GmailTransport implements EmailTransport {
  readonly name = "gmail";

  constructor(private readonly accessToken: string) {}

  async connect(): Promise<void> {
    return Promise.resolve();
  }

  async validate(): Promise<boolean> {
    try {
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async send(email: OutboundEmail): Promise<SendResult> {
    const mime = this.buildMimeMessage(email);
    const raw = Buffer.from(mime).toString("base64url");

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    if (!res.ok) {
      if (res.status === 429) {
        throw new Error("RATE_LIMIT_EXCEEDED");
      }
      const errBody = await res.text();
      throw new Error(`Gmail API send failed [${res.status}]: ${errBody}`);
    }

    const data = await res.json();
    return { providerMessageId: data.id };
  }

  async health(): Promise<{ status: "healthy" | "unhealthy"; details?: string }> {
    const ok = await this.validate();
    if (ok) return { status: "healthy" };
    return { status: "unhealthy", details: "Gmail API health check failed (unauthorized access token)." };
  }

  async disconnect(): Promise<void> {
    return Promise.resolve();
  }

  private buildMimeMessage(email: OutboundEmail): string {

    const boundary = `__omni_boundary_${Date.now()}__`;
    const headers = [
      `From: ${email.from}`,
      `To: ${email.to}`,
      `Subject: =?UTF-8?B?${Buffer.from(email.subject).toString("base64")}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ];

    if (email.replyTo) {
      headers.push(`Reply-To: ${email.replyTo}`);
    }

    if (email.headers) {
      for (const [key, value] of Object.entries(email.headers)) {
        headers.push(`${key}: ${value}`);
      }
    }

    const parts = [
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      Buffer.from(email.html).toString("base64"),
      `--${boundary}--`,
    ];

    return [...headers, "", ...parts].join("\r\n");
  }
}
