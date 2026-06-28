import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { requireProject } from "@/core/projects/project.service";
import { resolveClientIpFromHeaders } from "./client-ip";
import { AppError } from "./errors";
import type { ProjectRow } from "@/core/projects/project.repository";

export interface ProjectSessionContext {
  session: {
    session: unknown;
    user: unknown;
  };
  user: {
    id: string;
    email: string;
    [key: string]: unknown;
  };
  project: ProjectRow;
  actor: {
    userId: string;
    ipAddress: string;
  };
}

/**
 * Resolves user session and verifies project access, throwing an AppError if unauthenticated or unauthorized.
 * Ideal for Server Components, layouts, and page loaders.
 */
export async function requireProjectSession(projectId: string): Promise<ProjectSessionContext> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) {
    throw new AppError("Unauthorized", "unauthorized", 401);
  }
  const project = await requireProject(projectId, session.user.id);
  const ipAddress = resolveClientIpFromHeaders(h);

  return {
    session,
    user: session.user,
    project,
    actor: {
      userId: session.user.id,
      ipAddress,
    },
  };
}

/**
 * Resolves user session and verifies project access using supplied action headers.
 * Ideal for Server Actions.
 */
export async function requireProjectSessionForAction(
  projectId: string,
  actionHeaders: Headers,
): Promise<ProjectSessionContext> {
  const session = await auth.api.getSession({ headers: actionHeaders });
  if (!session) {
    throw new AppError("Unauthorized", "unauthorized", 401);
  }
  const project = await requireProject(projectId, session.user.id);
  const ipAddress = resolveClientIpFromHeaders(actionHeaders);

  return {
    session,
    user: session.user,
    project,
    actor: {
      userId: session.user.id,
      ipAddress,
    },
  };
}
