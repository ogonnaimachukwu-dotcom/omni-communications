"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireProjectSessionForAction } from "@/lib/auth-helpers";

import {
  createCampaignSchema,
  updateCampaignSchema,
  sendCampaignSchema,
  draftCampaignSchema,
  idSchema,
} from "@/core/campaigns/campaign.schema";
import * as campaigns from "@/core/campaigns/campaign.service";
import { CampaignError } from "@/core/campaigns/campaign.service";
import { draftCampaign as runDraft } from "@/core/campaigns/drafting.service";
import { AiUnavailableError } from "@/lib/ai";

import {
  createSignatureSchema,
  idSchema as signatureId,
} from "@/core/signatures/signature.schema";
import * as signatures from "@/core/signatures/signature.service";
import { SignatureError } from "@/core/signatures/signature.service";

export type FormState =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: Record<string, string[]> }
  | { status: "success"; message?: string };

export type DraftState =
  | { status: "idle" }
  | { status: "error"; message?: string }
  | { status: "success"; subject: string; bodyHtml: string };

type Actor = { userId: string; ipAddress: string | null };

async function getActor(projectId: string): Promise<Actor> {
  const h = await headers();
  const { actor } = await requireProjectSessionForAction(projectId, h);
  return actor;
}

function toFormError(error: unknown): FormState {
  if (error instanceof CampaignError || error instanceof SignatureError) {
    return { status: "error", message: error.message };
  }
  throw error;
}

function basePath(projectId: string) {
  return `/projects/${projectId}/campaigns`;
}

/* ---------------- Campaign CRUD ---------------- */

export async function createCampaignAction(
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = createCampaignSchema.safeParse({
    subject: formData.get("subject") ?? "",
    bodyHtml: formData.get("bodyHtml") ?? "",
    previewText: formData.get("previewText") ?? "",
    listId: formData.get("listId") ?? "",
    sendingDomainId: formData.get("sendingDomainId") ?? "",
    signatureId: formData.get("signatureId") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await getActor(projectId);
  let id: string;
  try {
    const row = await campaigns.createCampaign(projectId, parsed.data, actor);
    id = row.id;
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(basePath(projectId));
  redirect(`${basePath(projectId)}/${id}`);
}

export async function updateCampaignAction(
  projectId: string,
  campaignId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const idCheck = idSchema.safeParse(campaignId);
  if (!idCheck.success) return { status: "error", message: "Invalid campaign" };

  const parsed = updateCampaignSchema.safeParse({
    subject: formData.get("subject") ?? "",
    bodyHtml: formData.get("bodyHtml") ?? "",
    previewText: formData.get("previewText") ?? "",
    listId: formData.get("listId") ?? "",
    sendingDomainId: formData.get("sendingDomainId") ?? "",
    signatureId: formData.get("signatureId") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await getActor(projectId);
  try {
    await campaigns.updateCampaign(projectId, campaignId, parsed.data, actor);
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`${basePath(projectId)}/${campaignId}`);
  return { status: "success", message: "Saved" };
}

export async function approveCampaignAction(
  projectId: string,
  campaignId: string,
): Promise<FormState> {
  const actor = await getActor(projectId);
  try {
    await campaigns.approveCampaign(projectId, campaignId, actor);
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`${basePath(projectId)}/${campaignId}`);
  return { status: "success", message: "Approved" };
}

export async function sendCampaignAction(
  projectId: string,
  campaignId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = sendCampaignSchema.safeParse({
    tagId: formData.get("tagId") ?? "",
    subscription: formData.get("subscription") || undefined,
    scheduledAt: formData.get("scheduledAt") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await getActor(projectId);
  try {
    await campaigns.sendCampaign(projectId, campaignId, parsed.data, actor);
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`${basePath(projectId)}/${campaignId}`);
  return { status: "success", message: parsed.data.scheduledAt ? "Scheduled" : "Sending" };
}

export async function cancelScheduleAction(
  projectId: string,
  campaignId: string,
): Promise<FormState> {
  const actor = await getActor(projectId);
  try {
    await campaigns.cancelSchedule(projectId, campaignId, actor);
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`${basePath(projectId)}/${campaignId}`);
  return { status: "success", message: "Schedule cancelled" };
}

export async function deleteCampaignAction(
  projectId: string,
  campaignId: string,
): Promise<void> {
  const actor = await getActor(projectId);
  await campaigns.deleteCampaign(projectId, campaignId, actor);
  revalidatePath(basePath(projectId));
  redirect(basePath(projectId));
}

/* ---------------- AI drafting ---------------- */

export async function draftCampaignAction(
  projectId: string,
  _prev: DraftState,
  formData: FormData,
): Promise<DraftState> {
  const parsed = draftCampaignSchema.safeParse({
    instructions: formData.get("instructions") ?? "",
    tone: formData.get("tone") || undefined,
    audience: formData.get("audience") || undefined,
    currentSubject: formData.get("currentSubject") || undefined,
    currentBodyHtml: formData.get("currentBodyHtml") || undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: "Describe what you want to say" };
  }
  const actor = await getActor(projectId);
  try {
    const draft = await runDraft(projectId, parsed.data, actor);
    return { status: "success", subject: draft.subject, bodyHtml: draft.bodyHtml };
  } catch (e) {
    if (e instanceof AiUnavailableError) {
      return { status: "error", message: "AI drafting isn't configured on this server." };
    }
    return { status: "error", message: "Draft generation failed. Try again." };
  }
}

/* ---------------- Signatures ---------------- */

export async function createSignatureAction(
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = createSignatureSchema.safeParse({
    name: formData.get("name") ?? "",
    html: formData.get("html") ?? "",
    isDefault: formData.get("isDefault") === "on",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await getActor(projectId);
  try {
    await signatures.createSignature(projectId, parsed.data, actor);
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(basePath(projectId));
  return { status: "success", message: "Signature created" };
}

export async function deleteSignatureAction(projectId: string, formData: FormData): Promise<void> {
  const check = signatureId.safeParse(formData.get("id"));
  if (!check.success) return;
  const actor = await getActor(projectId);
  await signatures.deleteSignature(projectId, check.data, actor);
  revalidatePath(basePath(projectId));
}
