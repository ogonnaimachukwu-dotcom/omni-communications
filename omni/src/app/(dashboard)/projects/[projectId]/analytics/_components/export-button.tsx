"use client";

import { useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportAnalyticsAction } from "../actions";

export function ExportButton({
  projectId,
  kind,
  params,
  label,
}: {
  projectId: string;
  kind: "campaigns" | "timeseries" | "suppressions";
  params: Record<string, string | string[] | undefined>;
  label: string;
}) {
  const [pending, start] = useTransition();

  const onClick = () =>
    start(async () => {
      const { filename, csv } = await exportAnalyticsAction(projectId, kind, params);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });

  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      {label}
    </Button>
  );
}
