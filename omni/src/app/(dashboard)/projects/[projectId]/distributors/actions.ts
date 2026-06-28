"use server";

import * as distributorActions from "./_actions/distributor.actions";
import * as tagActions from "./_actions/tag.actions";
import * as listActions from "./_actions/list.actions";
import type { ImportMapping } from "@/core/distributors/import";

export type FormState = distributorActions.FormState;

export async function createDistributorAction(
  projectId: string,
  prev: FormState,
  formData: FormData,
) {
  return distributorActions.createDistributorAction(projectId, prev, formData);
}

export async function updateDistributorAction(
  projectId: string,
  prev: FormState,
  formData: FormData,
) {
  return distributorActions.updateDistributorAction(projectId, prev, formData);
}

export async function bulkDistributorAction(
  projectId: string,
  raw: { action: string; ids: string[]; tagId?: string },
) {
  return distributorActions.bulkDistributorAction(projectId, raw);
}

export async function exportDistributorsAction(
  projectId: string,
  rawQuery: Record<string, string | undefined>,
) {
  return distributorActions.exportDistributorsAction(projectId, rawQuery);
}

export async function previewImportAction(
  projectId: string,
  listId: string,
  fileText: string,
  mapping?: ImportMapping,
) {
  return distributorActions.previewImportAction(projectId, listId, fileText, mapping);
}

export async function commitImportAction(
  projectId: string,
  raw: unknown,
  fileText: string,
) {
  return distributorActions.commitImportAction(projectId, raw, fileText);
}

export async function createTagAction(
  projectId: string,
  prev: FormState,
  formData: FormData,
) {
  return tagActions.createTagAction(projectId, prev, formData);
}

export async function updateTagAction(
  projectId: string,
  prev: FormState,
  formData: FormData,
) {
  return tagActions.updateTagAction(projectId, prev, formData);
}

export async function deleteTagAction(projectId: string, id: string) {
  return tagActions.deleteTagAction(projectId, id);
}

export async function createListAction(
  projectId: string,
  prev: FormState,
  formData: FormData,
) {
  return listActions.createListAction(projectId, prev, formData);
}

export async function updateListAction(
  projectId: string,
  prev: FormState,
  formData: FormData,
) {
  return listActions.updateListAction(projectId, prev, formData);
}

export async function deleteListAction(projectId: string, id: string) {
  return listActions.deleteListAction(projectId, id);
}

export async function createCustomFieldAction(
  projectId: string,
  prev: FormState,
  formData: FormData,
) {
  return listActions.createCustomFieldAction(projectId, prev, formData);
}

export async function updateCustomFieldAction(
  projectId: string,
  prev: FormState,
  formData: FormData,
) {
  return listActions.updateCustomFieldAction(projectId, prev, formData);
}

export async function deleteCustomFieldAction(projectId: string, id: string) {
  return listActions.deleteCustomFieldAction(projectId, id);
}
