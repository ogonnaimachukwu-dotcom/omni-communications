import { redirect } from "next/navigation";

export default async function ProjectMailboxesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/communication`);
}
