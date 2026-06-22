import { describe, it, expect } from "vitest";
import { validateCustomValue, type FieldDef } from "./custom-field.schema";

const def = (type: FieldDef["type"], options?: string[]): FieldDef => ({
  key: "f",
  label: "Field",
  type,
  options,
});

describe("validateCustomValue", () => {
  it("treats empty input as valid empty (optional)", () => {
    expect(validateCustomValue(def("number"), "")).toEqual({ ok: true, value: "" });
    expect(validateCustomValue(def("date"), "   ")).toEqual({ ok: true, value: "" });
  });

  it("text: accepts and trims, rejects overly long", () => {
    expect(validateCustomValue(def("text"), "  hello ")).toEqual({ ok: true, value: "hello" });
    const long = validateCustomValue(def("text"), "x".repeat(1001));
    expect(long.ok).toBe(false);
  });

  it("number: canonicalizes and rejects non-numbers", () => {
    expect(validateCustomValue(def("number"), "42")).toEqual({ ok: true, value: "42" });
    expect(validateCustomValue(def("number"), "1,000")).toMatchObject({ ok: false });
    expect(validateCustomValue(def("number"), "abc")).toMatchObject({ ok: false });
  });

  it("date: normalizes to ISO yyyy-mm-dd and rejects garbage", () => {
    expect(validateCustomValue(def("date"), "2026-01-15")).toEqual({ ok: true, value: "2026-01-15" });
    expect(validateCustomValue(def("date"), "not-a-date")).toMatchObject({ ok: false });
  });

  it("boolean: coerces common truthy/falsey tokens", () => {
    for (const t of ["true", "yes", "1", "Y"]) {
      expect(validateCustomValue(def("boolean"), t)).toEqual({ ok: true, value: "true" });
    }
    for (const f of ["false", "no", "0", "N"]) {
      expect(validateCustomValue(def("boolean"), f)).toEqual({ ok: true, value: "false" });
    }
    expect(validateCustomValue(def("boolean"), "maybe")).toMatchObject({ ok: false });
  });

  it("select: matches case-insensitively and returns the canonical option", () => {
    const d = def("select", ["Gold", "Silver"]);
    expect(validateCustomValue(d, "gold")).toEqual({ ok: true, value: "Gold" });
    expect(validateCustomValue(d, "Bronze")).toMatchObject({ ok: false });
  });
});
