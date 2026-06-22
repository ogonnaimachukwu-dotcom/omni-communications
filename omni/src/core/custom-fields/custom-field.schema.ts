import { z } from "zod";

export const customFieldTypeEnum = z.enum(["text", "number", "date", "select", "boolean"]);
export type CustomFieldType = z.infer<typeof customFieldTypeEnum>;

export interface FieldDef {
  key: string;
  label: string;
  type: CustomFieldType;
  options?: string[];
}

export const idSchema = z.string().uuid("Invalid field id");

export const createCustomFieldSchema = z.object({
  key: z
    .string({ required_error: "Enter a field key" })
    .trim()
    .min(1, "Enter a field key")
    .max(40, "Key must be 40 characters or fewer")
    .regex(/^[a-z][a-z0-9_]*$/, "Key must start with a letter and contain only lowercase letters, numbers, and underscores"),
  label: z
    .string({ required_error: "Enter a label" })
    .trim()
    .min(1, "Enter a label")
    .max(60, "Label must be 60 characters or fewer"),
  type: customFieldTypeEnum.default("text"),
  options: z.array(z.string().trim().min(1).max(100)).optional(),
});
export type CreateCustomFieldInput = z.infer<typeof createCustomFieldSchema>;

export const updateCustomFieldSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  type: customFieldTypeEnum.optional(),
  options: z.array(z.string().trim().min(1).max(100)).optional(),
});
export type UpdateCustomFieldInput = z.infer<typeof updateCustomFieldSchema>;

/* ---- Value validation ------------------------------------------------- */

type ValidationResult = { ok: true; value: string } | { ok: false; error: string };

export function validateCustomValue(def: FieldDef, raw: string): ValidationResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: "" };

  switch (def.type) {
    case "text": {
      if (trimmed.length > 1000) return { ok: false, error: `${def.label} is too long (max 1000 characters)` };
      return { ok: true, value: trimmed };
    }
    case "number": {
      const n = Number(trimmed);
      if (isNaN(n) || trimmed !== String(n)) return { ok: false, error: `${def.label} must be a valid number` };
      return { ok: true, value: String(n) };
    }
    case "date": {
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) return { ok: false, error: `${def.label} must be a valid date` };
      const iso = d.toISOString().slice(0, 10);
      return { ok: true, value: iso };
    }
    case "boolean": {
      const lower = trimmed.toLowerCase();
      if (["true", "yes", "1", "y"].includes(lower)) return { ok: true, value: "true" };
      if (["false", "no", "0", "n"].includes(lower)) return { ok: true, value: "false" };
      return { ok: false, error: `${def.label} must be true or false` };
    }
    case "select": {
      const options = def.options ?? [];
      const match = options.find((o) => o.toLowerCase() === trimmed.toLowerCase());
      if (!match) return { ok: false, error: `${def.label} must be one of: ${options.join(", ")}` };
      return { ok: true, value: match };
    }
    default:
      return { ok: true, value: trimmed };
  }
}
