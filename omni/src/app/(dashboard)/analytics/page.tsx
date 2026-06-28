import Link from "next/link";
import { ArrowRight, BarChart3 } from "lucide-react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { listProjects } from "@/core/projects/project.service";
import { parseListProjectsQuery } from "@/core/projects/project.schema";

export default async function AnalyticsHomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const query = parseListProjectsQuery({ pageSize: "50" });
  const { items } = await listProjects(query, session.user.id);


  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Choose a project to view its analytics.</p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          No projects yet.{" "}
          <Link href="/projects/new" className="text-primary hover:underline">Create one</Link> to get started.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}/analytics`}
                className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-secondary/50"
              >
                <span className="flex items-center gap-3">
                  <BarChart3 className="size-4 text-muted-foreground" />
                  <span>
                    <span className="font-medium">{p.name}</span>
                    {p.companyName && <span className="ml-2 text-sm text-muted-foreground">{p.companyName}</span>}
                  </span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
