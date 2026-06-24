import { z } from "zod";

export const DEFAULT_RANGE_DAYS = 90;

/** UTC start-of-day N days ago through now. Day buckets are UTC (locked). */
export function defaultRange(days = DEFAULT_RANGE_DAYS): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  from.setUTCHours(0, 0, 0, 0);
  return { from, to };
}

export const analyticsRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  days: z.coerce.number().int().min(1).max(365).optional().catch(undefined),
});
export type AnalyticsRangeInput = z.infer<typeof analyticsRangeSchema>;

export type RawSearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function resolveRange(raw: RawSearchParams): { from: Date; to: Date } {
  const parsed = analyticsRangeSchema.safeParse({
    from: first(raw.from),
    to: first(raw.to),
    days: first(raw.days),
  });
  if (!parsed.success) return defaultRange();
  const { from, to, days } = parsed.data;
  if (from && to) return { from: new Date(from), to: new Date(to) };
  return defaultRange(days ?? DEFAULT_RANGE_DAYS);
}

export const exportKindSchema = z.enum(["campaigns", "timeseries", "suppressions"]).catch("campaigns");
export type ExportKind = z.infer<typeof exportKindSchema>;
