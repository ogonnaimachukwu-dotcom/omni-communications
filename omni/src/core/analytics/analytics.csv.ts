import Papa from "papaparse";
import { computeRates, formatPct, type MetricCounts } from "./analytics.rates";

export interface CampaignExportRow {
  campaign: string;
  status: string;
  recipients: number;
  dispatched: number;
  delivered: number;
  uniqueOpens: number;
  uniqueClicks: number;
  bounced: number;
  complained: number;
  counts: MetricCounts;
}

export interface TimeseriesPoint {
  date: string; // YYYY-MM-DD (UTC)
  sends: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
}

export interface SuppressionRow {
  reason: string;
  count: number;
}

export function campaignsCsv(rows: CampaignExportRow[]): string {
  return Papa.unparse(
    rows.map((r) => {
      const rates = computeRates(r.counts);
      return {
        Campaign: r.campaign,
        Status: r.status,
        Recipients: r.recipients,
        Dispatched: r.dispatched,
        Delivered: r.delivered,
        "Unique Opens": r.uniqueOpens,
        "Unique Clicks": r.uniqueClicks,
        Bounced: r.bounced,
        Complained: r.complained,
        "Delivery Rate": formatPct(rates.deliveryRate),
        "Open Rate": formatPct(rates.openRate),
        "Click Rate": formatPct(rates.clickRate),
      };
    }),
  );
}

export function timeseriesCsv(points: TimeseriesPoint[]): string {
  return Papa.unparse(
    points.map((p) => ({
      Date: p.date,
      Sends: p.sends,
      Opens: p.opens,
      Clicks: p.clicks,
      Unsubscribes: p.unsubscribes,
    })),
  );
}

export function suppressionsCsv(rows: SuppressionRow[]): string {
  return Papa.unparse(rows.map((r) => ({ Reason: r.reason, Count: r.count })));
}
