/**
 * CSV import parsing, column mapping, and row classification engine.
 * This module is deliberately DB-free — all DB interaction lives in
 * distributor.repository.ts and import.repository.ts.
 */

import Papa from "papaparse";
import { validateCustomValue, type FieldDef } from "@/core/custom-fields/custom-field.schema";

/* ---- Types ------------------------------------------------------------ */

export interface ImportMapping {
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  fields: Record<string, string>; // custom-field key → CSV header
}

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export type RowStatus = "valid" | "duplicate" | "invalid";

export interface ClassifiedRow {
  rowIndex: number;
  status: RowStatus;
  duplicateScope?: "file" | "list";
  email: string;
  data: {
    email: string;
    name: string;
    firstName: string | null;
    lastName: string | null;
    fields: Record<string, string>;
  } | null;
  errors: string[];
  warnings: string[];
}

export interface ImportSummary {
  total: number;
  valid: number;
  duplicate: number;
  invalid: number;
}

/* ---- Parsing ---------------------------------------------------------- */

export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (!result.meta.fields || result.meta.fields.length === 0) {
    throw new Error("No columns found in the CSV. Check the file format.");
  }
  return { headers: result.meta.fields, rows: result.data };
}

/* ---- Column mapping --------------------------------------------------- */

const EMAIL_ALIASES = ["email", "e-mail", "email_address", "emailaddress", "mail"];
const NAME_ALIASES = ["name", "full_name", "fullname", "full name", "display_name"];
const FIRST_ALIASES = ["first_name", "firstname", "first name", "given_name", "first"];
const LAST_ALIASES = ["last_name", "lastname", "last name", "surname", "family_name", "last"];

function fuzzyMatch(header: string, aliases: string[]): boolean {
  const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, "");
  return aliases.some((a) => {
    const norm = a.toLowerCase().replace(/[^a-z0-9]/g, "");
    return normalized === norm;
  });
}

export function suggestMapping(headers: string[], defs: FieldDef[]): ImportMapping {
  const find = (aliases: string[]) => headers.find((h) => fuzzyMatch(h, aliases));

  const mapping: ImportMapping = {
    email: find(EMAIL_ALIASES) ?? headers[0],
    name: find(NAME_ALIASES),
    firstName: find(FIRST_ALIASES),
    lastName: find(LAST_ALIASES),
    fields: {},
  };

  for (const def of defs) {
    const match = headers.find(
      (h) => h.toLowerCase() === def.key.toLowerCase() || h.toLowerCase() === def.label.toLowerCase(),
    );
    if (match) mapping.fields[def.key] = match;
  }

  return mapping;
}

/* ---- Name derivation -------------------------------------------------- */

export function deriveName(
  name: string | undefined,
  firstName: string | undefined,
  lastName: string | undefined,
  email: string,
): string {
  const trimmed = (name ?? "").trim();
  if (trimmed) return trimmed;

  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  const composed = [first, last].filter(Boolean).join(" ");
  if (composed) return composed;

  const local = email.split("@")[0] ?? email;
  return local;
}

