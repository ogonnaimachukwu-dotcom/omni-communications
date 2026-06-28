import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ArrowLeft, Mail, Send, Activity, Settings2, ShieldCheck, Plus, Trash, Check } from "lucide-react";
import { requireProject } from "@/core/projects/project.service";
import { idSchema } from "@/core/projects/project.schema";
import * as repo from "@/core/communication/communication.repository";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CommunicationClientView } from "./_components/communication-client-view";

export default async function ProjectCommunicationPage({
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

  // Fetch all entities
  const sendingList = await repo.listSendingProvidersByProject(project.id, session.user.id);
  const inboxList = await repo.listInboxConnectionsByProject(project.id, session.user.id);
  const trackingList = await repo.listTrackingProvidersByProject(project.id, session.user.id);
  const profilesList = await repo.listCommunicationProfilesByProject(project.id, session.user.id);

  // Map to simple lists for client view
  const senders = sendingList.map(s => ({
    id: s.id,
    name: s.name,
    type: s.type,
    status: s.status,
  }));

  const inboxes = inboxList.map(i => ({
    id: i.id,
    email: i.email,
    type: i.type,
    status: i.status,
    lastSyncedAt: i.lastSyncedAt,
  }));

  const trackers = trackingList.map(t => ({
    id: t.id,
    name: t.name,
    type: t.type,
    status: t.status,
  }));

  const profiles = profilesList.map(p => ({
    id: p.id,
    name: p.name,
    sendingProviderId: p.sendingProviderId,
    inboxConnectionId: p.inboxConnectionId,
    trackingProviderId: p.trackingProviderId,
    signatureId: p.signatureId,
    dailyLimit: p.dailyLimit,
    replyAlias: p.replyAlias,
    timezone: p.timezone,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={`/projects/${project.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        {project.name}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Communication Engine</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure isolated sending providers, IMAP inbox replies sync, webhook tracking, and profile limits.
          </p>
        </div>
      </div>

      <CommunicationClientView
        projectId={project.id}
        initialSenders={senders}
        initialInboxes={inboxes}
        initialTrackers={trackers}
        initialProfiles={profiles}
      />
    </div>
  );
}
