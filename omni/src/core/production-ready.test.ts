import { describe, it, expect } from "vitest";
import { resolveClientIp } from "@/lib/client-ip";
import { sanitizeHtml, getSanitizationFailuresCount } from "@/lib/sanitizer";
import { trace } from "@/lib/tracing";

describe("Production Ready Telemetry & Hardening Tests", () => {
  describe("Client IP Resolution", () => {
    it("prioritizes CF-Connecting-IP over other headers", () => {
      const req = new Request("http://localhost", {
        headers: {
          "cf-connecting-ip": "1.1.1.1",
          "x-real-ip": "2.2.2.2",
          "x-forwarded-for": "3.3.3.3",
        },
      });
      expect(resolveClientIp(req)).toBe("1.1.1.1");
    });

    it("prioritizes X-Real-IP over X-Forwarded-For", () => {
      const req = new Request("http://localhost", {
        headers: {
          "x-real-ip": "2.2.2.2",
          "x-forwarded-for": "3.3.3.3",
        },
      });
      expect(resolveClientIp(req)).toBe("2.2.2.2");
    });

    it("does not trust X-Forwarded-For by default (no TRUST_PROXY)", () => {
      const originalEnv = process.env.TRUST_PROXY;
      delete process.env.TRUST_PROXY;
      const req = new Request("http://localhost", {
        headers: {
          "x-forwarded-for": "3.3.3.3",
        },
      });
      expect(resolveClientIp(req)).toBe("127.0.0.1"); // Fallback since socket IP is undefined
      process.env.TRUST_PROXY = originalEnv;
    });

    it("trusts first hop of X-Forwarded-For if TRUST_PROXY=true", () => {
      const originalEnv = process.env.TRUST_PROXY;
      process.env.TRUST_PROXY = "true";
      const req = new Request("http://localhost", {
        headers: {
          "x-forwarded-for": "3.3.3.3, 4.4.4.4",
        },
      });
      expect(resolveClientIp(req)).toBe("3.3.3.3");
      process.env.TRUST_PROXY = originalEnv;
    });

    it("walks proxy chain right-to-left and filters out trusted proxies", () => {
      const originalEnv = process.env.TRUST_PROXY;
      process.env.TRUST_PROXY = "10.0.0.1, 10.0.0.2";
      const req = new Request("http://localhost", {
        headers: {
          "x-forwarded-for": "8.8.8.8, 10.0.0.2, 10.0.0.1",
        },
      });
      expect(resolveClientIp(req)).toBe("8.8.8.8");
      process.env.TRUST_PROXY = originalEnv;
    });
  });

  describe("HTML Sanitizer", () => {
    it("strips script tags and event handlers", () => {
      const input = `<div>Hello <script>alert('xss')</script><img src="x" onerror="alert('xss')"> world</div>`;
      const output = sanitizeHtml(input);
      expect(output).not.toContain("<script>");
      expect(output).not.toContain("onerror");
      expect(output).toContain("Hello");
      expect(output).toContain("world");
    });

    it("strips javascript: URLs", () => {
      const input = `<a href="javascript:alert('xss')">Link</a>`;
      const output = sanitizeHtml(input);
      expect(output).not.toContain("javascript:");
      expect(output).toContain("Link");
    });

    it("preserves layout styles and classes", () => {
      const input = `<div style="text-align: center; color: red;" class="p-4">Content</div>`;
      const output = sanitizeHtml(input);
      expect(output).toContain(`style="text-align:center;color:red"`);
      expect(output).toContain(`class="p-4"`);
    });

    it("increments sanitization failures count when removing dangerous attributes", () => {
      const initialCount = getSanitizationFailuresCount();
      sanitizeHtml(`<img src="x" onerror="alert(1)">`);
      expect(getSanitizationFailuresCount()).toBeGreaterThan(initialCount);
    });
  });

  describe("Lightweight Tracing", () => {
    it("resolves nested span relationships via AsyncLocalStorage", async () => {
      await trace("parent", async (parentSpan) => {
        expect(parentSpan.name).toBe("parent");
        expect(parentSpan.parentId).toBeUndefined();

        await trace("child", async (childSpan) => {
          expect(childSpan.name).toBe("child");
          expect(childSpan.parentId).toBe(parentSpan.id);
        });
      });
    });
  });
});
