import { writeAudit } from "@/lib/audit";
import { getBoss } from "@/lib/queue";
import { QUEUES, type SendCampaignJob } from "@/lib/queue/jobs";
import * as repo from "./campaign.repository";
import type { CampaignRow, PagedCampaigns } from "./campaign.repository";
import type {
  CreateCampaignInput,
  UpdateCampaignInput,
  ListCampaignsQuery,
  SendCampaignInput,
} from "./campaign.schema";

export type CampaignErrorCode = "not_found" | "invalid_state" | "validation";

export class CampaignError extends Error {
  constructor(message: string, public readonly code: CampaignErrorCode = "invalid_state") {
    super(message);
    this.name = "CampaignError";
  }
}

export interface Actor {
  userId: string;
  ipAddress?: string | null;
}

export function listCampaigns(projectId: string, query: ListCampaignsQuery): Promise<PagedCampaigns> {
  return repo.list(projectId, query);
}

export function getCampaign(projectId: string, id: string): Promise<CampaignRow | null> {
  return repo.findById(projectId, id);
}

export async function createCampaign(
  projectId: string,
  input: CreateCampaignInput,
  actor: Actor,
): Promise<CampaignRow> {
  const row = await repo.create(projectId, input);
  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "campaign.created",
    entityType: "campaign",
    entityId: row.id,
    ipAddress: actor.ipAddress,
  });
  return row;
}

export async function updateCampaign(
  projectId: string,
  id: string,
  input: UpdateCampaignInput,
  actor: Actor,
): Promise<CampaignRow> {
  const existing = await repo.findById(projectId, id);
  if (!existing) throw new CampaignError("Campaign not found", "not_found");
  if (existing.status !== "draft") {
    throw new CampaignError("Only draft campaigns can be edited", "invalid_state");
  }
  const row = await repo.update(projectId, id, input);
  if (!row) throw new CampaignError("Campaign not found", "not_found");
  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "campaign.updated",
    entityType: "campaign",
    entityId: id,
    ipAddress: actor.ipAddress,
  });
  return row;
}

export async function approveCampaign(projectId: string, id: string, actor: Actor): Promise<CampaignRow> {
  const existing = await repo.findById(projectId, id);
  if (!existing) throw new CampaignError("Campaign not found", "not_found");
  if (existing.status !== "draft") {
    throw new CampaignError("Only draft campaigns can be approved", "invalid_state");
  }
  if (!existing.subject.trim() || !existing.bodyHtml.trim()) {
    throw new CampaignError("Add a subject and body before approving", "validation");
  }
  const row = await repo.setStatus(projectId, id, {
    status: "approved",
    approvedAt: new Date(),
    approvedBy: actor.userId,
  });
  if (!row) throw new CampaignError("Campaign not found", "not_found");
  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "campaign.approved",
    entityType: "campaign",
    entityId: id,
    ipAddress: actor.ipAddress,
  });
  return row;
}

/**
 * Send now or schedule. Requires an approved campaign with a list and a sending
 * identity. The audience refinement rides in the job payload (frozen at run).
 */
export async function sendCampaign(
  projectId: string,
  id: string,
  input: SendCampaignInput,
  actor: Actor,
): Promise<CampaignRow> {
  const existing = await repo.findById(projectId, id);
  if (!existing) throw new CampaignError("Campaign not found", "not_found");
  if (existing.status !== "approved") {
    throw new CampaignError("Approve the campaign before sending", "invalid_state");
  }
  if (!existing.listId) throw new CampaignError("Select a distributor list first", "validation");
  if (!existing.sendingDomainId) throw new CampaignError("Select a sending domain first", "validation");

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
    throw new CampaignError("Scheduled time must be in the future", "validation");
  }

  if (scheduledAt) {
    await repo.setStatus(projectId, id, { status: "scheduled", scheduledAt });
  }

  const boss = await getBoss();
  await boss.createQueue(QUEUES.SEND_CAMPAIGN);
  await boss.send(
    QUEUES.SEND_CAMPAIGN,
    { campaignId: id, projectId, tagId: input.tagId, subscription: input.subscription } satisfies SendCampaignJob,
    { singletonKey: id, ...(scheduledAt ? { startAfter: scheduledAt } : {}) },
  );

  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: scheduledAt ? "campaign.scheduled" : "campaign.send_requested",
    entityType: "campaign",
    entityId: id,
    metadata: { scheduledAt: scheduledAt?.toISOString() ?? null, tagId: input.tagId ?? null },
    ipAddress: actor.ipAddress,
  });

  const row = await repo.findById(projectId, id);
  return row!;
}

/** Revert a scheduled campaign to draft so the pending job becomes a no-op. */
export async function cancelSchedule(projectId: string, id: string, actor: Actor): Promise<CampaignRow> {
  const existing = await repo.findById(projectId, id);
  if (!existing) throw new CampaignError("Campaign not found", "not_found");
  if (existing.status !== "scheduled") {
    throw new CampaignError("Only scheduled campaigns can be cancelled", "invalid_state");
  }
  const row = await repo.setStatus(projectId, id, {
    status: "draft",
    scheduledAt: null,
    approvedAt: null,
    approvedBy: null,
  });
  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "campaign.cancelled",
    entityType: "campaign",
    entityId: id,
    ipAddress: actor.ipAddress,
  });
  return row!;
}

export async function deleteCampaign(projectId: string, id: string, actor: Actor): Promise<void> {
  await repo.softDelete(projectId, id);
  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "campaign.deleted",
    entityType: "campaign",
    entityId: id,
    ipAddress: actor.ipAddress,
  });
}

export async function restoreCampaign(projectId: string, id: string, actor: Actor): Promise<void> {
  await repo.restore(projectId, id);
  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "campaign.restored",
    entityType: "campaign",
    entityId: id,
    ipAddress: actor.ipAddress,
  });
}
