import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireProject } from "@/core/projects/project.service";
import { idSchema } from "@/core/projects/project.schema";
import { db } from "@/db";
import { projectMembers, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { InboxClientView } from "./_components/inbox-client-view";

export default async function ProjectInboxPage({
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

  // Get active project team members for assignments dropdown
  const teamMembers = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
    })
    .from(projectMembers)
    .innerJoin(user, eq(projectMembers.userId, user.id))
    .where(eq(projectMembers.projectId, project.id));

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <InboxClientView
        projectId={project.id}
        projectName={project.name}
        teamMembers={teamMembers}
        currentUser={session.user}
      />
    </div>
  );
}
