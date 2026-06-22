"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

import {
  createDistributorSchema,
  updateDistributorSchema,
  idSchema,
  bulkActionSchema,
  parseListDistributorsQuery,
} from "@/core/distributors/distributor.schema";
import * as distributors from "@/core/distributors/distributor.service";
import { DistributorError } from "@/core/distributors/distributor.service";
import { commitImportSchema } from "@/core/distributors/import.schema";
import type { ImportMapping } from "@/core/distributors/import";

import { createListSchema, updateListSchema, idSchema as listId } from "@/core/distributors/list.schema";
import * as lists from "@/core/distributors/list.service";
import { ListError } from "@/core/distributors/list.service";

import { createTagSchema, updateTagSchema, idSchema as tagId } from "@/core/tags/tag.schema";
import * as tags from "@/core/tags/tag.service";
import { TagError } from "@/core/tags/tag.service";

import {
  createCustomFieldSchema,
  updateCustomFieldSchema,
  idSchema as fieldId,
} from "@/core/custom-fields/custom-field.schema";
import * as customFields from "@/core/custom-fields/custom-field.service";
import { CustomFieldError } from "@/core/custom-fields/custom-field.service";

export type FormState =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: Record<string, string[]> }
  | { status: "success"; message?: string };

type Actor = { userId: string; ipAddress: string | null };

async function getActor(): Promise<Actor> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) redirect("/login");
  const ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return { userId: session.user.id, ipAddress };
}

