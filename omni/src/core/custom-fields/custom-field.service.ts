import { writeAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import * as repo from "./custom-field.repository";
import type { CustomFieldRow } from "./custom-field.repository";
import type { FieldDef } from "./custom-field.schema";
import type { CreateCustomFieldInput, UpdateCustomFieldInput } from "./custom-field.schema";
import { getAccessibleProject } from "@/core/projects/project.service";

export { type CustomFieldRow } from "./custom-field.repository";

export class CustomFieldError extends AppError {
  constructor(
    message: string,
    code: "not_found" | "conflict" = "conflict",
    statusCode: number = 400,
  ) {
    super(message, code, statusCode);
    this.name = "CustomFieldError";
  }
}

interface Actor {
  userId: string;
  ipAddress?: string | null;
}

export async function listCustomFields(projectId: string, userId: string): Promise<CustomFieldRow[]> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) throw new CustomFieldError("Field not found", "not_found");
  return repo.findAll(projectId);
}

/** Returns simplified FieldDef array for the import engine. */
export async function fieldDefs(projectId: string, userId: string): Promise<FieldDef[]> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) throw new CustomFieldError("Field not found", "not_found");
  const rows = await repo.findAll(projectId);
  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    type: r.type,
    options: r.options ?? undefined,
  }));
}


export async function createCustomField(
  projectId: string,
  input: CreateCustomFieldInput,
  actor: Actor,
): Promise<CustomFieldRow> {
  const accessible = await getAccessibleProject(projectId, actor.userId);
  if (!accessible) throw new CustomFieldError("Field not found", "not_found");
  try {

    const created = await repo.create({
      projectId,
      key: input.key,
      label: input.label,
      type: input.type,
      options: input.options ?? null,
    });

    await writeAudit({
      actorUserId: actor.userId,
      projectId,
      action: "custom_field.created",
      entityType: "custom_field",
      entityId: created.id,
      metadata: { key: created.key, label: created.label },
      ipAddress: actor.ipAddress,
    });

    return created;
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505") {
      throw new CustomFieldError("A field with that key already exists", "conflict");
    }
    throw e;
  }
}

export async function updateCustomField(
  projectId: string,
  id: string,
  input: UpdateCustomFieldInput,
  actor: Actor,
): Promise<CustomFieldRow> {
  const accessible = await getAccessibleProject(projectId, actor.userId);
  if (!accessible) throw new CustomFieldError("Field not found", "not_found");
  const data: Record<string, unknown> = {};
  if (input.label !== undefined) data.label = input.label;
  if (input.type !== undefined) data.type = input.type;
  if (input.options !== undefined) data.options = input.options;

  const updated = await repo.update(projectId, id, data as Parameters<typeof repo.update>[2]);
  if (!updated) throw new CustomFieldError("Field not found", "not_found");

  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "custom_field.updated",
    entityType: "custom_field",
    entityId: id,
    ipAddress: actor.ipAddress,
  });

  return updated;
}

export async function deleteCustomField(
  projectId: string,
  id: string,
  actor: Actor,
): Promise<void> {
  const accessible = await getAccessibleProject(projectId, actor.userId);
  if (!accessible) throw new CustomFieldError("Field not found", "not_found");
  const deleted = await repo.remove(projectId, id);

  if (!deleted) throw new CustomFieldError("Field not found", "not_found");

  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "custom_field.deleted",
    entityType: "custom_field",
    entityId: id,
    ipAddress: actor.ipAddress,
  });
}
