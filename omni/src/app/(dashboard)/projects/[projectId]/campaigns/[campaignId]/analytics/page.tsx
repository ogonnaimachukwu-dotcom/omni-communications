import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Send, MailCheck, MousePointerClick, Mail } from "lucide-react";
import { idSchema as projectIdSchema } from "@/core/projects/project.schema";
import { getProject } from "@/core/projects/project.service";
import { getCampaign } from "@/core/campaigns/campaign.service";
import { getCampaignAnalytics } from "@/core/analytics/analytics.service";
import { formatNumber } from "@/lib/format";
import { formatPct } from "@/core/analytics/analytics.rates";
import { MetricCard } from "@/components/ui/metric-card";
import { FunnelBars } from "@/components/ui/funnel-bars";
import { Card } from "@/components/ui/card";
import { RecipientStatusBreakdown } from "./_components/recipient-status-breakdown";

export default async function CampaignAnalyticsPage({
  params,
}: {
  params: Promise<{ projectId: string; campaignId: string }>;
}) {
  const { projectId, campaignId } = await params;
  const pid = projectIdSchema.safeParse(projectId);
  if (!pid.success) notFound();
  const project = await getProject(pid.data);
  if (!project) notFound();
  const campaign = await getCampaign(project.id, campaignId);
  if (!campaign) notFound();

  const a = await getCampaignAnalytics(project.id, campaign.id);

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${project.id}/campaigns/${campaign.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {campaign.subject || "Campaign"}
      </Link>

      <h1 className="text-xl font-semibold">Campaign analytics</h1>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Dispatched" value={formatNumber(a.counts.dispatched)} icon={Send} hint={`${formatNumber(a.counts.recipients)} recipients`} />
        <MetricCard label="Delivery rate" value={formatPct(a.rates.deliveryRate)} icon={MailCheck} hint={`${formatNumber(a.counts.delivered)} delivered`} />
        <MetricCard label="Open rate" value={formatPct(a.rates.openRate)} icon={Mail} hint={`${formatNumber(a.counts.uniqueOpens)} unique`} />
        <MetricCard label="Click rate" value={formatPct(a.rates.clickRate)} icon={MousePointerClick} hint={`${formatNumber(a.counts.uniqueClicks)} unique`} />
      </section>

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

      <RecipientStatusBreakdown status={a.status} />

      <p className="text-xs text-muted-foreground">
        Unsubscribes are tracked at the project level and aren&apos;t attributed to individual campaigns.
      </p>
    </div>
  );
}
