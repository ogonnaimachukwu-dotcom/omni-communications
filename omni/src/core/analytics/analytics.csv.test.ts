import { describe, it, expect } from "vitest";
import { campaignsCsv, timeseriesCsv, suppressionsCsv } from "./analytics.csv";
import { emptyCounts } from "./analytics.rates";

describe("campaignsCsv", () => {
  it("emits a header row and computed rate columns", () => {
    const csv = campaignsCsv([
      {
        campaign: "Q3 Update",
        status: "sent",
        recipients: 100,
        dispatched: 100,
        delivered: 90,
        uniqueOpens: 45,
        uniqueClicks: 9,
        bounced: 8,
        complained: 2,
        counts: { ...emptyCounts, dispatched: 100, delivered: 90, uniqueOpens: 45, uniqueClicks: 9, bounced: 8, complained: 2 },
      },
    ]);
    const [header, row] = csv.trim().split("\n");
    expect(header).toContain("Campaign");
    expect(header).toContain("Open Rate");
    expect(row).toContain("Q3 Update");
    expect(row).toContain("50.0%"); // open rate 45/90
  });

  it("escapes commas in campaign names", () => {
    const csv = campaignsCsv([
      {
        campaign: "Hello, World",
        status: "sent",
        recipients: 1,
        dispatched: 1,
        delivered: 1,
        uniqueOpens: 0,
        uniqueClicks: 0,
        bounced: 0,
        complained: 0,
        counts: { ...emptyCounts, dispatched: 1, delivered: 1 },
      },
    ]);
    expect(csv).toContain('"Hello, World"');
  });
});

describe("timeseriesCsv", () => {
  it("emits date + metric columns", () => {
    const csv = timeseriesCsv([{ date: "2026-06-01", sends: 10, opens: 4, clicks: 1, unsubscribes: 0 }]);
    expect(csv).toContain("Date");
    expect(csv).toContain("2026-06-01");
  });
});

describe("suppressionsCsv", () => {
  it("emits reason + count", () => {
    const csv = suppressionsCsv([{ reason: "unsubscribe", count: 12 }]);
    expect(csv).toContain("Reason");
    expect(csv).toContain("unsubscribe");
  });
});
