import { db } from "@/db";
import { writeAudit } from "@/lib/audit";
import * as repo from "./signature.repository";
import type { SignatureRow } from "./signature.repository";
import type { CreateSignatureInput, UpdateSignatureInput } from "./signature.schema";
import { getAccessibleProject } from "@/core/projects/project.service";

export class SignatureError extends Error {
  constructor(message: string, public readonly code: "not_found" = "not_found") {
    super(message);
    this.name = "SignatureError";
  }
}

export interface Actor {
  userId: string;
  ipAddress?: string | null;
}

export async function listSignatures(projectId: string, userId: string): Promise<SignatureRow[]> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) throw new SignatureError("Signature not found");
  return repo.listByProject(projectId);
}

export async function getSignature(projectId: string, id: string, userId: string): Promise<SignatureRow | null> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) return null;
  return repo.findById(projectId, id);
}

export async function createSignature(
  projectId: string,
  input: CreateSignatureInput,
  actor: Actor,
): Promise<SignatureRow> {
  const accessible = await getAccessibleProject(projectId, actor.userId);
  if (!accessible) throw new SignatureError("Signature not found");
  const row = await db.transaction((tx) => repo.create(projectId, input, tx));

  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "signature.created",
    entityType: "signature",
    entityId: row.id,
    metadata: { name: row.name },
    ipAddress: actor.ipAddress,
  });
  return row;
}

export async function updateSignature(
  projectId: string,
  id: string,
  input: UpdateSignatureInput,
  actor: Actor,
): Promise<SignatureRow> {
  const accessible = await getAccessibleProject(projectId, actor.userId);
  if (!accessible) throw new SignatureError("Signature not found");
  const row = await db.transaction((tx) => repo.update(projectId, id, input, tx));

  if (!row) throw new SignatureError("Signature not found");
  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "signature.updated",
    entityType: "signature",
    entityId: id,
    ipAddress: actor.ipAddress,
  });
  return row;
}

export async function deleteSignature(projectId: string, id: string, actor: Actor): Promise<void> {
  const accessible = await getAccessibleProject(projectId, actor.userId);
  if (!accessible) throw new SignatureError("Signature not found");
  await repo.remove(projectId, id);

  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "signature.deleted",
    entityType: "signature",
    entityId: id,
    ipAddress: actor.ipAddress,
  });
}
