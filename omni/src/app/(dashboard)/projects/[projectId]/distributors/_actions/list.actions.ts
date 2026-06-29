"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireProjectSessionForAction } from "@/lib/auth-helpers";

import { createListSchema, updateListSchema, idSchema as listId } from "@/core/distributors/list.schema";
import * as lists from "@/core/distributors/list.service";
import { ListError } from "@/core/distributors/list.service";

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

async function getActor(projectId: string): Promise<Actor> {
  const h = await headers();
  const { actor } = await requireProjectSessionForAction(projectId, h);
  return actor;
}

function toFormError(error: unknown): FormState {
  if (error instanceof ListError || error instanceof CustomFieldError) {
    return { status: "error", message: error.message };
  }
  throw error;
}

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}/distributors`);
}

/* ---- Lists ------------------------------------------------------------ */

export async function createListAction(
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await getActor(projectId);
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
  const actor = await getActor(projectId);
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
  const actor = await getActor(projectId);
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

/* ---- Custom fields ---------------------------------------------------- */

export async function createCustomFieldAction(
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await getActor(projectId);
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
  const actor = await getActor(projectId);
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
  const actor = await getActor(projectId);
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
