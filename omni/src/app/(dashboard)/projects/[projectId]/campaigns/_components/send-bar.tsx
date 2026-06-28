"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { FormState } from "../actions";

interface Props {
  status: "draft" | "approved" | "scheduled" | "sending" | "sent" | "failed" | "paused";
  scheduledAt: string | null;
  counts: { total: number; sent: number; delivered: number; failed: number };
  approveAction: (prev: FormState, formData: FormData) => Promise<FormState>;
  sendAction: (prev: FormState, formData: FormData) => Promise<FormState>;
  cancelAction: (prev: FormState, formData: FormData) => Promise<FormState>;
}

export function SendBar({ status, scheduledAt, counts, approveAction, sendAction, cancelAction }: Props) {
  const [approveState, approve, approving] = useActionState<FormState, FormData>(approveAction, { status: "idle" });
  const [sendState, send, sending] = useActionState<FormState, FormData>(sendAction, { status: "idle" });
  const [cancelState, cancel, cancelling] = useActionState<FormState, FormData>(cancelAction, { status: "idle" });

  const [localDt, setLocalDt] = useState("");
  const iso = localDt ? new Date(localDt).toISOString() : "";

  const err =
    (approveState.status === "error" && approveState.message) ||
    (sendState.status === "error" && sendState.message) ||
    (cancelState.status === "error" && cancelState.message) ||
    null;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Status</span>
        <Badge>{status}</Badge>
      </div>

      {status === "draft" && (
        <form action={approve}>
          <Button type="submit" disabled={approving} className="w-full">
            {approving && <Loader2 className="size-4 animate-spin" />}
            Approve
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Approving locks the content. You can send immediately or schedule afterwards.
          </p>
        </form>
      )}

      {status === "approved" && (
        <form action={send} className="space-y-2">
          <label className="text-xs text-muted-foreground">Audience status filter</label>
          <select
            name="subscription"
            defaultValue="subscribed"
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="subscribed">Subscribed only</option>
          </select>

          <label className="text-xs text-muted-foreground">Schedule (optional)</label>
          <input
            type="datetime-local"
            value={localDt}
            onChange={(e) => setLocalDt(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
          <input type="hidden" name="scheduledAt" value={iso} />

          <Button type="submit" disabled={sending} className="w-full">
            {sending && <Loader2 className="size-4 animate-spin" />}
            {localDt ? "Schedule send" : "Send now"}
          </Button>
        </form>
      )}

      {status === "scheduled" && (
        <form action={cancel} className="space-y-2">
          <p className="text-sm">
            Scheduled for{" "}
            <span className="font-medium">
              {scheduledAt ? new Date(scheduledAt).toLocaleString() : "—"}
            </span>
          </p>
          <Button type="submit" variant="outline" disabled={cancelling} className="w-full">
            {cancelling && <Loader2 className="size-4 animate-spin" />}
            Cancel schedule
          </Button>
        </form>
      )}

      {status === "sending" && (
        <p className="text-sm text-muted-foreground">Sending in progress…</p>
      )}

      {status === "paused" && (
        <p className="text-sm text-yellow-600 font-medium">Sending paused.</p>
      )}

      {(status === "sent" || status === "failed" || status === "sending" || status === "paused") && (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Stat label="Recipients" value={counts.total} />
          <Stat label="Sent" value={counts.sent} />
          <Stat label="Delivered" value={counts.delivered} />
          <Stat label="Failed" value={counts.failed} />
        </dl>
      )}

      {err && <p className="text-sm text-red-600">{err}</p>}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
