import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { listProjects } from "@/core/projects/project.service";
import { parseListProjectsQuery } from "@/core/projects/project.schema";
import { ProjectsToolbar } from "./_components/projects-toolbar";
import { ProjectsTable } from "./_components/projects-table";
import { Pagination } from "./_components/pagination";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseListProjectsQuery(await searchParams);
  const { items, total, page, pageCount } = await listProjects(query);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {query.trash
              ? "Deleted projects you can restore."
              : "Companies and CEOs you send on behalf of."}
          </p>
        </div>
        <Link href="/projects/new" className={buttonVariants()}>
          <Plus className="size-4" />
          New project
        </Link>
      </header>

      <ProjectsToolbar />

      <ProjectsTable items={items} trash={query.trash} />

      {pageCount > 1 && <Pagination page={page} pageCount={pageCount} total={total} />}
    </div>
  );
}
