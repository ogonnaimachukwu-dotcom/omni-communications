import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Settings2, Users, Send } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { idSchema } from "@/core/projects/project.schema";
import { getProject, getProjectStats } from "@/core/projects/project.service";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import { StatusBadge } from "../_components/status-badge";
import { KpiCards } from "../_components/kpi-cards";
import { StatusToggle } from "../_components/status-toggle";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const id = idSchema.safeParse(projectId);
  if (!id.success) notFound();

  const project = await getProject(id.data);
  if (!project) notFound();

  const stats = await getProjectStats(project.id);

  return (
    <div className="space-y-8">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Projects
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          {project.companyName && (
            <p className="text-sm text-muted-foreground">{project.companyName}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusToggle projectId={project.id} status={project.status} />
          <Link
            href={`/projects/${project.id}/distributors`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Users className="size-4" />
            Distributors
          </Link>
          <Link
            href={`/projects/${project.id}/campaigns`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Send className="size-4" />
            Campaigns
          </Link>
          <Link
            href={`/projects/${project.id}/settings`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Settings2 className="size-4" />
            Settings
          </Link>
        </div>
      </header>

      <KpiCards stats={stats} />

      <section className="grid gap-6 md:grid-cols-2">
        <Detail label="CEO" value={project.ceoName} />
        <Detail label="Company" value={project.companyName} />
        <Detail label="Created" value={formatDate(project.createdAt)} />
        <Detail label="Last updated" value={formatDateTime(project.updatedAt)} />
      </section>

      {project.notes && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Notes
          </h2>
          <p className="whitespace-pre-wrap rounded-lg border border-border bg-card p-4 text-sm text-foreground">
            {project.notes}
          </p>
        </section>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}
