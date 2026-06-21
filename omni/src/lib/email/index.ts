import type { EmailTransport } from "./types";
import { ResendTransport } from "./transports/resend";

/**
 * Transport factory. Phase 1 always returns Resend. In Phase 2 this resolves
 * per-project sending config (mailbox vs Resend vs SES) to the right adapter.
 */
export function getTransport(): EmailTransport {
  return new ResendTransport();
}

export * from "./types";
