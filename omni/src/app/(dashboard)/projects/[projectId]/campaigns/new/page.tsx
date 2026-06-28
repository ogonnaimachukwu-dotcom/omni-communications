import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ArrowLeft } from "lucide-react";
import { idSchema as projectIdSchema } from "@/core/projects/project.schema";
import { requireProject } from "@/core/projects/project.service";
import { NewCampaignForm } from "../_components/new-campaign-form";
import { createCampaignAction } from "../actions";

export default async function NewCampaignPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const pid = projectIdSchema.safeParse(projectId);
  if (!pid.success) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  let project;
  try {
    project = await requireProject(pid.data, session.user.id);
  } catch {
    notFound();
  }


  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${project.id}/campaigns`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Campaigns
      </Link>
      <h1 className="text-xl font-semibold">New campaign</h1>
      <NewCampaignForm createAction={createCampaignAction.bind(null, project.id)} />
    </div>
  );
}
