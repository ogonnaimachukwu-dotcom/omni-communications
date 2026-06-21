"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  createProjectSchema,
  updateProjectSchema,
  setStatusSchema,
  idSchema,
} from "@/core/projects/project.schema";
import * as projectService from "@/core/projects/project.service";
import { ProjectError, type Actor } from "@/core/projects/project.service";

/**
 * Server Actions for the projects module. These stay thin by design:
 * resolve the actor (auth), validate input (zod), delegate to the service,
 * revalidate affected paths, and translate domain errors into form state.
 * All business rules live in the service; none here.
 */

export type FormState =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: Record<string, string[]> }
  | { status: "success"; message?: string };

async function getActor(): Promise<Actor> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) redirect("/login");
  const ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return { userId: session.user.id, ipAddress };
}

function toFormError(error: unknown): FormState {
  if (error instanceof ProjectError) {
    return { status: "error", message: error.message };
  }
  throw error;
}

export async function createProjectAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await getActor();

  const parsed = createProjectSchema.safeParse({
    name: formData.get("name"),
    companyName: formData.get("companyName"),
    ceoName: formData.get("ceoName"),
    notes: formData.get("notes"),
    status: formData.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let projectId: string;
  try {
    const project = await projectService.createProject(parsed.data, actor);
    projectId = project.id;
  } catch (error) {
    return toFormError(error);
  }

  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

export async function updateProjectAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await getActor();

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Invalid project." };

  const parsed = updateProjectSchema.safeParse({
    name: formData.get("name"),
    companyName: formData.get("companyName"),
    ceoName: formData.get("ceoName"),
    notes: formData.get("notes"),
    status: formData.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await projectService.updateProject(id.data, parsed.data, actor);
  } catch (error) {
    return toFormError(error);
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${id.data}`);
  revalidatePath(`/projects/${id.data}/settings`);
  return { status: "success", message: "Changes saved." };
}

export async function setProjectStatusAction(
  projectId: string,
  status: "active" | "archived",
): Promise<FormState> {
  const actor = await getActor();

  const id = idSchema.safeParse(projectId);
  const st = setStatusSchema.safeParse({ status });
  if (!id.success || !st.success) return { status: "error", message: "Invalid request." };

  try {
    await projectService.setProjectStatus(id.data, st.data.status, actor);
  } catch (error) {
    return toFormError(error);
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${id.data}`);
  return { status: "success" };
}

export async function softDeleteProjectAction(projectId: string): Promise<FormState> {
  const actor = await getActor();

  const id = idSchema.safeParse(projectId);
  if (!id.success) return { status: "error", message: "Invalid project." };

  try {
    await projectService.softDeleteProject(id.data, actor);
  } catch (error) {
    return toFormError(error);
  }

  revalidatePath("/projects");
  redirect("/projects");
}

export async function restoreProjectAction(projectId: string): Promise<FormState> {
  const actor = await getActor();

  const id = idSchema.safeParse(projectId);
  if (!id.success) return { status: "error", message: "Invalid project." };

  try {
    await projectService.restoreProject(id.data, actor);
  } catch (error) {
    return toFormError(error);
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${id.data}`);
  return { status: "success" };
}
