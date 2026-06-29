"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireProjectSessionForAction } from "@/lib/auth-helpers";

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

export type FormState =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: Record<string, string[]> }
  | { status: "success"; message?: string };

type Actor = { userId: string; ipAddress: string | null };

async function getActor(projectId: string): Promise<Actor> {
  const h = await headers();
  const { actor } = await requireProjectSessionForAction(projectId, h);
  return actor;
}

function toFormError(error: unknown): FormState {
  if (error instanceof DistributorError) {
    return { status: "error", message: error.message };
  }
  throw error;
}

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}/distributors`);
}

function collectFields(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("field.") && typeof value === "string") {
      fields[key.slice("field.".length)] = value;
    }
  }
  return fields;
}

export async function createDistributorAction(
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await getActor(projectId);
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
  const actor = await getActor(projectId);
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

export async function bulkDistributorAction(
  projectId: string,
  raw: { action: string; ids: string[]; tagId?: string },
): Promise<FormState> {
  const actor = await getActor(projectId);
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
  const actor = await getActor(projectId);
  const query = parseListDistributorsQuery(rawQuery);
  return distributors.exportCsv(projectId, query, actor.userId);
}

export async function previewImportAction(
  projectId: string,
  listId: string,
  fileText: string,
  mapping?: ImportMapping,
) {
  const actor = await getActor(projectId);
  try {
    const preview = await distributors.previewImport(projectId, listId, fileText, actor.userId, mapping);
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
  const actor = await getActor(projectId);
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
