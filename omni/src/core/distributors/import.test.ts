import { describe, it, expect } from "vitest";
import {
  parseCsv,
  suggestMapping,
  deriveName,
  classifyRows,
  selectForCommit,
  type ImportMapping,
} from "./import";
import type { FieldDef } from "@/core/custom-fields/custom-field.schema";

const defs: FieldDef[] = [
  { key: "company", label: "Company", type: "text" },
  { key: "tier", label: "Tier", type: "select", options: ["Gold", "Silver"] },
  { key: "seats", label: "Seats", type: "number" },
];

const mapping: ImportMapping = {
  email: "Email",
  name: "Name",
  firstName: "First",
  lastName: "Last",
  fields: { company: "Company", tier: "Tier", seats: "Seats" },
};

describe("parseCsv", () => {
  it("parses headers and rows, trims headers, skips blank lines", () => {
    const csv = "Email , Name\njohn@acme.com,John Smith\n\nmary@acme.com,Mary\n";
    const parsed = parseCsv(csv);
    expect(parsed.headers).toEqual(["Email", "Name"]);
    expect(parsed.rows).toHaveLength(2);
  });

  it("throws when there are no columns", () => {
    expect(() => parseCsv("")).toThrow();
  });
});

describe("suggestMapping", () => {
  it("fuzzy-matches common header variants and custom fields", () => {
    const m = suggestMapping(["E-Mail", "Full Name", "First Name", "Company"], defs);
    expect(m.email).toBe("E-Mail");
    expect(m.name).toBe("Full Name");
    expect(m.firstName).toBe("First Name");
    expect(m.fields.company).toBe("Company");
  });
});

describe("deriveName (forgiving)", () => {
  it("prefers explicit name", () => {
    expect(deriveName("Operations Team", "", "", "ops@acme.com")).toBe("Operations Team");
  });
  it("composes from first + last when no explicit name", () => {
    expect(deriveName("", "Jane", "Doe", "j@acme.com")).toBe("Jane Doe");
  });
  it("accepts a single token", () => {
    expect(deriveName("Mary", "", "", "mary@acme.com")).toBe("Mary");
  });
  it("falls back to the email local part", () => {
    expect(deriveName("", "", "", "procurement@acme.com")).toBe("procurement");
  });
});

describe("classifyRows", () => {
  const parsed = {
    headers: ["Email", "Name", "First", "Last", "Company", "Tier", "Seats"],
    rows: [
      { Email: "john@acme.com", Name: "John Smith", First: "", Last: "", Company: "Acme", Tier: "Gold", Seats: "5" },
      { Email: "MARY@acme.com", Name: "Mary", First: "", Last: "", Company: "", Tier: "", Seats: "" }, // single-word, ok
      { Email: "ops", Name: "Operations Team", First: "", Last: "", Company: "", Tier: "", Seats: "" }, // bad email
      { Email: "john@acme.com", Name: "John Again", First: "", Last: "", Company: "", Tier: "", Seats: "" }, // in-file dup
      { Email: "exists@acme.com", Name: "Already Here", First: "", Last: "", Company: "", Tier: "", Seats: "" }, // in-list dup
      { Email: "bad@acme.com", Name: "Bad Tier", First: "", Last: "", Company: "", Tier: "Bronze", Seats: "" }, // invalid select
    ],
  };

  const result = classifyRows(parsed, mapping, defs, new Set(["exists@acme.com"]), new Set(["john@acme.com"]));

  it("counts each class correctly", () => {
    expect(result.summary.total).toBe(6);
    expect(result.summary.valid).toBe(2); // john + mary
    expect(result.summary.invalid).toBe(2); // bad email + bad tier
    expect(result.summary.duplicate).toBe(2); // in-file john + in-list exists
  });

  it("lowercases email and accepts single-token names", () => {
    const mary = result.rows[1];
    expect(mary.status).toBe("valid");
    expect(mary.data?.email).toBe("mary@acme.com");
    expect(mary.data?.name).toBe("Mary");
  });

  it("flags an invalid email and a bad typed value", () => {
    expect(result.rows[2].status).toBe("invalid");
    expect(result.rows[5].status).toBe("invalid");
    expect(result.rows[5].errors[0]).toMatch(/Tier/);
  });

  it("marks file vs list duplicate scope", () => {
    expect(result.rows[3].status).toBe("duplicate");
    expect(result.rows[3].duplicateScope).toBe("file");
    expect(result.rows[4].status).toBe("duplicate");
    expect(result.rows[4].duplicateScope).toBe("list");
  });

  it("emits a cross-list warning without failing the row", () => {
    expect(result.rows[0].warnings.some((w) => /another list/i.test(w))).toBe(true);
    expect(result.rows[0].status).toBe("valid");
  });
});

describe("selectForCommit", () => {
  const parsed = {
    headers: ["Email", "Name"],
    rows: [
      { Email: "a@acme.com", Name: "A" }, // valid
      { Email: "dupe@acme.com", Name: "Dupe" }, // list dup
      { Email: "skip@acme.com", Name: "Skip" }, // valid but excluded
    ],
  };
  const m: ImportMapping = { email: "Email", name: "Name", fields: {} };
  const { rows } = classifyRows(parsed, m, [], new Set(["dupe@acme.com"]));

  it("skips list duplicates under the skip policy", () => {
    const { inserts, updates } = selectForCommit(rows, new Set(), "skip");
    expect(inserts.map((i) => i.email)).toEqual(["a@acme.com", "skip@acme.com"]);
    expect(updates).toHaveLength(0);
  });

  it("updates list duplicates under the update policy", () => {
    const { inserts, updates } = selectForCommit(rows, new Set(), "update");
    expect(updates.map((u) => u.email)).toEqual(["dupe@acme.com"]);
  });

  it("honors excluded row indices", () => {
    const { inserts } = selectForCommit(rows, new Set([2]), "skip");
    expect(inserts.map((i) => i.email)).toEqual(["a@acme.com"]);
  });
});
