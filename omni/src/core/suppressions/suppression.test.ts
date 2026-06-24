import { describe, it, expect } from "vitest";
import { reasonForEvent } from "./suppression.service";
import { sanitizeHtml } from "@/core/campaigns/drafting.service";

describe("reasonForEvent", () => {
  it("maps bounce + complaint events to suppression reasons", () => {
    expect(reasonForEvent("email.bounced")).toBe("bounce");
    expect(reasonForEvent("email.complained")).toBe("complaint");
  });
  it("returns null for non-suppressing events", () => {
    expect(reasonForEvent("email.delivered")).toBeNull();
    expect(reasonForEvent("email.opened")).toBeNull();
    expect(reasonForEvent("unknown")).toBeNull();
  });
});

describe("sanitizeHtml", () => {
  it("strips script/style blocks", () => {
    const out = sanitizeHtml('<p>ok</p><script>alert(1)</script><style>p{}</style>');
    expect(out).toContain("<p>ok</p>");
    expect(out).not.toMatch(/<script|<style/i);
  });
  it("removes inline event handlers", () => {
    const out = sanitizeHtml('<a href="#" onclick="steal()">x</a>');
    expect(out).not.toMatch(/onclick/i);
  });
  it("neutralizes javascript: urls", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/i);
  });
});
