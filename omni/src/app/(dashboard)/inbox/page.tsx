import { Inbox, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function InboxPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Centralized reply-management and conversation history.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="size-5 text-primary" />
            Background Sync Status
          </CardTitle>
          <CardDescription>
            Monitoring inbound email bounces and NDR events.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-emerald-600">
            <ShieldCheck className="size-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Bounce Registry Active</p>
              <p className="text-xs text-emerald-600/80 mt-1">
                The sync worker is currently polling all connected mailboxes every 10 minutes, automatically processing Non-Delivery Reports (NDRs), updating suppressions, and updating recipient metrics.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-secondary/30 p-6 text-center">
            <h3 className="text-sm font-medium text-foreground">Interactive Conversations Coming Soon</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              Phase 3 Reply Management will enable direct, inline email messaging, automated reply classification, and AI-assisted drafting directly from this screen.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
