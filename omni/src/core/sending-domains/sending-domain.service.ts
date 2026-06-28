import * as repo from "./sending-domain.repository";
import type { SendingDomainRow } from "./sending-domain.repository";
import { getAccessibleProject } from "@/core/projects/project.service";

export async function listSendingDomains(projectId: string, userId: string): Promise<SendingDomainRow[]> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) throw new Error("Project access denied");
  return repo.listByProject(projectId);
}

export async function listVerifiedSendingDomains(projectId: string, userId: string): Promise<SendingDomainRow[]> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) throw new Error("Project access denied");
  return repo.listVerified(projectId);
}

