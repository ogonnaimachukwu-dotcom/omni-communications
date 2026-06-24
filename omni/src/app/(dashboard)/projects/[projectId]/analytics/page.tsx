import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Send, MailCheck, MousePointerClick, UserMinus, Mail } from "lucide-react";
import { idSchema as projectIdSchema } from "@/core/projects/project.schema";
import { getProject } from "@/core/projects/project.service";
import { getProjectAnalytics } from "@/core/analytics/analytics.service";
import { resolveRange, DEFAULT_RANGE_DAYS } from "@/core/analytics/analytics.schema";
import { formatNumber } from "@/lib/format";
import { formatPct } from "@/core/analytics/analytics.rates";
import { MetricCard } from "@/components/ui/metric-card";
import { FunnelBars } from "@/components/ui/funnel-bars";
import { LineChart } from "@/components/ui/chart";
import { Card } from "@/components/ui/card";
import { DateRangePicker } from "./_components/date-range-picker";
import { ExportButton } from "./_components/export-button";
import { TopCampaignsTable } from "./_components/top-campaigns-table";
import { TopListsTable } from "./_components/top-lists-table";
import { SuppressionBreakdown } from "./_components/suppression-breakdown";

export default async function ProjectAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const pid = projectIdSchema.safeParse(projectId);
  if (!pid.success) notFound();
  const project = await getProject(pid.data);
  if (!project) notFound();

  const raw = await searchParams;
  const range = resolveRange(raw);
  const activeDays = Number(Array.isArray(raw.days) ? raw.days[0] : raw.days) || DEFAULT_RANGE_DAYS;
  const a = await getProjectAnalytics(project.id, range);
  const basePath = `/projects/${project.id}/analytics`;

  return (
    <div className="space-y-6">
      <Link href={`/projects/${project.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {project.name}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <div className="flex items-center gap-2">
          <DateRangePicker basePath={basePath} activeDays={activeDays} />
          <ExportButton projectId={project.id} kind="campaigns" params={raw} label="Export" />
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Dispatched" value={formatNumber(a.counts.dispatched)} icon={Send} hint={`${formatNumber(a.counts.recipients)} recipients`} />
        <MetricCard label="Delivery rate" value={formatPct(a.rates.deliveryRate)} icon={MailCheck} hint={`${formatNumber(a.counts.delivered)} delivered`} />
        <MetricCard label="Open rate" value={formatPct(a.rates.openRate)} icon={Mail} hint={`${formatNumber(a.counts.uniqueOpens)} unique`} />
        <MetricCard label="Click rate" value={formatPct(a.rates.clickRate)} icon={MousePointerClick} hint={`${formatNumber(a.counts.uniqueClicks)} unique`} />
        <MetricCard label="Unsubscribe rate" value={formatPct(a.rates.unsubscribeRate)} icon={UserMinus} hint={`${formatNumber(a.counts.unsubscribed)} total`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">Activity ({activeDays}d, UTC)</span>
            <ExportButton projectId={project.id} kind="timeseries" params={raw} label="CSV" />
          </div>
          <LineChart
            data={a.timeseries}
            series={[
              { key: "sends", label: "Sends", color: "#6366f1" },
              { key: "opens", label: "Opens", color: "#10b981" },
              { key: "clicks", label: "Clicks", color: "#f59e0b" },
              { key: "unsubscribes", label: "Unsubscribes", color: "#ef4444" },
            ]}
          />
        </Card>

        <Card className="p-4">
          <p className="mb-3 text-sm font-medium">Funnel</p>
          <FunnelBars
            stages={[
              { label: "Dispatched", value: a.counts.dispatched, rate: 1 },
              { label: "Delivered", value: a.counts.delivered, rate: a.rates.deliveryRate },
              { label: "Opened", value: a.counts.uniqueOpens, rate: a.rates.openRate },
              { label: "Clicked", value: a.counts.uniqueClicks, rate: a.rates.clickRate },
            ]}
          />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TopCampaignsTable campaigns={a.topCampaigns} />
        <TopListsTable lists={a.topLists} />
      </div>

      <div className="flex items-center justify-end">
        <ExportButton projectId={project.id} kind="suppressions" params={raw} label="Export suppressions" />
      </div>
      <SuppressionBreakdown byReason={a.suppression.byReason} total={a.suppression.total} />
    </div>
  );
}
