import { writeAudit } from "@/lib/audit";
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

export type ProjectErrorCode = "not_found" | "conflict";

export class ProjectError extends Error {
  constructor(
    message: string,
    public readonly code: ProjectErrorCode = "conflict",
  ) {
    super(message);
    this.name = "ProjectError";
  }
}

export interface Actor {
  userId: string;
  ipAddress?: string | null;
}

/* ---- Reads ------------------------------------------------------------ */

export function listProjects(query: ListProjectsQuery): Promise<PagedProjects> {
  return repo.list(query);
}

export function getProject(id: string): Promise<ProjectRow | null> {
  return repo.findById(id);
}

export function getProjectStats(id: string): Promise<ProjectStats> {
  return repo.stats(id);
}

/* ---- Mutations -------------------------------------------------------- */

export async function createProject(
  input: CreateProjectInput,
  actor: Actor,
): Promise<ProjectRow> {
  const project = await repo.create(input);
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
  const existing = await repo.findById(id);
  if (!existing) throw new ProjectError("Project not found", "not_found");

  const updated = await repo.update(id, input);
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
  const existing = await repo.findById(id);
  if (!existing) throw new ProjectError("Project not found", "not_found");
  if (existing.status === status) return existing; // no-op, nothing to audit

  const updated = await repo.setStatus(id, status);
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
  const existing = await repo.findById(id);
  if (!existing) throw new ProjectError("Project not found", "not_found");

  const deleted = await repo.softDelete(id);
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
  const existing = await repo.findById(id, { includeDeleted: true });
  if (!existing) throw new ProjectError("Project not found", "not_found");
  if (!existing.deletedAt) throw new ProjectError("Project is not deleted", "conflict");

  const restored = await repo.restore(id);
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