/* ---- Row classification ----------------------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function classifyRows(
  parsed: ParsedCsv,
  mapping: ImportMapping,
  defs: FieldDef[],
  existingInList?: Set<string>,
  existingInOtherLists?: Set<string>,
): { rows: ClassifiedRow[]; summary: ImportSummary } {
  const seenEmails = new Set<string>();
  const rows: ClassifiedRow[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const raw = parsed.rows[i];
    const errors: string[] = [];
    const warnings: string[] = [];

    const rawEmail = (raw[mapping.email] ?? "").trim().toLowerCase();
    if (!rawEmail || !EMAIL_RE.test(rawEmail)) {
      rows.push({
        rowIndex: i,
        status: "invalid",
        email: rawEmail,
        data: null,
        errors: ["Invalid or missing email address"],
        warnings: [],
      });
      continue;
    }

    // Check for file-level duplicates
    if (seenEmails.has(rawEmail)) {
      rows.push({
        rowIndex: i,
        status: "duplicate",
        duplicateScope: "file",
        email: rawEmail,
        data: null,
        errors: [],
        warnings: [],
      });
      continue;
    }
    seenEmails.add(rawEmail);

    // Check for list-level duplicates
    if (existingInList?.has(rawEmail)) {
      const rawName = mapping.name ? (raw[mapping.name] ?? "").trim() : "";
      const rawFirst = mapping.firstName ? (raw[mapping.firstName] ?? "").trim() : "";
      const rawLast = mapping.lastName ? (raw[mapping.lastName] ?? "").trim() : "";
      const name = deriveName(rawName, rawFirst, rawLast, rawEmail);

      const fields: Record<string, string> = {};
      for (const [key, header] of Object.entries(mapping.fields)) {
        const val = (raw[header] ?? "").trim();
        if (val) fields[key] = val;
      }

      rows.push({
        rowIndex: i,
        status: "duplicate",
        duplicateScope: "list",
        email: rawEmail,
        data: {
          email: rawEmail,
          name,
          firstName: rawFirst || null,
          lastName: rawLast || null,
          fields,
        },
        errors: [],
        warnings: [],
      });
      continue;
    }

    // Cross-list warning
    if (existingInOtherLists?.has(rawEmail)) {
      warnings.push("This email exists in another list in this project");
    }

    // Extract and validate fields
    const rawName = mapping.name ? (raw[mapping.name] ?? "").trim() : "";
    const rawFirst = mapping.firstName ? (raw[mapping.firstName] ?? "").trim() : "";
    const rawLast = mapping.lastName ? (raw[mapping.lastName] ?? "").trim() : "";
    const name = deriveName(rawName, rawFirst, rawLast, rawEmail);

    const fields: Record<string, string> = {};
    let fieldInvalid = false;
    for (const [key, header] of Object.entries(mapping.fields)) {
      const val = (raw[header] ?? "").trim();
      if (!val) continue;
      const def = defs.find((d) => d.key === key);
      if (def) {
        const result = validateCustomValue(def, val);
        if (result.ok) {
          if (result.value) fields[key] = result.value;
        } else {
          errors.push(`${def.label}: ${result.error}`);
          fieldInvalid = true;
        }
      } else {
        fields[key] = val;
      }
    }

    if (fieldInvalid) {
      rows.push({
        rowIndex: i,
        status: "invalid",
        email: rawEmail,
        data: null,
        errors,
        warnings,
      });
      continue;
    }

    rows.push({
      rowIndex: i,
      status: "valid",
      email: rawEmail,
      data: {
        email: rawEmail,
        name,
        firstName: rawFirst || null,
        lastName: rawLast || null,
        fields,
      },
      errors,
      warnings,
    });
  }

  const summary: ImportSummary = {
    total: rows.length,
    valid: rows.filter((r) => r.status === "valid").length,
    duplicate: rows.filter((r) => r.status === "duplicate").length,
    invalid: rows.filter((r) => r.status === "invalid").length,
  };

  return { rows, summary };
}

/* ---- Commit selection ------------------------------------------------- */

export function selectForCommit(
  rows: ClassifiedRow[],
  excludedIndices: Set<number>,
  duplicatePolicy: "skip" | "update",
) {
  const inserts: NonNullable<ClassifiedRow["data"]>[] = [];
  const updates: NonNullable<ClassifiedRow["data"]>[] = [];

  for (const row of rows) {
    if (excludedIndices.has(row.rowIndex)) continue;
    if (row.status === "invalid") continue;
    if (!row.data) continue;

    if (row.status === "duplicate" && row.duplicateScope === "list") {
      if (duplicatePolicy === "update") updates.push(row.data);
      continue;
    }
    if (row.status === "duplicate" && row.duplicateScope === "file") continue;

    inserts.push(row.data);
  }

  return { inserts, updates };
}
