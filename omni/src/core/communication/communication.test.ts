import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSendingProviderInputSchema,
  createInboxConnectionInputSchema,
  createCommunicationProfileInputSchema,
} from "./communication.schema";
import { getCampaignTransport } from "./communication.service";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./communication.repository", () => ({
  findSendingProviderById: vi.fn(),
  findInboxConnectionById: vi.fn(),
  findCommunicationProfileById: vi.fn(),
  createSendingProvider: vi.fn(),
  createInboxConnection: vi.fn(),
  createCommunicationProfile: vi.fn(),
}));

vi.mock("@/lib/crypto/envelope", () => ({
  sealToString: vi.fn((s) => `sealed:${s}`),
  openFromString: vi.fn((s) => s.replace("sealed:", "")),
}));

describe("Communication Engine Validation Schemas", () => {
  it("validates sending provider inputs correctly", () => {
    const valid = {
      projectId: "d11ff74a-3311-4742-ce12-01941be5c201",
      name: "SMTP Server",
      type: "smtp",
      credentials: "sealed:{\"host\":\"smtp.com\"}",
    };
    expect(createSendingProviderInputSchema.safeParse(valid).success).toBe(true);

    const invalid = {
      name: "",
      type: "invalid_type",
    };
    expect(createSendingProviderInputSchema.safeParse(invalid).success).toBe(false);
  });

  it("validates inbox connection inputs correctly", () => {
    const valid = {
      projectId: "d11ff74a-3311-4742-ce12-01941be5c201",
      name: "My Inbox",
      email: "ceo@company.com",
      type: "imap",
      credentials: "sealed:{}",
    };
    expect(createInboxConnectionInputSchema.safeParse(valid).success).toBe(true);
  });

  it("validates communication profile inputs correctly", () => {
    const valid = {
      projectId: "d11ff74a-3311-4742-ce12-01941be5c201",
      name: "Outreach Campaign Profile",
      sendingProviderId: "d11ff74a-3311-4742-ce12-01941be5c202",
      inboxConnectionId: "d11ff74a-3311-4742-ce12-01941be5c203",
      dailyLimit: 250,
      replyAlias: "John Doe",
      timezone: "Europe/London",
    };
    expect(createCommunicationProfileInputSchema.safeParse(valid).success).toBe(true);
  });
});

describe("getCampaignTransport fallback resolution", () => {
  it("resolves default ResendTransport if no profiles/mailboxes are bound", async () => {
    const transport = await getCampaignTransport({
      communicationProfileId: null,
      mailboxId: null,
    });
    expect(transport.name).toBe("resend");
  });
});
