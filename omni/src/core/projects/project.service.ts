import { writeAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import * as repo from "./project.repository";
import type { ProjectRow, ProjectStats, PagedProjects } from "./project.repository";
import type {
  CreateProjectInput,
  UpdateProjectInput,
  ListProjectsQuery,
  ProjectStatus,
} from "./project.schema";

/**
 * Project domain service. This is the single home for project business rules;
 * Server Actions and (later) the worker both call through here. Every mutation
 * leaves an audit trail via the foundation's append-only log (src/lib/audit).
 *
 * Audit + write are sequential rather than transactional: the audit log is
 * append-only and non-blocking, and at single-operator scale a rare orphaned
 * write is preferable to coupling every mutation to a transaction. Swap to a
 * tx wrapper here if that tradeoff ever changes.
 */

export type ProjectErrorCode = "not_found" | "forbidden" | "conflict";

export class ProjectError extends AppError {
  constructor(
    message: string,
    code: ProjectErrorCode = "conflict",
    statusCode: number = 400,
  ) {
    super(message, code, statusCode);
    this.name = "ProjectError";
  }
}

export interface Actor {
  userId: string;
  ipAddress?: string | null;
}

/* ---- Reads ------------------------------------------------------------ */

export function listProjects(query: ListProjectsQuery, userId: string): Promise<PagedProjects> {
  return repo.list(query, userId);
}

export function getAccessibleProject(id: string, userId: string): Promise<ProjectRow | null> {
  if (!userId || !id || !uuidRegex.test(id)) return Promise.resolve(null);
  return repo.findAccessibleProject(id, userId);
}

export async function getAccessibleProjectStats(id: string, userId: string): Promise<ProjectStats> {
  const accessible = await getAccessibleProject(id, userId);
  if (!accessible) throw new ProjectError("Project not found", "not_found");
  return repo.stats(id);
}

/* ---- Mutations -------------------------------------------------------- */

export async function createProject(
  input: CreateProjectInput,
  actor: Actor,
): Promise<ProjectRow> {
  const project = await repo.create({ ...input, ownerId: actor.userId });
  await writeAudit({
    actorUserId: actor.userId,
    projectId: project.id,
    action: "project.created",
    entityType: "project",
    entityId: project.id,
    metadata: { name: project.name },
    ipAddress: actor.ipAddress,
  });
  return project;
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput,
  actor: Actor,
): Promise<ProjectRow> {
  const existing = await repo.findAccessibleProject(id, actor.userId);
  if (!existing) throw new ProjectError("Project not found", "not_found");

  const updated = await repo.update(id, actor.userId, input);
  if (!updated) throw new ProjectError("Project not found", "not_found");

  await writeAudit({
    actorUserId: actor.userId,
    projectId: id,
    action: "project.updated",
    entityType: "project",
    entityId: id,
    metadata: { name: updated.name, status: updated.status },
    ipAddress: actor.ipAddress,
  });
  return updated;
}

export async function setProjectStatus(
  id: string,
  status: ProjectStatus,
  actor: Actor,
): Promise<ProjectRow> {
  const existing = await repo.findAccessibleProject(id, actor.userId);
  if (!existing) throw new ProjectError("Project not found", "not_found");
  if (existing.status === status) return existing; // no-op, nothing to audit

  const updated = await repo.setStatus(id, actor.userId, status);
  if (!updated) throw new ProjectError("Project not found", "not_found");

  await writeAudit({
    actorUserId: actor.userId,
    projectId: id,
    action: "project.status_changed",
    entityType: "project",
    entityId: id,
    metadata: { from: existing.status, to: status },
    ipAddress: actor.ipAddress,
  });
  return updated;
}

export async function softDeleteProject(id: string, actor: Actor): Promise<ProjectRow> {
  const existing = await repo.findAccessibleProject(id, actor.userId);
  if (!existing) throw new ProjectError("Project not found", "not_found");

  const deleted = await repo.softDelete(id, actor.userId);
  if (!deleted) throw new ProjectError("Project not found", "not_found");

  await writeAudit({
    actorUserId: actor.userId,
    projectId: id,
    action: "project.deleted",
    entityType: "project",
    entityId: id,
    metadata: { name: deleted.name },
    ipAddress: actor.ipAddress,
  });
  return deleted;
}

export async function restoreProject(id: string, actor: Actor): Promise<ProjectRow> {
  const existing = await repo.findAccessibleProject(id, actor.userId, { includeDeleted: true });
  if (!existing) throw new ProjectError("Project not found", "not_found");
  if (!existing.deletedAt) throw new ProjectError("Project is not deleted", "conflict");

  const restored = await repo.restore(id, actor.userId);
  if (!restored) throw new ProjectError("Project not found", "not_found");

  await writeAudit({
    actorUserId: actor.userId,
    projectId: id,
    action: "project.restored",
    entityType: "project",
    entityId: id,
    metadata: { name: restored.name },
    ipAddress: actor.ipAddress,
  });
  return restored;
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requireProject(projectId: string, userId: string): Promise<ProjectRow> {
  if (!userId) {
    throw new ProjectError("Forbidden", "forbidden");
  }
  if (!projectId || !uuidRegex.test(projectId)) {
    throw new ProjectError("Project not found", "not_found");
  }
  const isMember = await repo.isMember(projectId, userId);
  if (!isMember) {
    const exists = await repo.checkProjectExistsOnly(projectId);
    if (!exists) {
      throw new ProjectError("Project not found", "not_found");
    }
    throw new ProjectError("Forbidden", "forbidden");
  }
  const project = await repo.findAccessibleProject(projectId, userId);
  if (!project) {
    throw new ProjectError("Project not found", "not_found");
  }
  return project;
}

// Deprecated in favor of requireProject
export const authorizeProjectAccess = requireProject;


