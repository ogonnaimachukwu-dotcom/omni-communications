import Link from "next/link";
import { StatusBadge } from "./status-badge";
import { RestoreButton } from "./restore-button";
import { EmptyState } from "./empty-state";
import { formatDate } from "@/lib/format";
import type { ProjectRow } from "@/core/projects/project.repository";

export function ProjectsTable({
  items,
  trash,
}: {
  items: ProjectRow[];
  trash: boolean;
}) {
  if (items.length === 0) {
    return <EmptyState trash={trash} />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-medium">Project</th>
            <th className="px-4 py-3 font-medium">CEO</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Updated</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {items.map((project) => (
            <tr
              key={project.id}
              className="border-b border-border transition-colors last:border-0 hover:bg-secondary/50"
            >
              <td className="px-4 py-3">
                {trash ? (
                  <div>
                    <div className="font-medium text-foreground">{project.name}</div>
                    {project.companyName && (
                      <div className="text-xs text-muted-foreground">{project.companyName}</div>
                    )}
                  </div>
                ) : (
                  <Link href={`/projects/${project.id}`} className="block">
                    <div className="font-medium text-foreground hover:text-primary">
                      {project.name}
                    </div>
                    {project.companyName && (
                      <div className="text-xs text-muted-foreground">{project.companyName}</div>
                    )}
                  </Link>
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{project.ceoName ?? "—"}</td>
              <td className="px-4 py-3">
                <StatusBadge status={project.status} />
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatDate(project.updatedAt)}
              </td>
              <td className="px-4 py-3 text-right">
                {trash ? (
                  <RestoreButton projectId={project.id} />
                ) : (
                  <Link
                    href={`/projects/${project.id}`}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    View
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
