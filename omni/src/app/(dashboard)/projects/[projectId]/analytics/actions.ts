"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { exportKindSchema, resolveRange, type RawSearchParams } from "@/core/analytics/analytics.schema";
import {
  exportCampaignsCsv,
  exportTimeseriesCsv,
  exportSuppressionsCsv,
} from "@/core/analytics/analytics.service";

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session;
}

export async function exportAnalyticsAction(
  projectId: string,
  kind: string,
  raw: RawSearchParams,
): Promise<{ filename: string; csv: string }> {
  const session = await requireSession();
  const k = exportKindSchema.parse(kind);

  if (k === "timeseries") {
    return { filename: `analytics-timeseries.csv`, csv: await exportTimeseriesCsv(projectId, resolveRange(raw), session.user.id) };
  }
  if (k === "suppressions") {
    return { filename: `analytics-suppressions.csv`, csv: await exportSuppressionsCsv(projectId, session.user.id) };
  }
  return { filename: `analytics-campaigns.csv`, csv: await exportCampaignsCsv(projectId, session.user.id) };
}

