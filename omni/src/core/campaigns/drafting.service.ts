import { writeAudit } from "@/lib/audit";
import { getAiProvider, AiUnavailableError } from "@/lib/ai";
import type { DraftCampaignInput } from "./campaign.schema";
import { getAccessibleProject } from "@/core/projects/project.service";

export interface Actor {
  userId: string;
  ipAddress?: string | null;
}

export interface CampaignDraft {
  subject: string;
  bodyHtml: string;
}

/**
 * Generate a campaign draft via the configured AI provider. Throws
 * AiUnavailableError when no key is set (the UI hides the feature in that case).
 * AI output HTML is sanitized before it can reach the editor / body_html.
 */
export async function draftCampaign(
  projectId: string,
  input: DraftCampaignInput,
  actor: Actor,
): Promise<CampaignDraft> {
  const accessible = await getAccessibleProject(projectId, actor.userId);
  if (!accessible) throw new Error("Project access denied");

  const provider = getAiProvider();

  if (!provider) throw new AiUnavailableError();

  const result = await provider.draftCampaign({
    instructions: input.instructions,
    tone: input.tone,
    audience: input.audience,
    currentSubject: input.currentSubject,
    currentBodyHtml: input.currentBodyHtml,
  });

  const bodyHtml = sanitizeHtml(result.bodyHtml);

  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "campaign.drafted",
    entityType: "campaign",
    metadata: { provider: provider.name, chars: bodyHtml.length },
    ipAddress: actor.ipAddress,
  });

  return { subject: result.subject.slice(0, 500), bodyHtml };
}

/**
 * Minimal email-HTML sanitizer: removes script/style blocks, inline event
 * handlers, and javascript: URLs. The operator still reviews before approval;
 * this is defense-in-depth against the model emitting unsafe markup.
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"')
    .trim();
}
