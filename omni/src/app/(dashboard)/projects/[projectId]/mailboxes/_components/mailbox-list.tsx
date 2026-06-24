"use client";

import { useState } from "react";
import { Mail, RefreshCw, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { verifyMailbox, removeMailbox } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type MailboxListItem = {
  id: string;
  email: string;
  provider: "gmail" | "outlook";
  status: "active" | "invalid" | "paused";
  lastSyncedAt: Date | null;
};

export function MailboxList({
  projectId,
  initialMailboxes,
}: {
  projectId: string;
  initialMailboxes: MailboxListItem[];
}) {
  const [items, setItems] = useState<MailboxListItem[]>(initialMailboxes);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleVerify(id: string) {
    setTestingId(id);
    try {
      const success = await verifyMailbox(projectId, id);
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: success ? "active" : "invalid" } : item
        )
      );
    } catch (err) {
      console.error(err);
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to disconnect this mailbox?")) return;
    setDeletingId(id);
    try {
      await removeMailbox(projectId, id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground mb-4">
          <Mail className="size-6" />
        </div>
        <h3 className="text-lg font-medium text-foreground">No mailboxes connected</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          Connect a Gmail or Outlook account to start sending campaigns and receiving responses directly through your own inbox.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((mailbox) => (
        <Card key={mailbox.id} className="relative overflow-hidden border-border bg-card">
          <CardContent className="p-5 flex flex-col justify-between h-full gap-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                  <Mail className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {mailbox.email}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {mailbox.provider === "gmail" ? "Google Gmail" : "Microsoft Outlook"}
                  </p>
                </div>
              </div>

              {mailbox.status === "active" ? (
                <Badge variant="outline" className="gap-1.5 border-emerald-500/20 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">
                  <CheckCircle2 className="size-3.5 fill-emerald-100" />
                  Active
                </Badge>
              ) : mailbox.status === "paused" ? (
                <Badge variant="outline" className="gap-1.5 border-amber-500/20 bg-amber-500/10 text-amber-600 hover:bg-amber-500/10">
                  <AlertTriangle className="size-3.5 fill-amber-100" />
                  Paused
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1.5 border-rose-500/20 bg-rose-500/10 text-rose-600 hover:bg-rose-500/10">
                  <AlertTriangle className="size-3.5 fill-rose-100" />
                  Failed
                </Badge>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3 mt-auto">
              <span className="text-[11px] text-muted-foreground">
                {mailbox.lastSyncedAt
                  ? `Synced: ${new Date(mailbox.lastSyncedAt).toLocaleTimeString()}`
                  : "Never synced"}
              </span>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={testingId === mailbox.id || deletingId === mailbox.id}
                  onClick={() => handleVerify(mailbox.id)}
                  className="h-8 text-xs gap-1.5"
                >
                  <RefreshCw className={`size-3.5 ${testingId === mailbox.id ? "animate-spin" : ""}`} />
                  Test
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={testingId === mailbox.id || deletingId === mailbox.id}
                  onClick={() => handleDelete(mailbox.id)}
                  className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
