import { describe, it, expect } from "vitest";
import { ratio, computeRates, formatPct, emptyCounts, type MetricCounts } from "./analytics.rates";

describe("ratio", () => {
  it("returns 0 when denominator is 0 (no divide-by-zero)", () => {
    expect(ratio(5, 0)).toBe(0);
    expect(ratio(0, 0)).toBe(0);
  });
  it("computes a normal ratio", () => {
    expect(ratio(1, 4)).toBe(0.25);
  });
  it("never returns negative", () => {
    expect(ratio(-3, 10)).toBe(0);
  });
});

describe("computeRates (Dispatched-based)", () => {
  const counts: MetricCounts = {
    ...emptyCounts,
    recipients: 120,
    dispatched: 100, // sent+delivered+bounced+complained
    delivered: 90,
    bounced: 8,
    complained: 2,
    uniqueOpens: 45,
    uniqueClicks: 9,
    unsubscribed: 5,
  };

  it("delivery rate = delivered / dispatched", () => {
    expect(computeRates(counts).deliveryRate).toBeCloseTo(0.9);
  });
  it("open/click rates use delivered as denominator", () => {
    const r = computeRates(counts);
    expect(r.openRate).toBeCloseTo(45 / 90);
    expect(r.clickRate).toBeCloseTo(9 / 90);
    expect(r.clickToOpenRate).toBeCloseTo(9 / 45);
  });
  it("bounce uses dispatched; complaint uses delivered", () => {
    const r = computeRates(counts);
    expect(r.bounceRate).toBeCloseTo(8 / 100);
    expect(r.complaintRate).toBeCloseTo(2 / 90);
  });
  it("unsubscribe rate uses dispatched (project-level)", () => {
    expect(computeRates(counts).unsubscribeRate).toBeCloseTo(5 / 100);
  });
  it("all rates are 0 for empty counts", () => {
    const r = computeRates(emptyCounts);
    expect(Object.values(r).every((v) => v === 0)).toBe(true);
  });
});

describe("formatPct", () => {
  it("formats a ratio as a percentage", () => {
    expect(formatPct(0.1234)).toBe("12.3%");
    expect(formatPct(1)).toBe("100.0%");
    expect(formatPct(0)).toBe("0.0%");
  });
});
