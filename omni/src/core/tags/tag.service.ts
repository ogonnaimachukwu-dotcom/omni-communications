import { writeAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import * as repo from "./tag.repository";
import type { TagRow, TagWithCount } from "./tag.repository";
import type { CreateTagInput, UpdateTagInput } from "./tag.schema";
import { getAccessibleProject } from "@/core/projects/project.service";

export { type TagRow, type TagWithCount } from "./tag.repository";

export class TagError extends AppError {
  constructor(
    message: string,
    code: "not_found" | "conflict" = "conflict",
    statusCode: number = 400,
  ) {
    super(message, code, statusCode);
    this.name = "TagError";
  }
}

interface Actor {
  userId: string;
  ipAddress?: string | null;
}

export async function listTags(projectId: string, userId: string): Promise<TagRow[]> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) throw new TagError("Tag not found", "not_found");
  return repo.findAll(projectId);
}

export async function listTagsWithCounts(projectId: string, userId: string): Promise<TagWithCount[]> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) throw new TagError("Tag not found", "not_found");
  return repo.findAllWithCounts(projectId);
}

export async function createTag(
  projectId: string,
  input: CreateTagInput,
  actor: Actor,
): Promise<TagRow> {
  const accessible = await getAccessibleProject(projectId, actor.userId);
  if (!accessible) throw new TagError("Tag not found", "not_found");
  try {
    const created = await repo.create({
      projectId,
      name: input.name,
      color: input.color ?? null,
    });

    await writeAudit({
      actorUserId: actor.userId,
      projectId,
      action: "tag.created",
      entityType: "tag",
      entityId: created.id,
      metadata: { name: created.name },
      ipAddress: actor.ipAddress,
    });

    return created;
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505") {
      throw new TagError("A tag with that name already exists", "conflict");
    }
    throw e;
  }
}

export async function updateTag(
  projectId: string,
  id: string,
  input: UpdateTagInput,
  actor: Actor,
): Promise<TagRow> {
  const accessible = await getAccessibleProject(projectId, actor.userId);
  if (!accessible) throw new TagError("Tag not found", "not_found");
  try {
    const updated = await repo.update(projectId, id, {
      name: input.name,
      color: input.color ?? null,
    });
    if (!updated) throw new TagError("Tag not found", "not_found");

    await writeAudit({
      actorUserId: actor.userId,
      projectId,
      action: "tag.updated",
      entityType: "tag",
      entityId: id,
      metadata: { name: input.name },
      ipAddress: actor.ipAddress,
    });

    return updated;
  } catch (e: unknown) {
    if (e instanceof TagError) throw e;
    if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505") {
      throw new TagError("A tag with that name already exists", "conflict");
    }
    throw e;
  }
}

export async function deleteTag(
  projectId: string,
  id: string,
  actor: Actor,
): Promise<void> {
  const accessible = await getAccessibleProject(projectId, actor.userId);
  if (!accessible) throw new TagError("Tag not found", "not_found");
  const deleted = await repo.remove(projectId, id);
  if (!deleted) throw new TagError("Tag not found", "not_found");

  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "tag.deleted",
    entityType: "tag",
    entityId: id,
    ipAddress: actor.ipAddress,
  });
}
