/**
 * Pure email rendering: merge-token personalization, signature append, and
 * RFC 8058 unsubscribe injection. No I/O — unit-tested in render.test.ts and
 * called by the per-recipient worker handler.
 *
 * Supported tokens: {{name}}, {{email}}, {{custom.<fieldKey>}}.
 * Unknown tokens render as empty string (never leak raw {{...}} to recipients).
 */

export interface RecipientContext {
  name: string;
  email: string;
  fields: Record<string, string>;
}

const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

export function personalize(text: string, ctx: RecipientContext): string {
  return text.replace(TOKEN, (_match, raw: string) => {
    const key = raw.trim();
    if (key === "name") return ctx.name ?? "";
    if (key === "email") return ctx.email ?? "";
    if (key.startsWith("custom.")) return ctx.fields[key.slice("custom.".length)] ?? "";
    return "";
  });
}

export interface RenderInput {
  subject: string;
  bodyHtml: string;
  signatureHtml?: string | null;
  recipient: RecipientContext;
  unsubscribeUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

export function renderCampaignEmail(input: RenderInput): RenderedEmail {
  const subject = personalize(input.subject, input.recipient);
  let html = personalize(input.bodyHtml, input.recipient);

  if (input.signatureHtml && input.signatureHtml.trim()) {
    html += `<br><br>${input.signatureHtml}`;
  }

  // Visible unsubscribe link (in addition to the List-Unsubscribe header).
  html +=
    `<br><br><hr><p style="font-size:12px;color:#666">` +
    `If you no longer wish to receive these emails, ` +
    `<a href="${input.unsubscribeUrl}">unsubscribe here</a>.</p>`;

  return { subject, html };
}

/** RFC 8058 one-click unsubscribe headers. */
export function unsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
