import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMailboxInputSchema, updateMailboxStatusInputSchema } from "./mailbox.schema";
import { extractBouncedEmail, testConnection } from "./mailbox.service";
import { getTransport } from "@/lib/email";
import * as repo from "./mailbox.repository";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./mailbox.repository", () => ({
  findById: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/crypto/envelope", () => ({
  sealToString: vi.fn((s) => `sealed:${s}`),
  openFromString: vi.fn((s) => s.replace("sealed:", "")),
}));

describe("Mailbox Connections Schema", () => {
  it("validates create input correctly", () => {
    const valid = {
      projectId: "d11ff74a-3311-4742-ce12-01941be5c201",
      email: "sender@gmail.com",
      provider: "gmail",
      credentials: "sealed:{\"accessToken\":\"abc\"}",
    };
    expect(createMailboxInputSchema.safeParse(valid).success).toBe(true);

    const invalid = {
      email: "not-an-email",
    };
    expect(createMailboxInputSchema.safeParse(invalid).success).toBe(false);
  });

  it("validates status updates correctly", () => {
    expect(updateMailboxStatusInputSchema.safeParse({ status: "paused" }).success).toBe(true);
    expect(updateMailboxStatusInputSchema.safeParse({ status: "invalid" }).success).toBe(true);
    expect(updateMailboxStatusInputSchema.safeParse({ status: "active" }).success).toBe(true);
    expect(updateMailboxStatusInputSchema.safeParse({ status: "unknown" }).success).toBe(false);
  });
});

describe("extractBouncedEmail (NDR Parser)", () => {
  it("parses X-Failed-Recipients headers", () => {
    const headers = { "X-Failed-Recipients": "target@example.com" };
    expect(extractBouncedEmail("simple body", headers)).toBe("target@example.com");
  });

  it("parses Final-Recipient report format", () => {
    const body = `
      Reporting-MTA: dns; mail.example.com
      Received-From-MTA: dns; sender.example.com
      Arrival-Date: Wed, 25 Jun 2026 00:00:00 +0000

      Final-Recipient: rfc822; bounced-user@domain.com
      Action: failed
      Status: 5.1.1
    `;
    expect(extractBouncedEmail(body)).toBe("bounced-user@domain.com");
  });

  it("parses inline failure description text", () => {
    const body = "Delivery failed. Could not deliver message to: custom-fail@site.org. Connection timed out.";
    expect(extractBouncedEmail(body)).toBe("custom-fail@site.org");
  });

  it("excludes daemon/postmaster emails", () => {
    const body = "From: mailer-daemon@googlemail.com. Details: target@domain.com bounced.";
    expect(extractBouncedEmail(body)).toBe("target@domain.com");
  });
});

describe("testConnection Diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks connection invalid when provider profile request fails", async () => {
    const mockMailbox = {
      id: "mb1",
      email: "sender@gmail.com",
      provider: "gmail",
      credentials: "sealed:{\"accessToken\":\"abc\",\"refreshToken\":\"ref\"}",
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };

    vi.spyOn(repo, "findById").mockResolvedValue(mockMailbox as unknown as repo.MailboxRow);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    }));

    const result = await testConnection("mb1");
    expect(result).toBe(false);
    expect(repo.update).toHaveBeenCalledWith("mb1", { status: "invalid" });
  });

  it("marks connection active when provider profile request succeeds", async () => {
    const mockMailbox = {
      id: "mb1",
      email: "sender@gmail.com",
      provider: "gmail",
      credentials: "sealed:{\"accessToken\":\"abc\",\"refreshToken\":\"ref\"}",
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };

    vi.spyOn(repo, "findById").mockResolvedValue(mockMailbox as unknown as repo.MailboxRow);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ emailAddress: "sender@gmail.com" }),
    }));

    const result = await testConnection("mb1");
    expect(result).toBe(true);
    expect(repo.update).toHaveBeenCalledWith("mb1", { status: "active" });
  });
});

describe("Dynamic Email Transport Factory", () => {
  it("falls back to ResendTransport when mailboxId is missing", async () => {
    const transport = await getTransport(null);
    expect(transport.name).toBe("resend");
  });

  it("throws error if mailbox is not active", async () => {
    const mockMailbox = {
      id: "mb1",
      email: "sender@gmail.com",
      provider: "gmail",
      status: "paused",
    };
    vi.spyOn(repo, "findById").mockResolvedValue(mockMailbox as unknown as repo.MailboxRow);
    await expect(getTransport("mb1")).rejects.toThrow("Mailbox connection is not active");
  });
});
