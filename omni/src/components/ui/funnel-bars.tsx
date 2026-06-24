import { formatNumber } from "@/lib/format";
import { formatPct } from "@/core/analytics/analytics.rates";

export interface FunnelStage {
  label: string;
  value: number;
  /** Denominator for the percentage label; defaults to the first stage value. */
  rate?: number;
}

/**
 * Horizontal funnel: each stage's bar width is relative to the first stage.
 * Pure CSS widths — no chart dependency.
 */
export function FunnelBars({ stages }: { stages: FunnelStage[] }) {
  const base = Math.max(1, stages[0]?.value ?? 1);
  return (
    <div className="space-y-2.5">
      {stages.map((s) => {
        const widthPct = Math.max(2, Math.min(100, (s.value / base) * 100));
        return (
          <div key={s.label} className="space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-foreground">{s.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatNumber(s.value)}
                {s.rate !== undefined && <span className="ml-2 text-xs">{formatPct(s.rate)}</span>}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${widthPct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
