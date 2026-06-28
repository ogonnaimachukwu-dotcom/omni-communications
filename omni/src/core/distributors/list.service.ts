import { writeAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import * as repo from "./list.repository";
import type { ListRow, ListWithCount } from "./list.repository";
import type { CreateListInput, UpdateListInput } from "./list.schema";
import { getAccessibleProject } from "@/core/projects/project.service";

export { type ListRow, type ListWithCount } from "./list.repository";

export class ListError extends AppError {
  constructor(
    message: string,
    code: "not_found" | "conflict" = "conflict",
    statusCode: number = 400,
  ) {
    super(message, code, statusCode);
    this.name = "ListError";
  }
}

interface Actor {
  userId: string;
  ipAddress?: string | null;
}

export async function listLists(projectId: string, userId: string): Promise<ListRow[]> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) throw new ListError("List not found", "not_found");
  return repo.findAll(projectId);
}

export async function listListsWithCounts(projectId: string, userId: string): Promise<ListWithCount[]> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) throw new ListError("List not found", "not_found");
  return repo.findAllWithCounts(projectId);
}

export async function createList(
  projectId: string,
  input: CreateListInput,
  actor: Actor,
): Promise<ListRow> {
  const accessible = await getAccessibleProject(projectId, actor.userId);
  if (!accessible) throw new ListError("List not found", "not_found");
  const created = await repo.create({

    projectId,
    name: input.name,
    description: input.description ?? null,
  });

  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "list.created",
    entityType: "distributor_list",
    entityId: created.id,
    metadata: { name: created.name },
    ipAddress: actor.ipAddress,
  });

  return created;
}

export async function updateList(
  projectId: string,
  id: string,
  input: UpdateListInput,
  actor: Actor,
): Promise<ListRow> {
  const accessible = await getAccessibleProject(projectId, actor.userId);
  if (!accessible) throw new ListError("List not found", "not_found");
  const updated = await repo.update(projectId, id, {

    name: input.name,
    description: input.description ?? null,
  });
  if (!updated) throw new ListError("List not found", "not_found");

  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "list.updated",
    entityType: "distributor_list",
    entityId: id,
    metadata: { name: input.name },
    ipAddress: actor.ipAddress,
  });

  return updated;
}

export async function deleteList(
  projectId: string,
  id: string,
  actor: Actor,
): Promise<void> {
  const accessible = await getAccessibleProject(projectId, actor.userId);
  if (!accessible) throw new ListError("List not found", "not_found");
  const deleted = await repo.softDelete(projectId, id);

  if (!deleted) throw new ListError("List not found", "not_found");

  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "list.deleted",
    entityType: "distributor_list",
    entityId: id,
    ipAddress: actor.ipAddress,
  });
}
