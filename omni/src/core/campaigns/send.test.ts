import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendRecipient } from "./send.service";
import * as recipientRepo from "./recipient.repository";
import type { SendContext } from "./recipient.repository";
import * as suppressions from "@/core/suppressions/suppression.service";

vi.mock("@/db", () => {
  const mockSet = vi.fn().mockReturnThis();
  const mockWhere = vi.fn().mockReturnThis();
  const mockReturning = vi.fn().mockResolvedValue([{ id: "camp1" }]);
  return {
    db: {
      transaction: vi.fn(),
      update: vi.fn(() => ({
        set: mockSet,
        where: mockWhere,
        returning: mockReturning,
      })),
    },
  };
});

vi.mock("./campaign.repository", () => ({
  bumpCounters: vi.fn(),
  setStatus: vi.fn(),
  findById: vi.fn(),
}));

vi.mock("./recipient.repository", () => ({
  getSendContext: vi.fn(),
  markRecipient: vi.fn(),
  countByStatus: vi.fn(),
}));

vi.mock("@/core/suppressions/suppression.service", () => ({
  isSuppressed: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  getTransport: vi.fn(),
}));

vi.mock("@/lib/queue", () => ({
  getBoss: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAudit: vi.fn(),
}));

describe("sendRecipient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes campaign send state even if recipient is suppressed at send time", async () => {
    const mockCtx = {
      recipient: {
        id: "rec1",
        campaignId: "camp1",
        projectId: "proj1",
        email: "suppressed@example.com",
        status: "queued",
      },
      campaign: { id: "camp1", subject: "Hello", bodyHtml: "body" },
      distributor: { name: "Jane", fields: {}, unsubscribeToken: "token1" },
      from: { fromName: "CEO", fromEmail: "ceo@domain.com", replyToEmail: null },
      signatureHtml: null,
    };

    vi.spyOn(recipientRepo, "getSendContext").mockResolvedValue(mockCtx as unknown as SendContext);
    vi.spyOn(suppressions, "isSuppressed").mockResolvedValue(true);
    vi.spyOn(recipientRepo, "countByStatus").mockResolvedValue(0);

    await sendRecipient({ recipientId: "rec1", campaignId: "camp1", projectId: "proj1" });

    // It should mark the recipient as suppressed
    expect(recipientRepo.markRecipient).toHaveBeenCalledWith("rec1", { status: "suppressed" });

    // It should call countByStatus/maybeComplete
    expect(recipientRepo.countByStatus).toHaveBeenCalled();
  });
});
