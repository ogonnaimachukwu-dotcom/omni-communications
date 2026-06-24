/**
 * Pure funnel-rate math. No I/O — unit-tested in analytics.rates.test.ts.
 *
 * "Dispatched" (locked definition) = recipients the email was actually sent to:
 * status IN (sent, delivered, bounced, complained). It is the denominator for
 * delivery/bounce; delivered is the denominator for open/click/complaint.
 */

export interface MetricCounts {
  recipients: number; // every ledger row for the campaign(s)
  dispatched: number; // sent + delivered + bounced + complained
  delivered: number;
  bounced: number;
  complained: number;
  suppressed: number;
  failed: number;
  uniqueOpens: number;
  uniqueClicks: number;
  unsubscribed: number; // project-level only (v1)
}

export interface MetricRates {
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
  bounceRate: number;
  complaintRate: number;
  unsubscribeRate: number;
}

/** Safe ratio in [0,1]; 0 when the denominator is 0. */
export function ratio(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0;
  const r = numerator / denominator;
  return r < 0 ? 0 : r;
}

export function computeRates(c: MetricCounts): MetricRates {
  return {
    deliveryRate: ratio(c.delivered, c.dispatched),
    openRate: ratio(c.uniqueOpens, c.delivered),
    clickRate: ratio(c.uniqueClicks, c.delivered),
    clickToOpenRate: ratio(c.uniqueClicks, c.uniqueOpens),
    bounceRate: ratio(c.bounced, c.dispatched),
    complaintRate: ratio(c.complained, c.delivered),
    unsubscribeRate: ratio(c.unsubscribed, c.dispatched),
  };
}

/** Format a [0,1] ratio as a percentage string, e.g. 0.1234 -> "12.3%". */
export function formatPct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export const emptyCounts: MetricCounts = {
  recipients: 0,
  dispatched: 0,
  delivered: 0,
  bounced: 0,
  complained: 0,
  suppressed: 0,
  failed: 0,
  uniqueOpens: 0,
  uniqueClicks: 0,
  unsubscribed: 0,
};
