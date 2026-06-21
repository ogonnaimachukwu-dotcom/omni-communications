import { Users, Send, MailCheck, CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatNumber, formatDate } from "@/lib/format";
import type { ProjectStats } from "@/core/projects/project.repository";

export function KpiCards({ stats }: { stats: ProjectStats }) {
  const cards = [
    { label: "Total distributors", value: formatNumber(stats.totalDistributors), icon: Users },
    { label: "Total campaigns", value: formatNumber(stats.totalCampaigns), icon: Send },
    { label: "Emails sent", value: formatNumber(stats.emailsSent), icon: MailCheck },
    {
      label: "Last campaign",
      value: stats.lastCampaignAt ? formatDate(stats.lastCampaignAt) : "—",
      icon: CalendarClock,
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label} className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {card.label}
              </p>
              <Icon className="size-4 text-muted-foreground/70" />
            </div>
            <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
              {card.value}
            </p>
          </Card>
        );
      })}
    </section>
  );
}
