"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import * as repo from "@/core/mailboxes/mailbox.repository";
import * as service from "@/core/mailboxes/mailbox.service";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

import { requireProject } from "@/core/projects/project.service";

async function assertSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  return session;
}

export async function removeMailbox(projectId: string, id: string): Promise<void> {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const existing = await repo.findById(id);
  if (!existing || existing.projectId !== projectId) {
    throw new Error("Mailbox not found");
  }

  await repo.remove(id);

  await writeAudit({
    actorUserId: session.user.id,
    projectId,
    action: "mailbox.deleted",
    entityType: "mailbox",
    entityId: id,
    metadata: { email: existing.email },
  });

  revalidatePath(`/projects/${projectId}/mailboxes`);
}

export async function verifyMailbox(projectId: string, id: string): Promise<boolean> {
  const session = await assertSession();
  await requireProject(projectId, session.user.id);

  const existing = await repo.findById(id);
  if (!existing || existing.projectId !== projectId) {
    throw new Error("Mailbox not found");
  }


  const success = await service.testConnection(id);

  await writeAudit({
    actorUserId: session.user.id,
    projectId,
    action: "mailbox.tested",
    entityType: "mailbox",
    entityId: id,
    metadata: { email: existing.email, success },
  });

  revalidatePath(`/projects/${projectId}/mailboxes`);
  return success;
}
