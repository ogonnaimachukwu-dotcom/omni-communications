import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/env";
import type { AiProvider, DraftRequest, DraftResult } from "../types";

/**
 * Anthropic drafting provider. Single-shot generation (decision: inline, not
 * streamed, for v1). The model is env-configurable so it can be updated without
 * a code change; it falls back to a current default.
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model ?? env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
  }

  async draftCampaign(req: DraftRequest): Promise<DraftResult> {
    const system =
      "You are an expert B2B email copywriter drafting a single broadcast email " +
      "for a company's distributors. Return ONLY a JSON object with keys " +
      '"subject" and "bodyHtml". The bodyHtml must be simple, email-safe inline ' +
      "HTML (p, strong, em, ul, li, a, br only) — no scripts, styles, head, or " +
      "body tags. Keep it concise and professional. You may use the merge tokens " +
      "{{name}} and {{email}} where a personalized greeting helps.";

    const parts: string[] = [`Instructions: ${req.instructions}`];
    if (req.audience) parts.push(`Audience: ${req.audience}`);
    if (req.tone) parts.push(`Tone: ${req.tone}`);
    if (req.currentSubject) parts.push(`Current subject to revise: ${req.currentSubject}`);
    if (req.currentBodyHtml) parts.push(`Current body to revise:\n${req.currentBodyHtml}`);

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: parts.join("\n\n") }],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return parseDraft(text);
  }
}

/** Tolerant parse: accept raw JSON or a ```json fenced block. */
function parseDraft(text: string): DraftResult {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const obj = JSON.parse(cleaned) as Partial<DraftResult>;
    return {
      subject: typeof obj.subject === "string" ? obj.subject : "",
      bodyHtml: typeof obj.bodyHtml === "string" ? obj.bodyHtml : "",
    };
  } catch {
    // Fallback: treat the whole response as the body, leave subject blank.
    return { subject: "", bodyHtml: `<p>${escapeHtml(text)}</p>` };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
