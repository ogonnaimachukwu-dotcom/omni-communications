import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { idSchema } from "@/core/projects/project.schema";
import { requireProject } from "@/core/projects/project.service";
import { ProjectForm } from "../../_components/project-form";
import { DangerZone } from "../../_components/danger-zone";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const id = idSchema.safeParse(projectId);
  if (!id.success) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  let project;
  try {
    project = await requireProject(id.data, session.user.id);
  } catch {
    notFound();
  }


  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={`/projects/${project.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {project.name}
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Project settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update details, change status, or delete this project.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Information about the company and CEO.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectForm
            mode="edit"
            project={{
              id: project.id,
              name: project.name,
              companyName: project.companyName,
              ceoName: project.ceoName,
              notes: project.notes,
              status: project.status,
            }}
          />
        </CardContent>
      </Card>

      <DangerZone projectId={project.id} projectName={project.name} />
    </div>
  );
}
