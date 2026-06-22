import { writeAudit } from "@/lib/audit";
import * as repo from "./list.repository";
import type { ListRow, ListWithCount } from "./list.repository";
import type { CreateListInput, UpdateListInput } from "./list.schema";

export { type ListRow, type ListWithCount } from "./list.repository";

export class ListError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "conflict" = "conflict",
  ) {
    super(message);
    this.name = "ListError";
  }
}

interface Actor {
  userId: string;
  ipAddress?: string | null;
}

export function listLists(projectId: string): Promise<ListRow[]> {
  return repo.findAll(projectId);
}

export function listListsWithCounts(projectId: string): Promise<ListWithCount[]> {
  return repo.findAllWithCounts(projectId);
}

export async function createList(
  projectId: string,
  input: CreateListInput,
  actor: Actor,
): Promise<ListRow> {
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
