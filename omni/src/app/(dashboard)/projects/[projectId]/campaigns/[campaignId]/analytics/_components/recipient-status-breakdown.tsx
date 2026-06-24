import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import type { StatusCounts } from "@/core/analytics/analytics.repository";

const LABELS: Record<keyof StatusCounts, string> = {
  queued: "Queued",
  sent: "Sent",
  delivered: "Delivered",
  bounced: "Bounced",
  complained: "Complained",
  failed: "Failed",
  suppressed: "Suppressed",
};

export function RecipientStatusBreakdown({ status }: { status: StatusCounts }) {
  return (
    <Card className="p-4">
      <p className="mb-3 text-sm font-medium">Recipient status</p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {(Object.keys(LABELS) as (keyof StatusCounts)[]).map((k) => (
          <div key={k} className="rounded-md border p-3">
            <dt className="text-xs text-muted-foreground">{LABELS[k]}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{formatNumber(status[k])}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
