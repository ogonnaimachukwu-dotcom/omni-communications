import type { EmailTransport, OutboundEmail, SendResult } from "../types";

export class OutlookTransport implements EmailTransport {
  readonly name = "outlook";

  constructor(private readonly accessToken: string) {}

  async connect(): Promise<void> {
    return Promise.resolve();
  }

  async validate(): Promise<boolean> {
    try {
      const res = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async send(email: OutboundEmail): Promise<SendResult> {
    // Generate a unique client-side message ID since Microsoft Graph sendMail does not return the message ID.
    const customMessageId = `outlook-${crypto.randomUUID()}`;

    const singleValueExtendedProperties: { id: string; value: string }[] = [
      {
        id: "String {00020386-0000-0000-C000-000000000046} Name X-Provider-Message-ID",
        value: customMessageId,
      },
    ];

    if (email.headers) {
      for (const [key, value] of Object.entries(email.headers)) {
        singleValueExtendedProperties.push({
          id: `String {00020386-0000-0000-C000-000000000046} Name ${key}`,
          value: value,
        });
      }
    }

    const payload = {
      message: {
        subject: email.subject,
        body: {
          contentType: "HTML",
          content: email.html,
        },
        toRecipients: [
          {
            emailAddress: {
              address: email.to,
            },
          },
        ],
        replyTo: email.replyTo
          ? [
              {
                emailAddress: {
                  address: email.replyTo,
                },
              },
            ]
          : [],
        singleValueExtendedProperties,
      },
    };

    const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      if (res.status === 429) {
        throw new Error("RATE_LIMIT_EXCEEDED");
      }
      const errBody = await res.text();
      throw new Error(`Outlook API send failed [${res.status}]: ${errBody}`);
    }

    return { providerMessageId: customMessageId };
  }

  async health(): Promise<{ status: "healthy" | "unhealthy"; details?: string }> {
    const ok = await this.validate();
    if (ok) return { status: "healthy" };
    return { status: "unhealthy", details: "Outlook API health check failed (unauthorized access token)." };
  }

  async disconnect(): Promise<void> {
    return Promise.resolve();
  }
}

