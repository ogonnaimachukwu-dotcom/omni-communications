import { env } from "@/env";
import type { AiProvider } from "./types";
import { AnthropicProvider } from "./providers/anthropic";

export * from "./types";

/**
 * Resolve the active AI provider, or null when AI isn't configured.
 * ANTHROPIC_API_KEY is optional, so callers must handle the null case and
 * disable AI features rather than crash.
 */
export function getAiProvider(): AiProvider | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
}

export function isAiConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}
