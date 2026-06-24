import { describe, it, expect } from "vitest";
import { personalize, renderCampaignEmail, unsubscribeHeaders, type RecipientContext } from "./render";

const ctx: RecipientContext = {
  name: "Jane Doe",
  email: "jane@acme.com",
  fields: { company: "Acme", region: "EU" },
};

describe("personalize", () => {
  it("replaces name, email, and custom.<key> tokens", () => {
    expect(personalize("Hi {{name}} ({{email}}) at {{custom.company}}", ctx)).toBe(
      "Hi Jane Doe (jane@acme.com) at Acme",
    );
  });
  it("tolerates whitespace inside tokens", () => {
    expect(personalize("Hello {{  name  }}", ctx)).toBe("Hello Jane Doe");
  });
  it("renders unknown tokens as empty (never leaks raw {{...}})", () => {
    expect(personalize("Region {{custom.unknown}}/{{bogus}}", ctx)).toBe("Region /");
  });
});

describe("renderCampaignEmail", () => {
  const base = {
    subject: "Update for {{name}}",
    bodyHtml: "<p>Hello {{name}}, news for {{custom.company}}.</p>",
    recipient: ctx,
    unsubscribeUrl: "https://app.example.com/unsubscribe/tok123",
  };

  it("personalizes subject and body", () => {
    const out = renderCampaignEmail(base);
    expect(out.subject).toBe("Update for Jane Doe");
    expect(out.html).toContain("Hello Jane Doe, news for Acme.");
  });

  it("appends the signature when present", () => {
    const out = renderCampaignEmail({ ...base, signatureHtml: "<p>— The Acme Team</p>" });
    expect(out.html).toContain("— The Acme Team");
  });

  it("always injects an unsubscribe link", () => {
    const out = renderCampaignEmail(base);
    expect(out.html).toContain('href="https://app.example.com/unsubscribe/tok123"');
    expect(out.html.toLowerCase()).toContain("unsubscribe");
  });
});

describe("unsubscribeHeaders", () => {
  it("emits RFC 8058 one-click headers", () => {
    const h = unsubscribeHeaders("https://app.example.com/unsubscribe/tok123");
    expect(h["List-Unsubscribe"]).toBe("<https://app.example.com/unsubscribe/tok123>");
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
