import * as repo from "./analytics.repository";
import type { StatusCounts } from "./analytics.repository";
import { computeRates, type MetricCounts, type MetricRates } from "./analytics.rates";
import { campaignsCsv, timeseriesCsv, suppressionsCsv, type TimeseriesPoint } from "./analytics.csv";
import { getAccessibleProject } from "@/core/projects/project.service";

export interface CampaignPerf {
  campaignId: string;
  subject: string;
  status: string;
  counts: MetricCounts;
  rates: MetricRates;
}
export interface ListPerf {
  listId: string;
  name: string;
  counts: MetricCounts;
  rates: MetricRates;
}
export interface ProjectAnalytics {
  counts: MetricCounts;
  rates: MetricRates;
  timeseries: TimeseriesPoint[];
  topCampaigns: CampaignPerf[];
  topLists: ListPerf[];
  suppression: { byReason: Record<string, number>; total: number };
}
export interface CampaignAnalytics {
  counts: MetricCounts;
  rates: MetricRates;
  status: StatusCounts;
}

function assemble(status: StatusCounts, eng: { opened: number; clicked: number }, unsubscribed = 0): MetricCounts {
  const recipients =
    status.queued + status.sent + status.delivered + status.bounced + status.complained + status.failed + status.suppressed;
  const dispatched = status.sent + status.delivered + status.bounced + status.complained;
  return {
    recipients,
    dispatched,
    delivered: status.delivered,
    bounced: status.bounced,
    complained: status.complained,
    suppressed: status.suppressed,
    failed: status.failed,
    uniqueOpens: eng.opened,
    uniqueClicks: eng.clicked,
    unsubscribed,
  };
}

/* -------------------- project dashboard -------------------- */

export async function getProjectAnalytics(
  projectId: string,
  range: { from: Date; to: Date },
  userId: string,
): Promise<ProjectAnalytics> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) throw new Error("Project access denied");

  const [status, eng, unsub, breakdown, series, perCampaign, perList] = await Promise.all([
    repo.statusCounts(projectId),
    repo.engagementCounts(projectId),
    repo.unsubscribeCount(projectId),
    repo.suppressionBreakdown(projectId),
    buildTimeseries(projectId, range),
    rankCampaigns(projectId),
    rankLists(projectId),
  ]);

  const counts = assemble(status, eng, unsub);
  const byReason: Record<string, number> = {};
  let total = 0;
  for (const b of breakdown) {
    byReason[b.reason] = b.count;
    total += b.count;
  }

  return {
    counts,
    rates: computeRates(counts),
    timeseries: series,
    topCampaigns: perCampaign.slice(0, 10),
    topLists: perList.slice(0, 10),
    suppression: { byReason, total },
  };
}

export async function getCampaignAnalytics(projectId: string, campaignId: string, userId: string): Promise<CampaignAnalytics> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) throw new Error("Project access denied");

  const [status, eng] = await Promise.all([
    repo.statusCounts(projectId, { campaignId }),
    repo.engagementCounts(projectId, { campaignId }),
  ]);
  // Unsubscribes are not attributable per-campaign in v1 (locked decision).
  const counts = assemble(status, eng, 0);
  return { counts, rates: computeRates(counts), status };
}

/* -------------------- time-series (continuous UTC days) -------------------- */

