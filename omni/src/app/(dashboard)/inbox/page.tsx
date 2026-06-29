import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { listProjects } from "@/core/projects/project.service";
import Link from "next/link";
import { Inbox, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default async function InboxPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // Query projects for user
  const { items } = await listProjects({ page: 1, pageSize: 10, trash: false }, session.user.id);

  if (items.length > 0) {
    // Redirect to the first project's inbox workspace
    redirect(`/projects/${items[0].id}/inbox`);
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-20 text-center">
      <div className="size-16 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex items-center justify-center text-indigo-400 mx-auto">
        <Inbox className="size-8" />
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Reply Center</h1>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Please create or select a Project to access its dedicated inbound Reply Center workspace.
        </p>
      </div>
      <div>
        <Link href="/projects/new" className={buttonVariants()}>
          <Plus className="size-4 mr-1.5" />
          Create Project
        </Link>
      </div>
    </div>
  );
}

