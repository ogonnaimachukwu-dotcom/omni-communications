import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { idSchema as projectIdSchema } from "@/core/projects/project.schema";
import { getProject } from "@/core/projects/project.service";
import { parseListCampaignsQuery } from "@/core/campaigns/campaign.schema";
import { listCampaigns } from "@/core/campaigns/campaign.service";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default async function CampaignsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const pid = projectIdSchema.safeParse(projectId);
  if (!pid.success) notFound();
  const project = await getProject(pid.data);
  if (!project) notFound();

  const query = parseListCampaignsQuery(await searchParams);
  const page = await listCampaigns(project.id, query);

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${project.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {project.name}
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Campaigns</h1>
        <Link
          href={`/projects/${project.id}/campaigns/new`}
          className={cn(buttonVariants({ size: "sm" }))}
        >
          <Plus className="size-4" /> New campaign
        </Link>
      </div>

      {page.items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No campaigns yet. Create your first one.
        </Card>
      ) : (
        <Card className="divide-y">
          {page.items.map((c) => (
            <Link
              key={c.id}
              href={`/projects/${project.id}/campaigns/${c.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-muted/50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{c.subject || "Untitled campaign"}</p>
                <p className="text-xs text-muted-foreground">
                  {c.totalRecipients > 0
                    ? `${c.sentCount}/${c.totalRecipients} sent · ${c.deliveredCount} delivered`
                    : "Not sent yet"}
                </p>
              </div>
              <Badge>{c.status}</Badge>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
