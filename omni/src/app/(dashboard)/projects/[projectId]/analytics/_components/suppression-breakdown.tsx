import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";

const REASONS = ["unsubscribe", "bounce", "complaint", "manual"] as const;

export function SuppressionBreakdown({
  byReason,
  total,
}: {
  byReason: Record<string, number>;
  total: number;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">Suppressions</span>
        <span className="text-sm tabular-nums text-muted-foreground">{formatNumber(total)} total</span>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {REASONS.map((r) => (
          <div key={r} className="rounded-md border p-3">
            <dt className="text-xs capitalize text-muted-foreground">{r}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{formatNumber(byReason[r] ?? 0)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
