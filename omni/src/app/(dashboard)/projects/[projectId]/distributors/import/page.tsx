import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { idSchema } from "@/core/projects/project.schema";
import { getProject } from "@/core/projects/project.service";
import { listLists } from "@/core/distributors/list.service";
import { listCustomFields } from "@/core/custom-fields/custom-field.service";
import { ImportWizard } from "../_components/import-wizard";

export default async function ImportPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const id = idSchema.safeParse(projectId);
  if (!id.success) notFound();

  const project = await getProject(id.data);
  if (!project) notFound();

  const [lists, fieldDefs] = await Promise.all([
    listLists(project.id),
    listCustomFields(project.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={`/projects/${project.id}/distributors`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Distributors
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Import distributors</h1>
        <p className="text-sm text-muted-foreground">
          Upload a CSV, map its columns, review the preview, then import.
        </p>
      </header>

      {lists.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Create a list first on the Distributors page — imports load into a list.
        </p>
      ) : (
        <ImportWizard projectId={project.id} lists={lists} fieldDefs={fieldDefs} />
      )}
    </div>
  );
}
