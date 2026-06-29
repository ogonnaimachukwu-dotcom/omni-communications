import type { EmailTransport, OutboundEmail, SendResult } from "../types";
import nodemailer from "nodemailer";

export class SMTPTransport implements EmailTransport {
  readonly name = "smtp";
  private transporter: nodemailer.Transporter;

  constructor(config: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  }) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.auth.user,
        pass: config.auth.pass,
      },
    });
  }

  async connect(): Promise<void> {
    // Nodemailer verifies connections lazily, but verify on connect to ensure it works
    await this.transporter.verify();
  }

  async validate(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }

  async send(email: OutboundEmail): Promise<SendResult> {
    const info = await this.transporter.sendMail({
      from: email.from,
      to: email.to,
      replyTo: email.replyTo,
      subject: email.subject,
      html: email.html,
      headers: email.headers,
    });

    return { providerMessageId: info.messageId };
  }

  async health(): Promise<{ status: "healthy" | "unhealthy"; details?: string }> {
    try {
      await this.transporter.verify();
      return { status: "healthy" };
    } catch (err) {
      return { status: "unhealthy", details: err instanceof Error ? err.message : String(err) };
    }
  }

  async disconnect(): Promise<void> {
    this.transporter.close();
    return Promise.resolve();
  }
}

