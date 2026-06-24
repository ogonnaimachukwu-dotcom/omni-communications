import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail } from "lucide-react";
import { getProject } from "@/core/projects/project.service";
import { idSchema } from "@/core/projects/project.schema";
import * as mailboxRepo from "@/core/mailboxes/mailbox.repository";
import { MailboxList } from "./_components/mailbox-list";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function ProjectMailboxesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const id = idSchema.safeParse(projectId);
  if (!id.success) notFound();

  const project = await getProject(id.data);
  if (!project) notFound();

  const dbMailboxes = await mailboxRepo.listByProject(project.id);
  const items = dbMailboxes.map((m) => ({
    id: m.id,
    email: m.email,
    provider: m.provider,
    status: m.status,
    lastSyncedAt: m.lastSyncedAt,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={`/projects/${project.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {project.name}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mailbox connections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect personal or corporate inbox credentials via OAuth for outreach.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 border-border bg-card">
          <CardHeader>
            <CardTitle>Connected Mailboxes</CardTitle>
            <CardDescription>Accounts available for campaigns in this project.</CardDescription>
          </CardHeader>
          <CardContent>
            <MailboxList projectId={project.id} initialMailboxes={items} />
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Connect New</CardTitle>
            <CardDescription>Authorize via secure OAuth protocol.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <a
              href={`/api/auth/oauth?provider=google&projectId=${project.id}`}
              className={cn(buttonVariants({ variant: "outline" }), "w-full justify-start gap-2.5")}
            >
              <Mail className="size-4 text-rose-500" />
              Connect Gmail
            </a>
            <a
              href={`/api/auth/oauth?provider=microsoft&projectId=${project.id}`}
              className={cn(buttonVariants({ variant: "outline" }), "w-full justify-start gap-2.5")}
            >
              <Mail className="size-4 text-blue-500" />
              Connect Outlook
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
