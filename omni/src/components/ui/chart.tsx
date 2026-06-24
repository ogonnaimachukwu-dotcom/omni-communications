/**
 * Minimal dependency-free SVG line chart for daily time-series. Server-renderable
 * (no hooks). Scales to a fixed viewBox; the container controls responsive width.
 */

export interface ChartSeries<T> {
  key: keyof T & string;
  label: string;
  color: string;
}

export interface LineChartProps<T extends { date: string }> {
  data: T[];
  series: ChartSeries<T>[];
  height?: number;
}

const W = 720;
const PAD = { top: 12, right: 12, bottom: 22, left: 32 };

export function LineChart<T extends { date: string }>({ data, series, height = 220 }: LineChartProps<T>) {
  const H = height;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const n = data.length;
  const max = Math.max(
    1,
    ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)),
  );

  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const path = (key: keyof T & string) =>
    data
      .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(Number(d[key]) || 0).toFixed(1)}`)
      .join(" ");

  const ticks = [0, Math.round(max / 2), max];
  const labelEvery = Math.max(1, Math.ceil(n / 6));

  if (n === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No data in this range yet.</p>;
  }

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Time series chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-border" strokeWidth={1} />
            <text x={4} y={y(t) + 3} className="fill-muted-foreground" fontSize={9}>{t}</text>
          </g>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.date} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
              {d.date.slice(5)}
            </text>
          ) : null,
        )}
        {series.map((s) => (
          <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={1.75} strokeLinejoin="round" />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
