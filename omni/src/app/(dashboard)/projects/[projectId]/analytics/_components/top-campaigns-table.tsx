import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { formatPct } from "@/core/analytics/analytics.rates";
import type { CampaignPerf } from "@/core/analytics/analytics.service";

export function TopCampaignsTable({ campaigns }: { campaigns: CampaignPerf[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b px-4 py-3 text-sm font-medium">Top campaigns</div>
      {campaigns.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No sent campaigns yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Campaign</th>
              <th className="px-4 py-2 text-right font-medium">Dispatched</th>
              <th className="px-4 py-2 text-right font-medium">Delivered</th>
              <th className="px-4 py-2 text-right font-medium">Open</th>
              <th className="px-4 py-2 text-right font-medium">Click</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.campaignId} className="border-b last:border-0">
                <td className="max-w-[260px] truncate px-4 py-2">{c.subject}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatNumber(c.counts.dispatched)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatNumber(c.counts.delivered)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatPct(c.rates.openRate)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatPct(c.rates.clickRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
