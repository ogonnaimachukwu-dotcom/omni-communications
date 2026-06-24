import * as repo from "./sending-domain.repository";
import type { SendingDomainRow } from "./sending-domain.repository";

export function listSendingDomains(projectId: string): Promise<SendingDomainRow[]> {
  return repo.listByProject(projectId);
}

export function listVerifiedSendingDomains(projectId: string): Promise<SendingDomainRow[]> {
  return repo.listVerified(projectId);
}