function utcDays(from: Date, to: Date): string[] {
  const days: string[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (d <= end) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

async function buildTimeseries(projectId: string, range: { from: Date; to: Date }): Promise<TimeseriesPoint[]> {
  const [sends, opens, clicks, unsubs] = await Promise.all([
    repo.sendsByDay(projectId, range.from, range.to),
    repo.opensByDay(projectId, range.from, range.to),
    repo.clicksByDay(projectId, range.from, range.to),
    repo.unsubscribesByDay(projectId, range.from, range.to),
  ]);
  const toMap = (rows: repo.DayCount[]) => new Map(rows.map((r) => [r.day, r.n]));
  const s = toMap(sends);
  const o = toMap(opens);
  const c = toMap(clicks);
  const u = toMap(unsubs);
  return utcDays(range.from, range.to).map((date) => ({
    date,
    sends: s.get(date) ?? 0,
    opens: o.get(date) ?? 0,
    clicks: c.get(date) ?? 0,
    unsubscribes: u.get(date) ?? 0,
  }));
}

/* -------------------- rankings -------------------- */

function pivotStatus(rows: repo.CampaignLedgerRow[]): Map<string, StatusCounts> {
  const m = new Map<string, StatusCounts>();
  for (const r of rows) {
    const cur =
      m.get(r.campaignId) ??
      { queued: 0, sent: 0, delivered: 0, bounced: 0, complained: 0, failed: 0, suppressed: 0 };
    (cur as StatusCounts)[r.status as keyof StatusCounts] = r.n;
    m.set(r.campaignId, cur);
  }
  return m;
}

function pivotEngagement(rows: repo.CampaignEngagementRow[]): Map<string, { opened: number; clicked: number }> {
  const m = new Map<string, { opened: number; clicked: number }>();
  for (const r of rows) {
    const cur = m.get(r.campaignId) ?? { opened: 0, clicked: 0 };
    if (r.type === "opened") cur.opened = r.n;
    else if (r.type === "clicked") cur.clicked = r.n;
    m.set(r.campaignId, cur);
  }
  return m;
}

async function rankCampaigns(projectId: string): Promise<CampaignPerf[]> {
  const [ledger, eng, meta] = await Promise.all([
    repo.ledgerByCampaign(projectId),
    repo.engagementByCampaign(projectId),
    repo.sentCampaigns(projectId),
  ]);
  const statusMap = pivotStatus(ledger);
  const engMap = pivotEngagement(eng);

  const perf = meta.map((m) => {
    const status = statusMap.get(m.id) ?? emptyStatus();
    const counts = assemble(status, engMap.get(m.id) ?? { opened: 0, clicked: 0 });
    return { campaignId: m.id, subject: m.subject || "Untitled campaign", status: m.status, counts, rates: computeRates(counts) };
  });
  return perf
    .filter((p) => p.counts.dispatched > 0)
    .sort((a, b) => b.rates.openRate - a.rates.openRate || b.counts.dispatched - a.counts.dispatched);
}

async function rankLists(projectId: string): Promise<ListPerf[]> {
  const [ledger, eng, meta, names] = await Promise.all([
    repo.ledgerByCampaign(projectId),
    repo.engagementByCampaign(projectId),
    repo.sentCampaigns(projectId),
    repo.listNames(projectId),
  ]);
  const statusMap = pivotStatus(ledger);
  const engMap = pivotEngagement(eng);

  // Aggregate sent campaigns' counts by their list.
  const listStatus = new Map<string, StatusCounts>();
  const listEng = new Map<string, { opened: number; clicked: number }>();
  for (const m of meta) {
    if (!m.listId) continue;
    const s = statusMap.get(m.id);
    if (s) {
      const acc = listStatus.get(m.listId) ?? emptyStatus();
      for (const k of Object.keys(acc) as (keyof StatusCounts)[]) acc[k] += s[k];
      listStatus.set(m.listId, acc);
    }
    const e = engMap.get(m.id);
    if (e) {
      const acc = listEng.get(m.listId) ?? { opened: 0, clicked: 0 };
      acc.opened += e.opened;
      acc.clicked += e.clicked;
      listEng.set(m.listId, acc);
    }
  }

  const perf: ListPerf[] = [];
  for (const [listId, status] of listStatus) {
    const counts = assemble(status, listEng.get(listId) ?? { opened: 0, clicked: 0 });
    if (counts.dispatched <= 0) continue;
    perf.push({ listId, name: names.get(listId) ?? "Unknown list", counts, rates: computeRates(counts) });
  }
  return perf.sort((a, b) => b.rates.openRate - a.rates.openRate || b.counts.dispatched - a.counts.dispatched);
}

function emptyStatus(): StatusCounts {
  return { queued: 0, sent: 0, delivered: 0, bounced: 0, complained: 0, failed: 0, suppressed: 0 };
}

/* -------------------- CSV exports -------------------- */

export async function exportCampaignsCsv(projectId: string, userId: string): Promise<string> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) throw new Error("Project access denied");
  const perf = await rankCampaigns(projectId);
  return campaignsCsv(
    perf.map((p) => ({
      campaign: p.subject,
      status: p.status,
      recipients: p.counts.recipients,
      dispatched: p.counts.dispatched,
      delivered: p.counts.delivered,
      uniqueOpens: p.counts.uniqueOpens,
      uniqueClicks: p.counts.uniqueClicks,
      bounced: p.counts.bounced,
      complained: p.counts.complained,
      counts: p.counts,
    })),
  );
}

export async function exportTimeseriesCsv(projectId: string, range: { from: Date; to: Date }, userId: string): Promise<string> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) throw new Error("Project access denied");
  return timeseriesCsv(await buildTimeseries(projectId, range));
}

export async function exportSuppressionsCsv(projectId: string, userId: string): Promise<string> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) throw new Error("Project access denied");
  const breakdown = await repo.suppressionBreakdown(projectId);
  return suppressionsCsv(breakdown.map((b) => ({ reason: b.reason, count: b.count })));
}


