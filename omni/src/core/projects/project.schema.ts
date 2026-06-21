import { z } from "zod";

/* =========================================================================
 * Project status — mirrors the `project_status` pgEnum shipped in the
 * Batch 1 schema (src/db/schema.ts). Kept in lockstep deliberately: this is
 * the single source of truth the forms, actions, and service validate against.
 * ====================================================================== */
export const projectStatusEnum = z.enum(["active", "archived"]);
export type ProjectStatus = z.infer<typeof projectStatusEnum>;

/**
 * Optional free-text field: trims, caps length, and treats an empty/blank
 * submission as "not provided" (undefined) so the service can null the column
 * rather than persist empty strings.
 */
const optionalText = (max: number, label: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .trim()
      .max(max, `${label} must be ${max} characters or fewer`)
      .optional(),
  );

const nameField = z
  .string({ required_error: "Enter a project name" })
  .trim()
  .min(1, "Enter a project name")
  .max(120, "Project name must be 120 characters or fewer");

/* ---- Mutations -------------------------------------------------------- */

export const createProjectSchema = z.object({
  name: nameField,
  companyName: optionalText(160, "Company"),
  ceoName: optionalText(120, "CEO name"),
  notes: optionalText(2000, "Notes"),
  status: projectStatusEnum.default("active"),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

// Settings form submits the full record, so the same shape applies on update.
export const updateProjectSchema = createProjectSchema;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const setStatusSchema = z.object({ status: projectStatusEnum });
export type SetStatusInput = z.infer<typeof setStatusSchema>;

export const idSchema = z.string().uuid("Invalid project id");

/* ---- Listing / search ------------------------------------------------- */

export const listProjectsQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  status: projectStatusEnum.optional().catch(undefined),
  trash: z.preprocess((v) => v === "1" || v === "true", z.boolean()).default(false),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20).default(20),
});
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

type RawSearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Parse Next.js `searchParams` into a validated, defaulted query. Every field
 * has a default or `.catch`, so this never throws on malformed input — bad
 * params simply fall back to sane values.
 */
export function parseListProjectsQuery(raw: RawSearchParams): ListProjectsQuery {
  return listProjectsQuerySchema.parse({
    q: first(raw.q),
    status: first(raw.status),
    trash: first(raw.trash),
    page: first(raw.page),
    pageSize: first(raw.pageSize),
  });
}
