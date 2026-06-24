import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { formatPct } from "@/core/analytics/analytics.rates";
import type { ListPerf } from "@/core/analytics/analytics.service";

export function TopListsTable({ lists }: { lists: ListPerf[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b px-4 py-3 text-sm font-medium">Top distributor lists</div>
      {lists.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No list performance yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">List</th>
              <th className="px-4 py-2 text-right font-medium">Dispatched</th>
              <th className="px-4 py-2 text-right font-medium">Open</th>
              <th className="px-4 py-2 text-right font-medium">Click</th>
            </tr>
          </thead>
          <tbody>
            {lists.map((l) => (
              <tr key={l.listId} className="border-b last:border-0">
                <td className="max-w-[260px] truncate px-4 py-2">{l.name}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatNumber(l.counts.dispatched)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatPct(l.rates.openRate)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatPct(l.rates.clickRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
