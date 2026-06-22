import { z } from "zod";

export const distributorStatusEnum = z.enum([
  "subscribed",
  "unsubscribed",
  "bounced",
  "complained",
]);
export type DistributorStatus = z.infer<typeof distributorStatusEnum>;

export const distributorViewEnum = z.enum(["active", "archived", "trash"]);
export type DistributorView = z.infer<typeof distributorViewEnum>;

export const idSchema = z.string().uuid("Invalid distributor id");

export const createDistributorSchema = z.object({
  listId: z.string().uuid(),
  email: z.string().trim().email("Enter a valid email").max(320),
  name: z.string().trim().min(1, "Enter a name").max(200),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  fields: z.record(z.string()).default({}),
  tagIds: z.array(z.string().uuid()).default([]),
});
export type CreateDistributorInput = z.infer<typeof createDistributorSchema>;

export const updateDistributorSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(320),
  name: z.string().trim().min(1, "Enter a name").max(200),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  fields: z.record(z.string()).default({}),
  tagIds: z.array(z.string().uuid()).default([]),
});
export type UpdateDistributorInput = z.infer<typeof updateDistributorSchema>;

export const bulkActionSchema = z.object({
  action: z.enum(["archive", "unarchive", "delete", "restore", "tag", "untag"]),
  ids: z.array(z.string().uuid()).min(1, "Select at least one distributor"),
  tagId: z.string().uuid().optional(),
});
export type BulkActionInput = z.infer<typeof bulkActionSchema>;

export const listDistributorsQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  listId: z.string().uuid().optional().catch(undefined),
  tagId: z.string().uuid().optional().catch(undefined),
  subscription: distributorStatusEnum.optional().catch(undefined),
  view: distributorViewEnum.default("active").catch("active" as const),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20).default(20),
});
export type ListDistributorsQuery = z.infer<typeof listDistributorsQuerySchema>;

type RawSearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseListDistributorsQuery(raw: RawSearchParams): ListDistributorsQuery {
  return listDistributorsQuerySchema.parse({
    q: first(raw.q),
    listId: first(raw.listId),
    tagId: first(raw.tagId),
    subscription: first(raw.subscription),
    view: first(raw.view),
    page: first(raw.page),
    pageSize: first(raw.pageSize),
  });
}
