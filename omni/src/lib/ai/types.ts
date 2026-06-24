/**
 * AI provider abstraction (strategy pattern, mirroring the email transport).
 * v1 ships an Anthropic implementation only; others slot in behind this seam.
 */

export interface DraftRequest {
  /** Operator instructions, e.g. "Announce our Q3 distributor pricing update". */
  instructions: string;
  /** Optional current subject/body to revise rather than write from scratch. */
  currentSubject?: string;
  currentBodyHtml?: string;
  /** Light audience/tone context for grounding. */
  audience?: string;
  tone?: string;
}

export interface DraftResult {
  subject: string;
  /** Email-safe HTML body (sanitized by the caller before persistence). */
  bodyHtml: string;
}

export interface AiProvider {
  readonly name: string;
  draftCampaign(req: DraftRequest): Promise<DraftResult>;
}

export class AiUnavailableError extends Error {
  constructor(message = "AI drafting is not configured") {
    super(message);
    this.name = "AiUnavailableError";
  }
}