function toFormError(error: unknown): FormState {
  if (
    error instanceof DistributorError ||
    error instanceof ListError ||
    error instanceof TagError ||
    error instanceof CustomFieldError
  ) {
    return { status: "error", message: error.message };
  }
  throw error;
}

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}/distributors`);
}

/** Collect dynamic `field.<key>` inputs into a fields record. */
function collectFields(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("field.") && typeof value === "string") {
      fields[key.slice("field.".length)] = value;
    }
  }
  return fields;
}

/* ---- Distributor CRUD ------------------------------------------------- */

export async function createDistributorAction(
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await getActor();
  const parsed = createDistributorSchema.safeParse({
    listId: formData.get("listId"),
    email: formData.get("email"),
    name: formData.get("name"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    fields: collectFields(formData),
    tagIds: formData.getAll("tagIds"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    await distributors.createDistributor(projectId, parsed.data, actor);
  } catch (error) {
    return toFormError(error);
  }
  revalidate(projectId);
  return { status: "success", message: "Distributor added." };
}

export async function updateDistributorAction(
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await getActor();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Invalid distributor." };

  const parsed = updateDistributorSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    fields: collectFields(formData),
    tagIds: formData.getAll("tagIds"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    await distributors.updateDistributor(projectId, id.data, parsed.data, actor);
  } catch (error) {
    return toFormError(error);
  }
  revalidate(projectId);
  return { status: "success", message: "Changes saved." };
}

/* ---- Bulk + export ---------------------------------------------------- */

export async function bulkDistributorAction(
  projectId: string,
  raw: { action: string; ids: string[]; tagId?: string },
): Promise<FormState> {
  const actor = await getActor();
  const parsed = bulkActionSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  let count = 0;
  try {
    count = await distributors.bulkAction(projectId, parsed.data, actor);
  } catch (error) {
    return toFormError(error);
  }
  revalidate(projectId);
  return { status: "success", message: `${count} distributor(s) updated.` };
}

export async function exportDistributorsAction(
  projectId: string,
  rawQuery: Record<string, string | undefined>,
): Promise<{ filename: string; csv: string }> {
  await getActor();
  const query = parseListDistributorsQuery(rawQuery);
  return distributors.exportCsv(projectId, query);
}

/* ---- Import ----------------------------------------------------------- */

export async function previewImportAction(
  projectId: string,
  listId: string,
  fileText: string,
  mapping?: ImportMapping,
) {
  await getActor();
  try {
    const preview = await distributors.previewImport(projectId, listId, fileText, mapping);
    return { ok: true as const, preview };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read the file.";
    return { ok: false as const, message };
  }
}

export async function commitImportAction(
  projectId: string,
  raw: unknown,
  fileText: string,
) {
  const actor = await getActor();
  const parsed = commitImportSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Invalid import." };
  }
  try {
    const result = await distributors.commitImport(projectId, parsed.data, fileText, actor);
    revalidate(projectId);
    return { ok: true as const, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    return { ok: false as const, message };
  }
}

/* ---- Lists ------------------------------------------------------------ */

export async function createListAction(
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await getActor();
  const parsed = createListSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await lists.createList(projectId, parsed.data, actor);
  } catch (error) {
    return toFormError(error);
  }
  revalidate(projectId);
  return { status: "success", message: "List created." };
}

export async function updateListAction(
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await getActor();
  const id = listId.safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Invalid list." };
  const parsed = updateListSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await lists.updateList(projectId, id.data, parsed.data, actor);
  } catch (error) {
    return toFormError(error);
  }
  revalidate(projectId);
  return { status: "success", message: "List updated." };
}

export async function deleteListAction(projectId: string, id: string): Promise<FormState> {
  const actor = await getActor();
  const parsed = listId.safeParse(id);
  if (!parsed.success) return { status: "error", message: "Invalid list." };
  try {
    await lists.deleteList(projectId, parsed.data, actor);
  } catch (error) {
    return toFormError(error);
  }
  revalidate(projectId);
  return { status: "success", message: "List deleted." };
}

/* ---- Tags ------------------------------------------------------------- */

export async function createTagAction(
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await getActor();
  const parsed = createTagSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await tags.createTag(projectId, parsed.data, actor);
  } catch (error) {
    return toFormError(error);
  }
  revalidate(projectId);
  return { status: "success", message: "Tag created." };
}

export async function updateTagAction(
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await getActor();
  const id = tagId.safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Invalid tag." };
  const parsed = updateTagSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await tags.updateTag(projectId, id.data, parsed.data, actor);
  } catch (error) {
    return toFormError(error);
  }
  revalidate(projectId);
  return { status: "success", message: "Tag updated." };
}

export async function deleteTagAction(projectId: string, id: string): Promise<FormState> {
  const actor = await getActor();
  const parsed = tagId.safeParse(id);
  if (!parsed.success) return { status: "error", message: "Invalid tag." };
  try {
    await tags.deleteTag(projectId, parsed.data, actor);
  } catch (error) {
    return toFormError(error);
  }
  revalidate(projectId);
  return { status: "success", message: "Tag deleted." };
}

/* ---- Custom fields ---------------------------------------------------- */

export async function createCustomFieldAction(
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await getActor();
  const optionsRaw = String(formData.get("options") ?? "").trim();
  const options = optionsRaw ? optionsRaw.split("\n").map((s) => s.trim()).filter(Boolean) : undefined;
  const parsed = createCustomFieldSchema.safeParse({
    key: formData.get("key"),
    label: formData.get("label"),
    type: formData.get("type") ?? undefined,
    options,
  });
  if (!parsed.success) return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await customFields.createCustomField(projectId, parsed.data, actor);
  } catch (error) {
    return toFormError(error);
  }
  revalidate(projectId);
  return { status: "success", message: "Field created." };
}

export async function updateCustomFieldAction(
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await getActor();
  const id = fieldId.safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Invalid field." };
  const optionsRaw = String(formData.get("options") ?? "").trim();
  const options = optionsRaw ? optionsRaw.split("\n").map((s) => s.trim()).filter(Boolean) : undefined;
  const parsed = updateCustomFieldSchema.safeParse({
    label: formData.get("label"),
    type: formData.get("type"),
    options,
  });
  if (!parsed.success) return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await customFields.updateCustomField(projectId, id.data, parsed.data, actor);
  } catch (error) {
    return toFormError(error);
  }
  revalidate(projectId);
  return { status: "success", message: "Field updated." };
}

export async function deleteCustomFieldAction(projectId: string, id: string): Promise<FormState> {
  const actor = await getActor();
  const parsed = fieldId.safeParse(id);
  if (!parsed.success) return { status: "error", message: "Invalid field." };
  try {
    await customFields.deleteCustomField(projectId, parsed.data, actor);
  } catch (error) {
    return toFormError(error);
  }
  revalidate(projectId);
  return { status: "success", message: "Field deleted." };
}
