"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireProjectSessionForAction } from "@/lib/auth-helpers";

import { createTagSchema, updateTagSchema, idSchema as tagId } from "@/core/tags/tag.schema";
import * as tags from "@/core/tags/tag.service";
import { TagError } from "@/core/tags/tag.service";

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
  if (error instanceof TagError) {
    return { status: "error", message: error.message };
  }
  throw error;
}

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}/distributors`);
}

export async function createTagAction(
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await getActor(projectId);
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
  const actor = await getActor(projectId);
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
  const actor = await getActor(projectId);
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
