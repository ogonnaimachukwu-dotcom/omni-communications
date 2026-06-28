import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { idSchema } from "@/core/projects/project.schema";
import { requireProject } from "@/core/projects/project.service";
import { parseListDistributorsQuery } from "@/core/distributors/distributor.schema";
import { listDistributors } from "@/core/distributors/distributor.service";
import { listLists, listListsWithCounts } from "@/core/distributors/list.service";
import { listTags, listTagsWithCounts } from "@/core/tags/tag.service";
import { listCustomFields } from "@/core/custom-fields/custom-field.service";
import { DistributorsToolbar } from "./_components/distributors-toolbar";
import { DistributorsClient } from "./_components/distributors-client";
import { ManageButton } from "./_components/managers";

export default async function DistributorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  const query = parseListDistributorsQuery(await searchParams);

  const [page, lists, listsWithCounts, tags, tagsWithCounts, fieldDefs] = await Promise.all([
    listDistributors(project.id, query, session.user.id),
    listLists(project.id, session.user.id),
    listListsWithCounts(project.id, session.user.id),
    listTags(project.id, session.user.id),
    listTagsWithCounts(project.id, session.user.id),
    listCustomFields(project.id, session.user.id),
  ]);

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${project.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {project.name}
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Distributors</h1>
          <p className="text-sm text-muted-foreground">
            Contacts, lists, tags, and custom fields for {project.name}.
          </p>
        </div>
        <div className="flex gap-2">
          <ManageButton
            projectId={project.id}
            lists={listsWithCounts}
            tags={tagsWithCounts}
            fieldDefs={fieldDefs}
          />
          <Link
            href={`/projects/${project.id}/distributors/import`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-card px-3 text-sm font-medium transition-colors hover:bg-secondary"
          >
            <Upload className="size-4" />
            Import CSV
          </Link>
        </div>
      </header>

      <DistributorsToolbar lists={lists} tags={tags} />

      <DistributorsClient
        projectId={project.id}
        items={page.items}
        view={query.view}
        page={page.page}
        pageCount={page.pageCount}
        total={page.total}
        lists={lists}
        tags={tags}
        fieldDefs={fieldDefs}
      />
    </div>
  );
}
